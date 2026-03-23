#pragma once

#include <chrono>
#include <memory>
#include <optional>
#include <string>

namespace drogon::orm {
class DbClient;
using DbClientPtr = std::shared_ptr<DbClient>;
}

namespace deliveryoptimizer::api::jobs {

struct OptimizeRequestInput;

enum class JobStatus {
  kQueued,
  kRunning,
  kSucceeded,
  kFailed,
};

enum class SubmitJobDisposition {
  kCreated,
  kExisting,
  kConflict,
  kOverloaded,
};

struct JobRecord {
  std::string job_id;
  std::string idempotency_key;
  std::string request_hash;
  std::string request_payload_text;
  JobStatus status{JobStatus::kQueued};
  std::optional<std::string> result_payload_text;
  std::optional<std::string> error_code;
  std::optional<std::string> error_message;
  int attempt_count{0};
  int max_attempts{0};
  std::optional<std::string> worker_id;
  std::optional<std::chrono::sys_seconds> lease_expires_at;
  std::chrono::sys_seconds created_at;
  std::optional<std::chrono::sys_seconds> started_at;
  std::optional<std::chrono::sys_seconds> completed_at;
  std::chrono::sys_seconds expires_at;
};

struct SubmitJobResult {
  SubmitJobDisposition disposition{SubmitJobDisposition::kCreated};
  std::optional<JobRecord> job;
};

class JobStore {
public:
  explicit JobStore(drogon::orm::DbClientPtr client);

  bool Ping() const;

  bool UpdateWorkerHeartbeat(const std::string& worker_id, bool healthy,
                             const std::string& detail,
                             std::chrono::sys_seconds heartbeat_at) const;

  bool HasHealthyWorker(std::chrono::sys_seconds now, std::chrono::seconds max_age) const;

  SubmitJobResult SubmitJob(const std::string& idempotency_key, const OptimizeRequestInput& input,
                            int max_attempts, int retention_seconds, int queue_cap) const;

  std::optional<JobRecord> FindJobById(const std::string& job_id) const;

  std::optional<JobRecord> ClaimNextJob(const std::string& worker_id, int lease_seconds,
                                        int max_attempts) const;

  bool MarkJobSucceeded(const std::string& job_id, const std::string& worker_id,
                        const std::string& result_payload_text,
                        std::chrono::sys_seconds completed_at,
                        std::chrono::sys_seconds expires_at) const;

  bool MarkJobFailed(const std::string& job_id, const std::string& worker_id,
                     const std::string& error_code, const std::string& error_message,
                     std::chrono::sys_seconds completed_at,
                     std::chrono::sys_seconds expires_at) const;

  bool MarkExpiredClaimFailed(const std::string& job_id, const std::string& worker_id,
                              const std::string& error_code, const std::string& error_message,
                              std::chrono::sys_seconds completed_at,
                              std::chrono::sys_seconds expires_at) const;

  std::size_t CleanupExpiredJobs(std::chrono::sys_seconds now) const;

private:
  drogon::orm::DbClientPtr client_;
};

std::string GenerateJobId();

std::string ToString(JobStatus status);

} // namespace deliveryoptimizer::api::jobs
