#include "deliveryoptimizer/api/jobs/worker.hpp"

#include "deliveryoptimizer/api/jobs/job_store.hpp"
#include "deliveryoptimizer/api/jobs/optimize_job.hpp"
#include "deliveryoptimizer/api/jobs/runtime_options.hpp"
#include "deliveryoptimizer/api/jobs/vroom_runner.hpp"

#include <atomic>
#include <chrono>
#include <csignal>
#include <drogon/orm/DbClient.h>
#include <iostream>
#include <json/json.h>
#include <memory>
#include <string>
#include <thread>
#include <unistd.h>
#include <utility>
#include <vector>

namespace {

std::atomic_bool g_should_stop{false};

void HandleWorkerSignal(const int /*signal_number*/) {
  g_should_stop.store(true);
}

std::string BuildWorkerId(const std::size_t index) {
  std::array<char, 256> hostname{};
  (void)gethostname(hostname, sizeof(hostname));
  return std::string{hostname} + ":" + std::to_string(getpid()) + ":" + std::to_string(index);
}

void RunWorkerLoop(const std::shared_ptr<deliveryoptimizer::api::jobs::JobStore>& job_store,
                   const deliveryoptimizer::api::jobs::RuntimeOptions& runtime_options,
                   const deliveryoptimizer::api::jobs::VroomRuntimeConfig& vroom_config,
                   const std::string& worker_id) {
  const int lease_seconds =
      runtime_options.job_lease_seconds.value_or(vroom_config.timeout_seconds + 10);
  const auto poll_interval =
      std::chrono::milliseconds{runtime_options.worker_poll_interval_ms};

  while (!g_should_stop.load()) {
    try {
      const auto claimed_job =
          job_store->ClaimNextJob(worker_id, lease_seconds, runtime_options.job_max_attempts);
      if (!claimed_job.has_value()) {
        std::this_thread::sleep_for(poll_interval);
        continue;
      }

      const auto parsed_request = deliveryoptimizer::api::jobs::ParseStoredOptimizeRequest(
          claimed_job->request_payload_text);
      const auto now = std::chrono::time_point_cast<std::chrono::seconds>(
          std::chrono::system_clock::now());
      const auto expires_at = now + std::chrono::seconds{runtime_options.job_retention_seconds};

      if (!parsed_request.has_value()) {
        (void)job_store->MarkJobFailed(claimed_job->job_id, worker_id, "invalid_stored_request",
                                       "Stored optimize request payload is invalid.", now,
                                       expires_at);
        continue;
      }

      const Json::Value vroom_input =
          deliveryoptimizer::api::jobs::BuildVroomInput(parsed_request.value());
      const auto vroom_result =
          deliveryoptimizer::api::jobs::RunVroom(vroom_input, vroom_config);
      if (vroom_result.status == deliveryoptimizer::api::jobs::VroomRunStatus::kTimedOut) {
        (void)job_store->MarkJobFailed(claimed_job->job_id, worker_id, "solver_timeout",
                                       "Routing optimization timed out.", now, expires_at);
        continue;
      }

      if (!vroom_result.output.has_value()) {
        (void)job_store->MarkJobFailed(claimed_job->job_id, worker_id, "solver_failed",
                                       "Routing optimization failed.", now, expires_at);
        continue;
      }

      const Json::Value result = deliveryoptimizer::api::jobs::BuildSuccessOptimizeResult(
          parsed_request.value(), *vroom_result.output);
      (void)job_store->MarkJobSucceeded(
          claimed_job->job_id, worker_id,
          deliveryoptimizer::api::jobs::SerializeJsonCompact(result), now, expires_at);
    } catch (const std::exception& exception) {
      std::cerr << "Worker loop error: " << exception.what() << "\n";
      std::this_thread::sleep_for(poll_interval);
    }
  }
}

void RunCleanupLoop(const std::shared_ptr<deliveryoptimizer::api::jobs::JobStore>& job_store) {
  using namespace std::chrono_literals;

  while (!g_should_stop.load()) {
    try {
      const auto now = std::chrono::time_point_cast<std::chrono::seconds>(
          std::chrono::system_clock::now());
      (void)job_store->CleanupExpiredJobs(now);
    } catch (const std::exception& exception) {
      std::cerr << "Cleanup loop error: " << exception.what() << "\n";
    }

    for (int step = 0; step < 60 && !g_should_stop.load(); ++step) {
      std::this_thread::sleep_for(1s);
    }
  }
}

} // namespace

namespace deliveryoptimizer::api::jobs {

int RunWorker() {
  const RuntimeOptions runtime_options = LoadRuntimeOptionsFromEnv();
  const VroomRuntimeConfig vroom_config = ResolveVroomRuntimeConfigFromEnv();

  auto client =
      drogon::orm::DbClient::newPgClient(runtime_options.database_url,
                                         runtime_options.worker_db_connections);
  if (!client) {
    std::cerr << "Failed to create PostgreSQL client for worker.\n";
    return 1;
  }

  auto job_store = std::make_shared<JobStore>(std::move(client));
  if (!job_store->Ping()) {
    std::cerr << "Worker cannot reach PostgreSQL.\n";
    return 1;
  }

  std::signal(SIGINT, HandleWorkerSignal);
  std::signal(SIGTERM, HandleWorkerSignal);

  std::vector<std::thread> threads;
  threads.reserve(static_cast<std::size_t>(runtime_options.worker_concurrency) + 1U);
  for (int index = 0; index < runtime_options.worker_concurrency; ++index) {
    threads.emplace_back(RunWorkerLoop, job_store, runtime_options, vroom_config,
                         BuildWorkerId(static_cast<std::size_t>(index)));
  }
  threads.emplace_back(RunCleanupLoop, job_store);

  for (auto& thread : threads) {
    thread.join();
  }

  return 0;
}

int RunWorkerHealthcheck() {
  const RuntimeOptions runtime_options = LoadRuntimeOptionsFromEnv();
  auto client =
      drogon::orm::DbClient::newPgClient(runtime_options.database_url,
                                         runtime_options.worker_db_connections);
  if (!client) {
    return 1;
  }

  JobStore job_store{std::move(client)};
  if (!job_store.Ping() || !IsVroomBinaryAvailable()) {
    return 1;
  }

  return 0;
}

} // namespace deliveryoptimizer::api::jobs
