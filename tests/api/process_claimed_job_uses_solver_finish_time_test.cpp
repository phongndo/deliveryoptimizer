#include "deliveryoptimizer/api/jobs/optimize_job.hpp"
#include "deliveryoptimizer/api/jobs/runtime_options.hpp"
#include "deliveryoptimizer/api/jobs/vroom_runner.hpp"
#include "jobs/worker_execution.hpp"

#include <gtest/gtest.h>

#include <chrono>
#include <optional>
#include <string>

int RunGoogleTests(int argc, char** argv) {
  ::testing::InitGoogleTest(&argc, argv);
  return RUN_ALL_TESTS();
}

int main(int argc, char** argv) { return RunGoogleTests(argc, argv); }

int test_main(int argc, char** argv) { return RunGoogleTests(argc, argv); }

namespace {

using deliveryoptimizer::api::jobs::BuildCanonicalRequestString;
using deliveryoptimizer::api::jobs::ClaimedJobExecutionHooks;
using deliveryoptimizer::api::jobs::Coordinate;
using deliveryoptimizer::api::jobs::JobInput;
using deliveryoptimizer::api::jobs::JobRecord;
using deliveryoptimizer::api::jobs::JobStatus;
using deliveryoptimizer::api::jobs::OptimizeRequestInput;
using deliveryoptimizer::api::jobs::ProcessClaimedJob;
using deliveryoptimizer::api::jobs::RuntimeOptions;
using deliveryoptimizer::api::jobs::VehicleInput;
using deliveryoptimizer::api::jobs::VroomRunResult;
using deliveryoptimizer::api::jobs::VroomRunStatus;
using deliveryoptimizer::api::jobs::VroomRuntimeConfig;

OptimizeRequestInput BuildRequest() {
  return OptimizeRequestInput{
      .depot_lon = 7.4236,
      .depot_lat = 43.7384,
      .vehicles = {{
          .external_id = "vehicle-1",
          .capacity = 8,
          .start = Coordinate{.lon = 7.4236, .lat = 43.7384},
          .end = Coordinate{.lon = 7.4236, .lat = 43.7384},
      }},
      .jobs = {{
          .external_id = "job-1",
          .lon = 7.4212,
          .lat = 43.7308,
          .demand = 2,
          .service = 180,
      }},
  };
}

TEST(WorkerExecutionTest, SolverTimeoutUsesFinishTimeForCompletionAndRetentionWindow) {
  const auto started_at = std::chrono::sys_seconds{std::chrono::seconds{100}};
  const auto finished_at = std::chrono::sys_seconds{std::chrono::seconds{130}};

  const JobRecord claimed_job{
      .job_id = "job-1",
      .idempotency_key = "key-1",
      .request_hash = "hash-1",
      .request_payload_text = BuildCanonicalRequestString(BuildRequest()),
      .status = JobStatus::kRunning,
      .created_at = started_at,
      .expires_at = started_at + std::chrono::hours{1},
  };

  const RuntimeOptions runtime_options{
      .database_url = "unused",
      .api_db_connections = 1U,
      .worker_db_connections = 1U,
      .worker_concurrency = 1,
      .job_max_attempts = 3,
      .job_retention_seconds = 60,
      .job_queue_cap = 10,
      .worker_poll_interval_ms = 100,
      .job_lease_seconds = std::nullopt,
  };
  const VroomRuntimeConfig vroom_config{
      .vroom_bin = "/bin/false",
      .vroom_router = "osrm",
      .vroom_host = "127.0.0.1",
      .vroom_port = "5001",
      .timeout_seconds = 30,
  };

  auto fake_now = started_at;
  std::optional<std::string> failure_code;
  std::optional<std::chrono::sys_seconds> completed_at;
  std::optional<std::chrono::sys_seconds> expires_at;

  const ClaimedJobExecutionHooks hooks{
      .run_vroom =
          [&](const Json::Value&, const VroomRuntimeConfig&) {
            fake_now = finished_at;
            return VroomRunResult{
                .status = VroomRunStatus::kTimedOut,
                .output = std::nullopt,
            };
          },
      .now = [&] { return fake_now; },
      .mark_job_succeeded =
          [&](const std::string&, const std::chrono::sys_seconds,
              const std::chrono::sys_seconds) {
            ADD_FAILURE() << "unexpected success";
            return false;
          },
      .mark_job_failed =
          [&](const std::string& error_code, const std::string&,
              const std::chrono::sys_seconds failure_completed_at,
              const std::chrono::sys_seconds failure_expires_at) {
            failure_code = error_code;
            completed_at = failure_completed_at;
            expires_at = failure_expires_at;
            return true;
          },
  };

  ProcessClaimedJob(claimed_job, runtime_options, vroom_config, hooks);

  ASSERT_EQ(failure_code, std::optional<std::string>{"solver_timeout"});
  ASSERT_TRUE(completed_at.has_value());
  ASSERT_TRUE(expires_at.has_value());
  EXPECT_EQ(*completed_at, finished_at);
  EXPECT_EQ(*expires_at, finished_at + std::chrono::seconds{runtime_options.job_retention_seconds});
}

} // namespace
