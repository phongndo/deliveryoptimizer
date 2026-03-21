#pragma once

#include <chrono>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace Json {
class Value;
}

namespace deliveryoptimizer::api::jobs {

struct Coordinate {
  double lon;
  double lat;
};

struct TimeWindow {
  std::chrono::sys_seconds start;
  std::chrono::sys_seconds end;
};

struct VehicleInput {
  std::string external_id;
  int capacity;
  std::optional<Coordinate> start;
  std::optional<Coordinate> end;
  std::optional<TimeWindow> time_window;
};

struct JobInput {
  std::string external_id;
  double lon;
  double lat;
  int demand;
  int service;
  std::optional<std::vector<TimeWindow>> time_windows;
};

struct OptimizeRequestInput {
  double depot_lon;
  double depot_lat;
  std::vector<VehicleInput> vehicles;
  std::vector<JobInput> jobs;
};

struct SolverError {
  std::string code;
  std::string message;
};

std::optional<OptimizeRequestInput> ParseOptimizeRequest(const Json::Value& root,
                                                         Json::Value& issues);

std::optional<OptimizeRequestInput> ParseStoredOptimizeRequest(const std::string_view payload_text);

Json::Value BuildCanonicalOptimizeRequest(const OptimizeRequestInput& input);

std::string SerializeJsonCompact(const Json::Value& value);

std::string BuildCanonicalRequestString(const OptimizeRequestInput& input);

std::string ComputeFnv1a64Hex(std::string_view text);

Json::Value BuildVroomInput(const OptimizeRequestInput& input);

Json::Value BuildSuccessOptimizeResult(const OptimizeRequestInput& input,
                                       const Json::Value& vroom_output);

Json::Value BuildFailedJobError(const SolverError& error);

std::string FormatEpochSecondsIso8601(std::chrono::sys_seconds timestamp);

} // namespace deliveryoptimizer::api::jobs
