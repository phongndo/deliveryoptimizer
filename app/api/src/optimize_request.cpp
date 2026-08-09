#include "deliveryoptimizer/api/optimize_request.hpp"

#include "deliveryoptimizer/api/deliveries_optimize_limits.hpp"

#include <chrono>
#include <charconv>
#include <cmath>
#include <cstdint>
#include <limits>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace {

constexpr int kDefaultJobServiceSeconds = 300;
constexpr double kMinLongitude = -180.0;
constexpr double kMaxLongitude = 180.0;
constexpr double kMinLatitude = -90.0;
constexpr double kMaxLatitude = 90.0;
constexpr std::string_view kCoordinateValidationMessage =
    "must be an array [lon, lat] with longitude in [-180, 180] and latitude in [-90, 90].";
constexpr Json::ArrayIndex kMaxOptimizeVehicles =
    static_cast<Json::ArrayIndex>(deliveryoptimizer::api::kMaxDeliveriesOptimizeVehicles);
constexpr Json::ArrayIndex kMaxOptimizeJobs =
    static_cast<Json::ArrayIndex>(deliveryoptimizer::api::kMaxDeliveriesOptimizeJobs);

void AddValidationIssue(Json::Value& issues, const std::string_view field,
                        const std::string_view message) {
  Json::Value issue{Json::objectValue};
  issue["field"] = std::string{field};
  issue["message"] = std::string{message};
  issues.append(issue);
}

[[nodiscard]] std::string BuildMaxItemsMessage(const Json::ArrayIndex max_items) {
  return "must contain at most " + std::to_string(static_cast<unsigned long long>(max_items)) +
         " items.";
}

[[nodiscard]] std::optional<deliveryoptimizer::api::Coordinate>
ParseCoordinate(const Json::Value& value) {
  if (!value.isArray() || value.size() != 2U || !value[0].isNumeric() || !value[1].isNumeric()) {
    return std::nullopt;
  }

  const double lon = value[0].asDouble();
  const double lat = value[1].asDouble();
  if (!std::isfinite(lon) || !std::isfinite(lat) || lon < kMinLongitude || lon > kMaxLongitude ||
      lat < kMinLatitude || lat > kMaxLatitude) {
    return std::nullopt;
  }

  return deliveryoptimizer::api::Coordinate{.lon = lon, .lat = lat};
}

[[nodiscard]] std::optional<int> ParseBoundedInt(const Json::Value& value, const int min_value) {
  if (value.isInt64()) {
    const Json::Int64 parsed = value.asInt64();
    if (parsed < static_cast<Json::Int64>(min_value) ||
        parsed > static_cast<Json::Int64>(std::numeric_limits<int>::max())) {
      return std::nullopt;
    }

    return static_cast<int>(parsed);
  }

  if (value.isUInt64()) {
    const Json::UInt64 parsed = value.asUInt64();
    if (parsed < static_cast<Json::UInt64>(min_value) ||
        parsed > static_cast<Json::UInt64>(std::numeric_limits<int>::max())) {
      return std::nullopt;
    }

    return static_cast<int>(parsed);
  }

  return std::nullopt;
}

[[nodiscard]] std::optional<std::chrono::sys_seconds>
ParseNonNegativeEpochSeconds(const Json::Value& value) {
  if (value.isInt64()) {
    const Json::Int64 parsed = value.asInt64();
    if (parsed < 0) {
      return std::nullopt;
    }

    return std::chrono::sys_seconds{std::chrono::seconds{static_cast<std::int64_t>(parsed)}};
  }

  if (value.isUInt64()) {
    const Json::UInt64 parsed = value.asUInt64();
    if (parsed > static_cast<Json::UInt64>(std::numeric_limits<std::int64_t>::max())) {
      return std::nullopt;
    }

    return std::chrono::sys_seconds{
        std::chrono::seconds{static_cast<std::int64_t>(parsed)},
    };
  }

  return std::nullopt;
}

[[nodiscard]] std::optional<std::uint64_t> ParsePositiveId(const Json::Value& value) {
  if (value.isUInt64()) {
    const Json::UInt64 parsed = value.asUInt64();
    if (parsed > 0U) {
      return static_cast<std::uint64_t>(parsed);
    }
    return std::nullopt;
  }

  if (value.isInt64()) {
    const Json::Int64 parsed = value.asInt64();
    if (parsed > 0) {
      return static_cast<std::uint64_t>(parsed);
    }
  }

  return std::nullopt;
}

[[nodiscard]] std::optional<deliveryoptimizer::api::TimeWindow>
ParseTimeWindow(const Json::Value& value) {
  if (!value.isArray() || value.size() != 2U) {
    return std::nullopt;
  }

  const auto parsed_start = ParseNonNegativeEpochSeconds(value[0]);
  const auto parsed_end = ParseNonNegativeEpochSeconds(value[1]);
  if (!parsed_start.has_value() || !parsed_end.has_value() ||
      parsed_end.value() <= parsed_start.value()) {
    return std::nullopt;
  }

  return deliveryoptimizer::api::TimeWindow{
      .start = parsed_start.value(),
      .end = parsed_end.value(),
  };
}

[[nodiscard]] std::optional<std::vector<deliveryoptimizer::api::TimeWindow>>
ParseTimeWindows(const Json::Value& value) {
  if (!value.isArray() || value.empty()) {
    return std::nullopt;
  }

  std::vector<deliveryoptimizer::api::TimeWindow> windows;
  windows.reserve(value.size());
  for (Json::ArrayIndex index = 0U; index < value.size(); ++index) {
    const auto parsed_window = ParseTimeWindow(value[index]);
    if (!parsed_window.has_value()) {
      return std::nullopt;
    }
    windows.push_back(parsed_window.value());
  }

  return windows;
}

[[nodiscard]] std::optional<deliveryoptimizer::api::VehicleInput>
ParseVehicle(const Json::Value& vehicle, const std::string_view base_field, Json::Value& issues) {
  if (!vehicle.isObject()) {
    AddValidationIssue(issues, base_field, "must be an object.");
    return std::nullopt;
  }

  const Json::Value& vehicle_id = vehicle["id"];
  const Json::Value& capacity = vehicle["capacity"];
  const Json::Value& start = vehicle["start"];
  const Json::Value& end = vehicle["end"];
  const Json::Value& time_window = vehicle["time_window"];

  bool valid_vehicle = true;
  std::string external_id;
  std::optional<deliveryoptimizer::api::Coordinate> start_coordinate;
  std::optional<deliveryoptimizer::api::Coordinate> end_coordinate;
  std::optional<deliveryoptimizer::api::TimeWindow> vehicle_time_window;

  if (!vehicle_id.isString() || vehicle_id.asString().empty()) {
    AddValidationIssue(issues, std::string{base_field} + ".id", "must be a non-empty string.");
    valid_vehicle = false;
  } else {
    external_id = vehicle_id.asString();
  }

  const auto parsed_capacity = ParseBoundedInt(capacity, 1);
  if (!parsed_capacity.has_value()) {
    AddValidationIssue(issues, std::string{base_field} + ".capacity",
                       "must be a positive integer.");
    valid_vehicle = false;
  }

  if (vehicle.isMember("start")) {
    start_coordinate = ParseCoordinate(start);
    if (!start_coordinate.has_value()) {
      AddValidationIssue(issues, std::string{base_field} + ".start", kCoordinateValidationMessage);
      valid_vehicle = false;
    }
  }

  if (vehicle.isMember("end")) {
    end_coordinate = ParseCoordinate(end);
    if (!end_coordinate.has_value()) {
      AddValidationIssue(issues, std::string{base_field} + ".end", kCoordinateValidationMessage);
      valid_vehicle = false;
    }
  }

  if (vehicle.isMember("time_window")) {
    vehicle_time_window = ParseTimeWindow(time_window);
    if (!vehicle_time_window.has_value()) {
      AddValidationIssue(
          issues, std::string{base_field} + ".time_window",
          "must be an array [start, end] with non-negative integer values and end > start.");
      valid_vehicle = false;
    }
  }

  if (!valid_vehicle) {
    return std::nullopt;
  }

  return deliveryoptimizer::api::VehicleInput{.external_id = std::move(external_id),
                                              .capacity = parsed_capacity.value(),
                                              .start = start_coordinate,
                                              .end = end_coordinate,
                                              .time_window = vehicle_time_window};
}

[[nodiscard]] std::optional<deliveryoptimizer::api::JobInput>
ParseJob(const Json::Value& job, const std::string_view base_field, Json::Value& issues) {
  if (!job.isObject()) {
    AddValidationIssue(issues, base_field, "must be an object.");
    return std::nullopt;
  }

  const Json::Value& job_id = job["id"];
  const Json::Value& location = job["location"];
  const Json::Value& time_windows = job["time_windows"];

  bool valid_job = true;
  std::string external_id;
  if (!job_id.isString() || job_id.asString().empty()) {
    AddValidationIssue(issues, std::string{base_field} + ".id", "must be a non-empty string.");
    valid_job = false;
  } else {
    external_id = job_id.asString();
  }

  const auto parsed_location = ParseCoordinate(location);
  if (!parsed_location.has_value()) {
    AddValidationIssue(issues, std::string{base_field} + ".location", kCoordinateValidationMessage);
    valid_job = false;
  }

  int parsed_demand = 1;
  if (job.isMember("demand")) {
    const auto parsed_demand_value = ParseBoundedInt(job["demand"], 1);
    if (!parsed_demand_value.has_value()) {
      AddValidationIssue(issues, std::string{base_field} + ".demand",
                         "must be a positive integer.");
      valid_job = false;
    } else {
      parsed_demand = parsed_demand_value.value();
    }
  }

  int parsed_service = kDefaultJobServiceSeconds;
  std::optional<std::vector<deliveryoptimizer::api::TimeWindow>> parsed_time_windows;
  if (job.isMember("service")) {
    const auto parsed_service_value = ParseBoundedInt(job["service"], 0);
    if (!parsed_service_value.has_value()) {
      AddValidationIssue(issues, std::string{base_field} + ".service",
                         "must be a non-negative integer.");
      valid_job = false;
    } else {
      parsed_service = parsed_service_value.value();
    }
  }

  if (job.isMember("time_windows")) {
    parsed_time_windows = ParseTimeWindows(time_windows);
    if (!parsed_time_windows.has_value()) {
      AddValidationIssue(issues, std::string{base_field} + ".time_windows",
                         "must be an array of [start, end] pairs with non-negative integer values "
                         "and end > start.");
      valid_job = false;
    }
  }

  if (!valid_job) {
    return std::nullopt;
  }

  return deliveryoptimizer::api::JobInput{.external_id = std::move(external_id),
                                          .lon = parsed_location->lon,
                                          .lat = parsed_location->lat,
                                          .demand = parsed_demand,
                                          .service = parsed_service,
                                          .time_windows = std::move(parsed_time_windows)};
}

void ParseDepot(const Json::Value& root, deliveryoptimizer::api::OptimizeRequestInput& parsed_input,
                Json::Value& issues) {
  const Json::Value& depot = root["depot"];
  if (!depot.isObject()) {
    AddValidationIssue(issues, "depot", "is required and must be an object.");
    return;
  }

  const auto depot_coordinate = ParseCoordinate(depot["location"]);
  if (!depot_coordinate.has_value()) {
    AddValidationIssue(issues, "depot.location", kCoordinateValidationMessage);
    return;
  }

  parsed_input.depot_lon = depot_coordinate->lon;
  parsed_input.depot_lat = depot_coordinate->lat;
}

void ParseVehicles(const Json::Value& root,
                   deliveryoptimizer::api::OptimizeRequestInput& parsed_input,
                   Json::Value& issues) {
  const Json::Value& vehicles = root["vehicles"];
  if (!vehicles.isArray()) {
    AddValidationIssue(issues, "vehicles", "is required and must be a non-empty array.");
    return;
  }

  if (vehicles.empty()) {
    AddValidationIssue(issues, "vehicles", "must not be empty.");
    return;
  }
  if (vehicles.size() > kMaxOptimizeVehicles) {
    AddValidationIssue(issues, "vehicles", BuildMaxItemsMessage(kMaxOptimizeVehicles));
    return;
  }

  for (Json::ArrayIndex index = 0U; index < vehicles.size(); ++index) {
    const std::string base_field = "vehicles[" + std::to_string(index) + "]";
    const auto parsed_vehicle = ParseVehicle(vehicles[index], base_field, issues);
    if (parsed_vehicle.has_value()) {
      parsed_input.vehicles.push_back(parsed_vehicle.value());
    }
  }
}

void ParseJobs(const Json::Value& root, deliveryoptimizer::api::OptimizeRequestInput& parsed_input,
               Json::Value& issues) {
  const Json::Value& jobs = root["jobs"];
  if (!jobs.isArray()) {
    AddValidationIssue(issues, "jobs", "is required and must be a non-empty array.");
    return;
  }

  if (jobs.empty()) {
    AddValidationIssue(issues, "jobs", "must not be empty.");
    return;
  }
  if (jobs.size() > kMaxOptimizeJobs) {
    AddValidationIssue(issues, "jobs", BuildMaxItemsMessage(kMaxOptimizeJobs));
    return;
  }

  for (Json::ArrayIndex index = 0U; index < jobs.size(); ++index) {
    const std::string base_field = "jobs[" + std::to_string(index) + "]";
    const auto parsed_job = ParseJob(jobs[index], base_field, issues);
    if (parsed_job.has_value()) {
      parsed_input.jobs.push_back(parsed_job.value());
    }
  }
}

// VROOM emits 1-based contiguous ids that match the payload we built, so a
// vector indexed by (id - 1) replaces the std::map + string-copy lookup. The
// const char* pointers stay valid because the input outlives the response build
// (jsoncpp's operator=(const char*) copies the text into the Value).
[[nodiscard]] std::vector<const char*>
BuildExternalIdVector(const std::vector<deliveryoptimizer::api::VehicleInput>& vehicles) {
  std::vector<const char*> ids;
  ids.reserve(vehicles.size());
  for (const auto& vehicle : vehicles) {
    ids.push_back(vehicle.external_id.c_str());
  }
  return ids;
}

[[nodiscard]] std::vector<const char*>
BuildExternalIdVector(const std::vector<deliveryoptimizer::api::JobInput>& jobs) {
  std::vector<const char*> ids;
  ids.reserve(jobs.size());
  for (const auto& job : jobs) {
    ids.push_back(job.external_id.c_str());
  }
  return ids;
}

void ApplyExternalIdsToRoutes(Json::Value& routes,
                              const std::vector<const char*>& vehicle_ids,
                              const std::vector<const char*>& job_ids) {
  for (Json::ArrayIndex route_index = 0U; route_index < routes.size(); ++route_index) {
    Json::Value& route = routes[route_index];
    if (!route.isObject()) {
      continue;
    }
    const auto vehicle_id = ParsePositiveId(route["vehicle"]);
    if (vehicle_id.has_value() && *vehicle_id > 0U &&
        *vehicle_id <= static_cast<std::uint64_t>(vehicle_ids.size())) {
      route["vehicle_external_id"] = vehicle_ids[*vehicle_id - 1U];
    }

    Json::Value& steps = route["steps"];
    if (!steps.isArray()) {
      continue;
    }

    for (Json::ArrayIndex step_index = 0U; step_index < steps.size(); ++step_index) {
      Json::Value& step = steps[step_index];
      if (!step.isObject()) {
        continue;
      }
      const auto job_id = ParsePositiveId(step["job"]);
      if (!job_id.has_value() || *job_id == 0U ||
          *job_id > static_cast<std::uint64_t>(job_ids.size())) {
        continue;
      }

      step["job_external_id"] = job_ids[*job_id - 1U];
    }
  }
}

void ApplyExternalIdsToUnassigned(Json::Value& unassigned,
                                  const std::vector<const char*>& job_ids) {
  for (Json::ArrayIndex index = 0U; index < unassigned.size(); ++index) {
    Json::Value& job = unassigned[index];
    if (!job.isObject()) {
      continue;
    }
    const auto job_id = ParsePositiveId(job["id"]);
    if (!job_id.has_value() || *job_id == 0U ||
        *job_id > static_cast<std::uint64_t>(job_ids.size())) {
      continue;
    }

    job["job_external_id"] = job_ids[*job_id - 1U];
  }
}

} // namespace

namespace deliveryoptimizer::api {

std::optional<ParsedOptimizeRequest> ParseAndValidateOptimizeRequest(const Json::Value& root,
                                                                     Json::Value& issues) {
  issues = Json::Value{Json::arrayValue};
  if (!root.isObject()) {
    AddValidationIssue(issues, "body", "must be a JSON object.");
    return std::nullopt;
  }

  OptimizeRequestInput parsed_input{};
  ParseDepot(root, parsed_input, issues);
  ParseVehicles(root, parsed_input, issues);
  ParseJobs(root, parsed_input, issues);

  if (!issues.empty()) {
    return std::nullopt;
  }

  const SolveRequestSize request_size{
      .jobs = parsed_input.jobs.size(),
      .vehicles = parsed_input.vehicles.size(),
  };
  return ParsedOptimizeRequest{
      .input = std::move(parsed_input),
      .size = request_size,
  };
}

std::optional<SolveRequestSize> TryParseOptimizeRequestSize(const Json::Value& root) {
  if (!root.isObject()) {
    return std::nullopt;
  }

  const Json::Value& vehicles = root["vehicles"];
  const Json::Value& jobs = root["jobs"];
  if (!vehicles.isArray() || !jobs.isArray()) {
    return std::nullopt;
  }

  if (vehicles.size() > kMaxOptimizeVehicles || jobs.size() > kMaxOptimizeJobs) {
    return std::nullopt;
  }

  return SolveRequestSize{
      .jobs = static_cast<std::size_t>(jobs.size()),
      .vehicles = static_cast<std::size_t>(vehicles.size()),
  };
}

void AppendJsonString(std::string& output, const std::string_view value) {
  output.push_back('"');
  for (const char ch : value) {
    switch (ch) {
    case '"':
      output += "\\\"";
      break;
    case '\\':
      output += "\\\\";
      break;
    case '\b':
      output += "\\b";
      break;
    case '\f':
      output += "\\f";
      break;
    case '\n':
      output += "\\n";
      break;
    case '\r':
      output += "\\r";
      break;
    case '\t':
      output += "\\t";
      break;
    default:
      if (static_cast<unsigned char>(ch) < 0x20U) {
        constexpr char kHexDigits[] = "0123456789abcdef";
        output += "\\u00";
        output.push_back(kHexDigits[(static_cast<unsigned char>(ch) >> 4U) & 0x0FU]);
        output.push_back(kHexDigits[static_cast<unsigned char>(ch) & 0x0FU]);
      } else {
        output.push_back(ch);
      }
      break;
    }
  }
  output.push_back('"');
}

template <typename Integer>
void AppendJsonInteger(std::string& output, const Integer value) {
  // to_chars only supports the core integer types; widen narrow ones first.
  const auto widened = static_cast<std::int64_t>(value);
  char buffer[32];
  const auto [end, error] = std::to_chars(buffer, buffer + sizeof(buffer), widened);
  if (error == std::errc{}) {
    output.append(buffer, end);
  } else {
    output.append(std::to_string(widened));
  }
}

void AppendJsonDouble(std::string& output, const double value) {
  char buffer[32];
  const auto [end, error] = std::to_chars(buffer, buffer + sizeof(buffer), value);
  if (error == std::errc{}) {
    output.append(buffer, end);
  } else {
    output.append(std::to_string(value));
  }
}

void AppendJsonTimeWindow(std::string& output, const deliveryoptimizer::api::TimeWindow& window) {
  output.push_back('[');
  AppendJsonInteger(output, window.start.time_since_epoch().count());
  output.push_back(',');
  AppendJsonInteger(output, window.end.time_since_epoch().count());
  output.push_back(']');
}

std::string BuildVroomInputText(const deliveryoptimizer::api::OptimizeRequestInput& input,
                                const int service_adjustment_seconds) {
  std::string payload;
  // Rough upper bound: ~90 bytes per job, ~130 bytes per vehicle, plus fixed keys.
  payload.reserve(input.jobs.size() * 96U + input.vehicles.size() * 140U + 64U);
  payload += "{\"jobs\":[";

  for (std::size_t index = 0U; index < input.jobs.size(); ++index) {
    const JobInput& job_input = input.jobs[index];
    if (index != 0U) {
      payload.push_back(',');
    }
    payload += "{\"id\":";
    AppendJsonInteger(payload, index + 1U);
    payload += ",\"location\":[";
    AppendJsonDouble(payload, job_input.lon);
    payload.push_back(',');
    AppendJsonDouble(payload, job_input.lat);
    payload += "],\"amount\":[";
    AppendJsonInteger(payload, job_input.demand);
    payload += "],\"service\":";
    AppendJsonInteger(payload, job_input.service + service_adjustment_seconds);
    payload += ",\"description\":";
    AppendJsonString(payload, job_input.external_id);
    if (job_input.time_windows.has_value()) {
      payload += ",\"time_windows\":[";
      const auto& windows = job_input.time_windows.value();
      for (std::size_t window_index = 0U; window_index < windows.size(); ++window_index) {
        if (window_index != 0U) {
          payload.push_back(',');
        }
        AppendJsonTimeWindow(payload, windows[window_index]);
      }
      payload.push_back(']');
    }
    payload.push_back('}');
  }

  payload += "],\"vehicles\":[";
  for (std::size_t index = 0U; index < input.vehicles.size(); ++index) {
    const VehicleInput& vehicle_input = input.vehicles[index];
    if (index != 0U) {
      payload.push_back(',');
    }
    const Coordinate start = vehicle_input.start.value_or(Coordinate{
        .lon = input.depot_lon,
        .lat = input.depot_lat,
    });
    const Coordinate end = vehicle_input.end.value_or(Coordinate{
        .lon = input.depot_lon,
        .lat = input.depot_lat,
    });
    payload += "{\"id\":";
    AppendJsonInteger(payload, index + 1U);
    payload += ",\"start\":[";
    AppendJsonDouble(payload, start.lon);
    payload.push_back(',');
    AppendJsonDouble(payload, start.lat);
    payload += "],\"end\":[";
    AppendJsonDouble(payload, end.lon);
    payload.push_back(',');
    AppendJsonDouble(payload, end.lat);
    payload += "],\"capacity\":[";
    AppendJsonInteger(payload, vehicle_input.capacity);
    payload += "],\"description\":";
    AppendJsonString(payload, vehicle_input.external_id);
    if (vehicle_input.time_window.has_value()) {
      payload += ",\"time_window\":";
      AppendJsonTimeWindow(payload, vehicle_input.time_window.value());
    }
    payload.push_back('}');
  }

  payload += "]}";
  return payload;
}

Json::Value BuildOptimizeSuccessBody(const OptimizeRequestInput& input,
                                     Json::Value vroom_output,
                                     const std::optional<Json::Value>& forecast) {
  Json::Value body{Json::objectValue};
  body["status"] = "ok";

  Json::Value summary = std::move(vroom_output["summary"]);
  body["summary"] = summary.isObject() ? std::move(summary) : Json::Value{Json::objectValue};

  Json::Value routes = std::move(vroom_output["routes"]);
  if (!routes.isArray()) {
    routes = Json::Value{Json::arrayValue};
  }
  Json::Value unassigned = std::move(vroom_output["unassigned"]);
  if (!unassigned.isArray()) {
    unassigned = Json::Value{Json::arrayValue};
  }

  const auto vehicle_ids = BuildExternalIdVector(input.vehicles);
  const auto job_ids = BuildExternalIdVector(input.jobs);
  ApplyExternalIdsToRoutes(routes, vehicle_ids, job_ids);
  ApplyExternalIdsToUnassigned(unassigned, job_ids);
  body["routes"] = std::move(routes);
  body["unassigned"] = std::move(unassigned);
  if (forecast.has_value()) {
    body["forecast"] = *forecast;
  }

  return body;
}

} // namespace deliveryoptimizer::api
