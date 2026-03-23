#include "worker_execution.hpp"

#include "deliveryoptimizer/api/jobs/optimize_job.hpp"

#include <chrono>
#include <utility>

namespace deliveryoptimizer::api::jobs {

void ProcessClaimedJob(const JobRecord& claimed_job, const RuntimeOptions& runtime_options,
                       const VroomRuntimeConfig& vroom_config,
                       const ClaimedJobExecutionHooks& hooks) {
  const auto parsed_request = ParseStoredOptimizeRequest(claimed_job.request_payload_text);

  if (!parsed_request.has_value()) {
    const auto now = hooks.now();
    const auto expires_at = now + std::chrono::seconds{runtime_options.job_retention_seconds};
    (void)hooks.mark_job_failed("invalid_stored_request", "Stored optimize request payload is invalid.",
                                now, expires_at);
    return;
  }

  const Json::Value vroom_input = BuildVroomInput(parsed_request.value());
  const auto vroom_result = hooks.run_vroom(vroom_input, vroom_config);
  const auto completed_at = hooks.now();
  const auto expires_at =
      completed_at + std::chrono::seconds{runtime_options.job_retention_seconds};
  if (vroom_result.status == VroomRunStatus::kTimedOut) {
    (void)hooks.mark_job_failed("solver_timeout", "Routing optimization timed out.", completed_at,
                                expires_at);
    return;
  }

  if (!vroom_result.output.has_value()) {
    (void)hooks.mark_job_failed("solver_failed", "Routing optimization failed.", completed_at,
                                expires_at);
    return;
  }

  const Json::Value result =
      BuildSuccessOptimizeResult(parsed_request.value(), *vroom_result.output);
  (void)hooks.mark_job_succeeded(SerializeJsonCompact(result), completed_at, expires_at);
}

} // namespace deliveryoptimizer::api::jobs
