#include "deliveryoptimizer/api/jobs/job_store.hpp"

#include "deliveryoptimizer/api/jobs/optimize_job.hpp"

#include <boost/uuid/random_generator.hpp>
#include <boost/uuid/uuid_io.hpp>
#include <drogon/orm/DbClient.h>
#include <optional>
#include <stdexcept>
#include <string>
#include <utility>

namespace {

using deliveryoptimizer::api::jobs::JobRecord;
using deliveryoptimizer::api::jobs::JobStatus;
using deliveryoptimizer::api::jobs::OptimizeRequestInput;
using deliveryoptimizer::api::jobs::SubmitJobDisposition;
using deliveryoptimizer::api::jobs::SubmitJobResult;

[[nodiscard]] std::chrono::sys_seconds ToEpochSeconds(const long long epoch_seconds) {
  return std::chrono::sys_seconds{std::chrono::seconds{epoch_seconds}};
}

[[nodiscard]] std::optional<std::chrono::sys_seconds>
OptionalEpochSeconds(const drogon::orm::Field& field) {
  if (field.isNull()) {
    return std::nullopt;
  }
  return ToEpochSeconds(field.as<long long>());
}

[[nodiscard]] JobStatus ParseJobStatus(const std::string_view status) {
  if (status == "queued") {
    return JobStatus::kQueued;
  }
  if (status == "running") {
    return JobStatus::kRunning;
  }
  if (status == "succeeded") {
    return JobStatus::kSucceeded;
  }
  if (status == "failed") {
    return JobStatus::kFailed;
  }

  throw std::runtime_error("Unknown job status.");
}

constexpr std::string_view kJobSelectColumns =
    "job_id, idempotency_key, request_hash, request_payload::text AS request_payload_text, "
    "status, result_payload::text AS result_payload_text, error_code, error_message, "
    "attempt_count, max_attempts, worker_id, lease_expires_at_epoch, created_at_epoch, "
    "started_at_epoch, completed_at_epoch, expires_at_epoch";

constexpr std::string_view kQualifiedJobReturningColumns =
    "optimization_jobs.job_id AS job_id, "
    "optimization_jobs.idempotency_key AS idempotency_key, "
    "optimization_jobs.request_hash AS request_hash, "
    "optimization_jobs.request_payload::text AS request_payload_text, "
    "optimization_jobs.status AS status, "
    "optimization_jobs.result_payload::text AS result_payload_text, "
    "optimization_jobs.error_code AS error_code, "
    "optimization_jobs.error_message AS error_message, "
    "optimization_jobs.attempt_count AS attempt_count, "
    "optimization_jobs.max_attempts AS max_attempts, "
    "optimization_jobs.worker_id AS worker_id, "
    "optimization_jobs.lease_expires_at_epoch AS lease_expires_at_epoch, "
    "optimization_jobs.created_at_epoch AS created_at_epoch, "
    "optimization_jobs.started_at_epoch AS started_at_epoch, "
    "optimization_jobs.completed_at_epoch AS completed_at_epoch, "
    "optimization_jobs.expires_at_epoch AS expires_at_epoch";

[[nodiscard]] JobRecord ReadJobRecord(const drogon::orm::Row& row) {
  JobRecord job;
  job.job_id = row["job_id"].as<std::string>();
  job.idempotency_key = row["idempotency_key"].as<std::string>();
  job.request_hash = row["request_hash"].as<std::string>();
  job.request_payload_text = row["request_payload_text"].as<std::string>();
  job.status = ParseJobStatus(row["status"].as<std::string>());
  if (!row["result_payload_text"].isNull()) {
    job.result_payload_text = row["result_payload_text"].as<std::string>();
  }
  if (!row["error_code"].isNull()) {
    job.error_code = row["error_code"].as<std::string>();
  }
  if (!row["error_message"].isNull()) {
    job.error_message = row["error_message"].as<std::string>();
  }
  job.attempt_count = row["attempt_count"].as<int>();
  job.max_attempts = row["max_attempts"].as<int>();
  if (!row["worker_id"].isNull()) {
    job.worker_id = row["worker_id"].as<std::string>();
  }
  job.lease_expires_at = OptionalEpochSeconds(row["lease_expires_at_epoch"]);
  job.created_at = ToEpochSeconds(row["created_at_epoch"].as<long long>());
  job.started_at = OptionalEpochSeconds(row["started_at_epoch"]);
  job.completed_at = OptionalEpochSeconds(row["completed_at_epoch"]);
  job.expires_at = ToEpochSeconds(row["expires_at_epoch"].as<long long>());
  return job;
}

template <typename ClientT>
std::optional<JobRecord> FindJobByColumn(ClientT& client, const std::string& column_name,
                                         const std::string& value) {
  const auto result = client.execSqlSync(
      "SELECT " + std::string{kJobSelectColumns} +
          " FROM optimization_jobs WHERE " + column_name + " = $1 LIMIT 1",
      value);
  if (result.empty()) {
    return std::nullopt;
  }

  return ReadJobRecord(result[0]);
}

} // namespace

namespace deliveryoptimizer::api::jobs {

JobStore::JobStore(drogon::orm::DbClientPtr client) : client_(std::move(client)) {}

bool JobStore::Ping() const {
  try {
    (void)client_->execSqlSync("SELECT 1");
    return true;
  } catch (...) {
    return false;
  }
}

SubmitJobResult JobStore::SubmitJob(const std::string& idempotency_key,
                                    const OptimizeRequestInput& input, const int max_attempts,
                                    const int retention_seconds, const int queue_cap) const {
  const std::string canonical_request = BuildCanonicalRequestString(input);
  const std::string request_hash = ComputeFnv1a64Hex(canonical_request);
  const std::chrono::sys_seconds now =
      std::chrono::time_point_cast<std::chrono::seconds>(std::chrono::system_clock::now());
  const std::chrono::sys_seconds expires_at = now + std::chrono::seconds{retention_seconds};

  auto transaction = client_->newTransaction();
  try {
    const auto existing_result = transaction->execSqlSync(
        "SELECT " + std::string{kJobSelectColumns} +
            " FROM optimization_jobs WHERE idempotency_key = $1 LIMIT 1 FOR UPDATE",
        idempotency_key);
    if (!existing_result.empty()) {
      JobRecord existing_job = ReadJobRecord(existing_result[0]);
      if (existing_job.request_hash != request_hash) {
        return SubmitJobResult{
            .disposition = SubmitJobDisposition::kConflict,
            .job = std::move(existing_job),
        };
      }

      const auto parsed_existing_request =
          ParseStoredOptimizeRequest(existing_job.request_payload_text);
      if (!parsed_existing_request.has_value() ||
          BuildCanonicalRequestString(*parsed_existing_request) != canonical_request) {
        return SubmitJobResult{
            .disposition = SubmitJobDisposition::kConflict,
            .job = std::move(existing_job),
        };
      }

      return SubmitJobResult{
          .disposition = SubmitJobDisposition::kExisting,
          .job = std::move(existing_job),
      };
    }

    const auto queue_result = transaction->execSqlSync(
        "SELECT COUNT(*) AS job_count FROM optimization_jobs WHERE status IN ('queued','running')");
    const int pending_jobs = queue_result[0]["job_count"].as<int>();
    if (pending_jobs >= queue_cap) {
      transaction->rollback();
      return SubmitJobResult{
          .disposition = SubmitJobDisposition::kOverloaded,
          .job = std::nullopt,
      };
    }

    const std::string job_id = GenerateJobId();
    const auto inserted_result = transaction->execSqlSync(
        "INSERT INTO optimization_jobs ("
        "job_id, idempotency_key, request_hash, request_payload, status, "
        "attempt_count, max_attempts, created_at_epoch, expires_at_epoch"
        ") VALUES ($1, $2, $3, CAST($4 AS jsonb), 'queued', 0, $5, $6, $7) "
        "RETURNING " +
            std::string{kJobSelectColumns},
        job_id, idempotency_key, request_hash, canonical_request, max_attempts,
        static_cast<long long>(now.time_since_epoch().count()),
        static_cast<long long>(expires_at.time_since_epoch().count()));

    return SubmitJobResult{
        .disposition = SubmitJobDisposition::kCreated,
        .job = ReadJobRecord(inserted_result[0]),
    };
  } catch (...) {
    transaction->rollback();
    throw;
  }
}

std::optional<JobRecord> JobStore::FindJobById(const std::string& job_id) const {
  return FindJobByColumn(*client_, "job_id", job_id);
}

std::optional<JobRecord> JobStore::ClaimNextJob(const std::string& worker_id, const int lease_seconds,
                                                const int max_attempts) const {
  const std::chrono::sys_seconds now =
      std::chrono::time_point_cast<std::chrono::seconds>(std::chrono::system_clock::now());
  const std::chrono::sys_seconds expires_at = now + std::chrono::hours{24};

  auto transaction = client_->newTransaction();
  try {
    (void)transaction->execSqlSync(
        "UPDATE optimization_jobs "
        "SET status = 'failed', "
        "error_code = 'worker_abandoned', "
        "error_message = 'Job lease expired too many times.', "
        "completed_at_epoch = $1, "
        "expires_at_epoch = $2 "
        "WHERE status = 'running' "
        "AND lease_expires_at_epoch IS NOT NULL "
        "AND lease_expires_at_epoch <= $1 "
        "AND attempt_count >= max_attempts",
        static_cast<long long>(now.time_since_epoch().count()),
        static_cast<long long>(expires_at.time_since_epoch().count()));

    const std::chrono::sys_seconds lease_expires_at = now + std::chrono::seconds{lease_seconds};
    const auto result = transaction->execSqlSync(
        "WITH candidate AS ("
        "  SELECT job_id FROM optimization_jobs "
        "  WHERE status = 'queued' "
        "     OR (status = 'running' "
        "         AND lease_expires_at_epoch IS NOT NULL "
        "         AND lease_expires_at_epoch <= $1 "
        "         AND attempt_count < max_attempts "
        "         AND attempt_count < $4) "
        "  ORDER BY created_at_epoch "
        "  FOR UPDATE SKIP LOCKED "
        "  LIMIT 1"
        ") "
        "UPDATE optimization_jobs "
        "SET status = 'running', "
        "    attempt_count = attempt_count + 1, "
        "    worker_id = $2, "
        "    lease_expires_at_epoch = $3, "
        "    started_at_epoch = COALESCE(started_at_epoch, $1), "
        "    error_code = NULL, "
        "    error_message = NULL "
        "FROM candidate "
        "WHERE optimization_jobs.job_id = candidate.job_id "
        "RETURNING " +
            std::string{kQualifiedJobReturningColumns},
        static_cast<long long>(now.time_since_epoch().count()), worker_id,
        static_cast<long long>(lease_expires_at.time_since_epoch().count()), max_attempts);

    if (result.empty()) {
      return std::nullopt;
    }

    return ReadJobRecord(result[0]);
  } catch (...) {
    transaction->rollback();
    throw;
  }
}

bool JobStore::MarkJobSucceeded(const std::string& job_id, const std::string& worker_id,
                                const std::string& result_payload_text,
                                const std::chrono::sys_seconds completed_at,
                                const std::chrono::sys_seconds expires_at) const {
  const auto result = client_->execSqlSync(
      "UPDATE optimization_jobs "
      "SET status = 'succeeded', "
      "    result_payload = CAST($3 AS jsonb), "
      "    error_code = NULL, "
      "    error_message = NULL, "
      "    lease_expires_at_epoch = NULL, "
      "    completed_at_epoch = $4, "
      "    expires_at_epoch = $5 "
      "WHERE job_id = $1 AND worker_id = $2 AND status = 'running'",
      job_id, worker_id, result_payload_text,
      static_cast<long long>(completed_at.time_since_epoch().count()),
      static_cast<long long>(expires_at.time_since_epoch().count()));
  return result.affectedRows() == 1;
}

bool JobStore::MarkJobFailed(const std::string& job_id, const std::string& worker_id,
                             const std::string& error_code, const std::string& error_message,
                             const std::chrono::sys_seconds completed_at,
                             const std::chrono::sys_seconds expires_at) const {
  const auto result = client_->execSqlSync(
      "UPDATE optimization_jobs "
      "SET status = 'failed', "
      "    error_code = $3, "
      "    error_message = $4, "
      "    lease_expires_at_epoch = NULL, "
      "    completed_at_epoch = $5, "
      "    expires_at_epoch = $6 "
      "WHERE job_id = $1 AND worker_id = $2 AND status = 'running'",
      job_id, worker_id, error_code, error_message,
      static_cast<long long>(completed_at.time_since_epoch().count()),
      static_cast<long long>(expires_at.time_since_epoch().count()));
  return result.affectedRows() == 1;
}

bool JobStore::MarkExpiredClaimFailed(const std::string& job_id, const std::string& worker_id,
                                      const std::string& error_code,
                                      const std::string& error_message,
                                      const std::chrono::sys_seconds completed_at,
                                      const std::chrono::sys_seconds expires_at) const {
  const auto result = client_->execSqlSync(
      "UPDATE optimization_jobs "
      "SET status = 'failed', "
      "    worker_id = $2, "
      "    error_code = $3, "
      "    error_message = $4, "
      "    lease_expires_at_epoch = NULL, "
      "    completed_at_epoch = $5, "
      "    expires_at_epoch = $6 "
      "WHERE job_id = $1 AND status = 'running'",
      job_id, worker_id, error_code, error_message,
      static_cast<long long>(completed_at.time_since_epoch().count()),
      static_cast<long long>(expires_at.time_since_epoch().count()));
  return result.affectedRows() == 1;
}

std::size_t JobStore::CleanupExpiredJobs(const std::chrono::sys_seconds now) const {
  const auto result = client_->execSqlSync(
      "DELETE FROM optimization_jobs WHERE expires_at_epoch <= $1",
      static_cast<long long>(now.time_since_epoch().count()));
  return static_cast<std::size_t>(result.affectedRows());
}

std::string GenerateJobId() {
  static boost::uuids::random_generator generator;
  return boost::uuids::to_string(generator());
}

std::string ToString(const JobStatus status) {
  switch (status) {
  case JobStatus::kQueued:
    return "queued";
  case JobStatus::kRunning:
    return "running";
  case JobStatus::kSucceeded:
    return "succeeded";
  case JobStatus::kFailed:
    return "failed";
  }

  return "failed";
}

} // namespace deliveryoptimizer::api::jobs
