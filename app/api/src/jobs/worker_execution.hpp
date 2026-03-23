#pragma once

#include "deliveryoptimizer/api/jobs/job_store.hpp"
#include "deliveryoptimizer/api/jobs/runtime_options.hpp"
#include "deliveryoptimizer/api/jobs/vroom_runner.hpp"

#include <chrono>
#include <functional>
#include <string>

namespace deliveryoptimizer::api::jobs {

using RunVroomFn = std::function<VroomRunResult(const Json::Value&, const VroomRuntimeConfig&)>;
using WorkerNowFn = std::function<std::chrono::sys_seconds()>;
using MarkJobSucceededFn =
    std::function<bool(const std::string&, std::chrono::sys_seconds, std::chrono::sys_seconds)>;
using MarkJobFailedFn = std::function<bool(const std::string&, const std::string&,
                                           std::chrono::sys_seconds, std::chrono::sys_seconds)>;

struct ClaimedJobExecutionHooks {
  RunVroomFn run_vroom;
  WorkerNowFn now;
  MarkJobSucceededFn mark_job_succeeded;
  MarkJobFailedFn mark_job_failed;
};

void ProcessClaimedJob(const JobRecord& claimed_job, const RuntimeOptions& runtime_options,
                       const VroomRuntimeConfig& vroom_config,
                       const ClaimedJobExecutionHooks& hooks);

} // namespace deliveryoptimizer::api::jobs
