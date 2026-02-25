#include "deliveryoptimizer/api/endpoints/health_endpoint.hpp"

#include <cstdlib>
#include <drogon/drogon.h>
#include <filesystem>
#include <string>
#include <string_view>
#include <utility>

namespace {

constexpr std::string_view kDefaultVroomBin = "/usr/local/bin/vroom";
constexpr std::string_view kDefaultOsrmUrl = "http://127.0.0.1:5001";
constexpr std::string_view kOsrmProbePath =
    "/nearest/v1/driving/7.4236,43.7384?number=1&generate_hints=false";
constexpr double kOsrmProbeTimeoutSeconds = 4.0;

struct OsrmProbeResult {
  bool ready;
  std::string detail;
};

[[nodiscard]] std::string ResolveEnvOrDefault(const char* key,
                                              const std::string_view default_value) {
  const char* raw_value = std::getenv(key);
  if (raw_value == nullptr || *raw_value == '\0') {
    return std::string{default_value};
  }

  return std::string{raw_value};
}

[[nodiscard]] std::string ResolveOsrmBaseUrl() {
  std::string osrm_base_url = ResolveEnvOrDefault("OSRM_URL", kDefaultOsrmUrl);
  if (!osrm_base_url.empty() && osrm_base_url.back() == '/') {
    osrm_base_url.pop_back();
  }
  if (osrm_base_url.empty()) {
    return std::string{kDefaultOsrmUrl};
  }
  return osrm_base_url;
}

[[nodiscard]] bool IsVroomBinaryReady() {
  const std::string vroom_bin = ResolveEnvOrDefault("VROOM_BIN", kDefaultVroomBin);
  std::error_code error;
  const bool exists = std::filesystem::exists(vroom_bin, error);
  return exists && !error;
}

[[nodiscard]] OsrmProbeResult EvaluateOsrmProbe(const drogon::ReqResult result,
                                                const drogon::HttpResponsePtr& response) {
  if (result != drogon::ReqResult::Ok) {
    return OsrmProbeResult{.ready = false, .detail = drogon::to_string(result)};
  }

  if (response == nullptr) {
    return OsrmProbeResult{.ready = false, .detail = "empty response"};
  }

  if (response->statusCode() != drogon::k200OK) {
    return OsrmProbeResult{.ready = false,
                           .detail =
                               "HTTP " + std::to_string(static_cast<int>(response->statusCode()))};
  }

  const auto& parsed_json = response->getJsonObject();
  if (!parsed_json) {
    const std::string& parse_error = response->getJsonError();
    if (parse_error.empty()) {
      return OsrmProbeResult{.ready = false, .detail = "invalid JSON"};
    }
    return OsrmProbeResult{.ready = false, .detail = parse_error};
  }

  const Json::Value& code = (*parsed_json)["code"];
  if (!code.isString()) {
    return OsrmProbeResult{.ready = false, .detail = "missing code field"};
  }

  const std::string code_text = code.asString();
  if (code_text != "Ok") {
    return OsrmProbeResult{.ready = false, .detail = code_text};
  }

  return OsrmProbeResult{.ready = true, .detail = code_text};
}

[[nodiscard]] drogon::HttpResponsePtr BuildHealthResponse(const bool vroom_ready,
                                                          const OsrmProbeResult& osrm_probe) {
  Json::Value body{Json::objectValue};
  const bool overall_ready = vroom_ready && osrm_probe.ready;
  body["status"] = overall_ready ? "ok" : "degraded";

  Json::Value checks{Json::objectValue};
  checks["vroom_binary"] = vroom_ready ? "ok" : "missing";
  checks["osrm"] = osrm_probe.ready ? "ok" : "down";
  checks["osrm_detail"] = osrm_probe.detail;
  body["checks"] = checks;

  auto response = drogon::HttpResponse::newHttpJsonResponse(body);
  response->setStatusCode(overall_ready ? drogon::k200OK : drogon::k503ServiceUnavailable);
  return response;
}

} // namespace

namespace deliveryoptimizer::api {

void RegisterHealthEndpoint(drogon::HttpAppFramework& app) {
  app.registerHandler(
      "/health", [](const drogon::HttpRequestPtr& /*request*/,
                    std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
        const bool vroom_ready = IsVroomBinaryReady();
        auto osrm_client = drogon::HttpClient::newHttpClient(ResolveOsrmBaseUrl());
        auto osrm_probe_request = drogon::HttpRequest::newHttpRequest();
        osrm_probe_request->setMethod(drogon::Get);
        osrm_probe_request->setPath(std::string{kOsrmProbePath});

        osrm_client->sendRequest(
            osrm_probe_request,
            [osrm_client = std::move(osrm_client), vroom_ready, callback = std::move(callback)](
                const drogon::ReqResult result, const drogon::HttpResponsePtr& response) mutable {
              (void)osrm_client;
              const OsrmProbeResult osrm_probe = EvaluateOsrmProbe(result, response);
              std::move(callback)(BuildHealthResponse(vroom_ready, osrm_probe));
            },
            kOsrmProbeTimeoutSeconds);
      });
}

} // namespace deliveryoptimizer::api
