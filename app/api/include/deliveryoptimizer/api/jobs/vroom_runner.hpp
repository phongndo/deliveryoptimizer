#pragma once

#include <cstdint>
#include <json/json.h>
#include <optional>
#include <string>
#include <string_view>

namespace deliveryoptimizer::api::jobs {

enum class VroomRunStatus : std::uint8_t {
  kSuccess,
  kFailed,
  kTimedOut,
};

struct VroomRunResult {
  VroomRunStatus status{VroomRunStatus::kFailed};
  std::optional<Json::Value> output;
};

struct VroomRuntimeConfig {
  std::string vroom_bin;
  std::string vroom_router;
  std::string vroom_host;
  std::string vroom_port;
  int timeout_seconds;
};

bool IsVroomBinaryAvailable();

VroomRuntimeConfig ResolveVroomRuntimeConfigFromEnv();

VroomRunResult RunVroom(const Json::Value& input_payload, const VroomRuntimeConfig& runtime_config);

} // namespace deliveryoptimizer::api::jobs
