#include "deliveryoptimizer/api/jobs/worker.hpp"

#include "deliveryoptimizer/api/jobs/job_store.hpp"
#include "deliveryoptimizer/api/jobs/optimize_job.hpp"
#include "deliveryoptimizer/api/jobs/runtime_options.hpp"
#include "deliveryoptimizer/api/jobs/vroom_runner.hpp"
#include "worker_execution.hpp"

#include <array>
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

using namespace std::chrono_literals;

constexpr int kWorkerHeartbeatIntervalSeconds = 5;

std::atomic_bool& ShouldStop() {
  static std::atomic_bool should_stop{false};
  return should_stop;
}

void HandleWorkerSignal(const int /*signal_number*/) {
  ShouldStop().store(true);
}

std::string BuildWorkerIdentity(const std::string& suffix) {
  std::array<char, 256> hostname{};
  if (gethostname(hostname.data(), hostname.size()) != 0) {
    return "unknown-host:" + std::to_string(getpid()) + ":" + suffix;
  }

  hostname.back() = '\0';
  return std::string{hostname.data()} + ":" + std::to_string(getpid()) + ":" + suffix;
}

std::string BuildWorkerId(const std::size_t index) {
  return BuildWorkerIdentity(std::to_string(index));
}

std::string BuildWorkerHeartbeatId() { return BuildWorkerIdentity("heartbeat"); }

void RunWorkerLoop(const std::shared_ptr<deliveryoptimizer::api::jobs::JobStore>& job_store,
                   const deliveryoptimizer::api::jobs::RuntimeOptions& runtime_options,
                   const deliveryoptimizer::api::jobs::VroomRuntimeConfig& vroom_config,
                   const std::string& worker_id) {
  const int lease_seconds =
      runtime_options.job_lease_seconds.value_or(vroom_config.timeout_seconds + 10);
  const auto poll_interval =
      std::chrono::milliseconds{runtime_options.worker_poll_interval_ms};

  while (!ShouldStop().load()) {
    try {
      const auto claimed_job =
          job_store->ClaimNextJob(worker_id, lease_seconds, runtime_options.job_max_attempts);
      if (!claimed_job.has_value()) {
        std::this_thread::sleep_for(poll_interval);
        continue;
      }

      const std::string job_id = claimed_job->job_id;
      deliveryoptimizer::api::jobs::ClaimedJobExecutionHooks execution_hooks{
          .run_vroom = deliveryoptimizer::api::jobs::RunVroom,
          .now =
              [] {
                return std::chrono::time_point_cast<std::chrono::seconds>(
                    std::chrono::system_clock::now());
              },
          .mark_job_succeeded =
              [&](const std::string& result_payload_text, const std::chrono::sys_seconds completed_at,
                  const std::chrono::sys_seconds expires_at) {
                return job_store->MarkJobSucceeded(job_id, worker_id, result_payload_text,
                                                   completed_at, expires_at);
              },
          .mark_job_failed =
              [&](const std::string& error_code, const std::string& error_message,
                  const std::chrono::sys_seconds completed_at,
                  const std::chrono::sys_seconds expires_at) {
                return job_store->MarkJobFailed(job_id, worker_id, error_code, error_message,
                                                completed_at, expires_at);
              },
      };
      deliveryoptimizer::api::jobs::ProcessClaimedJob(*claimed_job, runtime_options, vroom_config,
                                                      execution_hooks);
    } catch (const std::exception& exception) {
      std::cerr << "Worker loop error: " << exception.what() << "\n";
      std::this_thread::sleep_for(poll_interval);
    }
  }
}

void RunCleanupLoop(const std::shared_ptr<deliveryoptimizer::api::jobs::JobStore>& job_store) {
  while (!ShouldStop().load()) {
    try {
      const auto now = std::chrono::time_point_cast<std::chrono::seconds>(
          std::chrono::system_clock::now());
      (void)job_store->CleanupExpiredJobs(now);
    } catch (const std::exception& exception) {
      std::cerr << "Cleanup loop error: " << exception.what() << "\n";
    }

    for (int step = 0; step < 60 && !ShouldStop().load(); ++step) {
      std::this_thread::sleep_for(1s);
    }
  }
}

void RunHeartbeatLoop(const std::shared_ptr<deliveryoptimizer::api::jobs::JobStore>& job_store,
                      const deliveryoptimizer::api::jobs::VroomRuntimeConfig& vroom_config) {
  const std::string worker_id = BuildWorkerHeartbeatId();

  while (!ShouldStop().load()) {
    try {
      const auto now = std::chrono::time_point_cast<std::chrono::seconds>(
          std::chrono::system_clock::now());
      const bool healthy = deliveryoptimizer::api::jobs::IsVroomBinaryAvailable(vroom_config);
      (void)job_store->UpdateWorkerHeartbeat(
          worker_id, healthy, healthy ? "ok" : "vroom unavailable", now);
    } catch (const std::exception& exception) {
      std::cerr << "Heartbeat loop error: " << exception.what() << "\n";
    }

    for (int step = 0; step < kWorkerHeartbeatIntervalSeconds && !ShouldStop().load(); ++step) {
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

  ShouldStop().store(false);
  std::signal(SIGINT, HandleWorkerSignal);
  std::signal(SIGTERM, HandleWorkerSignal);

  std::vector<std::thread> threads;
  threads.reserve(static_cast<std::size_t>(runtime_options.worker_concurrency) + 2U);
  for (int index = 0; index < runtime_options.worker_concurrency; ++index) {
    threads.emplace_back(RunWorkerLoop, job_store, runtime_options, vroom_config,
                         BuildWorkerId(static_cast<std::size_t>(index)));
  }
  threads.emplace_back(RunCleanupLoop, job_store);
  threads.emplace_back(RunHeartbeatLoop, job_store, vroom_config);

  for (auto& thread : threads) {
    thread.join();
  }

  return 0;
}

int RunWorkerHealthcheck() {
  const RuntimeOptions runtime_options = LoadRuntimeOptionsFromEnv();
  const VroomRuntimeConfig vroom_config = ResolveVroomRuntimeConfigFromEnv();
  auto client =
      drogon::orm::DbClient::newPgClient(runtime_options.database_url,
                                         runtime_options.worker_db_connections);
  if (!client) {
    return 1;
  }

  JobStore job_store{std::move(client)};
  if (!job_store.Ping() || !IsVroomBinaryAvailable(vroom_config)) {
    return 1;
  }

  return 0;
}

} // namespace deliveryoptimizer::api::jobs
