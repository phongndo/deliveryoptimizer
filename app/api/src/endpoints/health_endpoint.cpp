#include "deliveryoptimizer/api/endpoints/health_endpoint.hpp"

#include "env_utils.hpp"
#include "job_api_utils.hpp"

#include <chrono>
#include <drogon/drogon.h>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>
#include <utility>

namespace {

constexpr std::string_view kDefaultOsrmUrl = "http://127.0.0.1:5001";
constexpr std::string_view kOsrmProbePath =
    "/nearest/v1/driving/-122.4194,37.7749?number=1&generate_hints=false";
constexpr double kOsrmProbeTimeoutSeconds = 4.0;
constexpr std::chrono::seconds kOsrmProbeCacheTtl{2};
constexpr std::chrono::seconds kWorkerHeartbeatMaxAge{15};

struct DependencyCheck {
  bool ready;
  std::string detail;
};

[[nodiscard]] DependencyCheck CheckDatabase() {
  const auto job_store = deliveryoptimizer::api::GetApiJobStore();
  if (!job_store) {
    return DependencyCheck{.ready = false, .detail = "unavailable"};
  }

  const bool ready = job_store->Ping();
  return DependencyCheck{
      .ready = ready,
      .detail = ready ? "ok" : "down",
  };
}

[[nodiscard]] DependencyCheck CheckWorker() {
  const auto job_store = deliveryoptimizer::api::GetApiJobStore();
  if (!job_store) {
    return DependencyCheck{.ready = false, .detail = "unavailable"};
  }

  try {
    const auto now = std::chrono::time_point_cast<std::chrono::seconds>(
        std::chrono::system_clock::now());
    const bool ready = job_store->HasHealthyWorker(now, kWorkerHeartbeatMaxAge);
    return DependencyCheck{
        .ready = ready,
        .detail = ready ? "ok" : "down",
    };
  } catch (...) {
    return DependencyCheck{.ready = false, .detail = "down"};
  }
}

[[nodiscard]] DependencyCheck EvaluateOsrmProbe(const drogon::ReqResult result,
                                                const drogon::HttpResponsePtr& response) {
  if (result != drogon::ReqResult::Ok) {
    return DependencyCheck{.ready = false, .detail = drogon::to_string(result)};
  }

  if (response == nullptr) {
    return DependencyCheck{.ready = false, .detail = "empty response"};
  }

  if (response->statusCode() != drogon::k200OK) {
    return DependencyCheck{
        .ready = false,
        .detail = "HTTP " + std::to_string(static_cast<int>(response->statusCode())),
    };
  }

  const auto& parsed_json = response->getJsonObject();
  if (!parsed_json) {
    const std::string& parse_error = response->getJsonError();
    return DependencyCheck{
        .ready = false,
        .detail = parse_error.empty() ? "invalid JSON" : parse_error,
    };
  }

  const Json::Value& code = (*parsed_json)["code"];
  if (!code.isString()) {
    return DependencyCheck{.ready = false, .detail = "missing code field"};
  }

  const std::string code_text = code.asString();
  return DependencyCheck{
      .ready = (code_text == "Ok"),
      .detail = code_text,
  };
}

[[nodiscard]] drogon::HttpResponsePtr BuildHealthResponse(const DependencyCheck& database_check,
                                                          const DependencyCheck& worker_check,
                                                          const DependencyCheck& osrm_check) {
  Json::Value body{Json::objectValue};
  const bool overall_ready = database_check.ready && worker_check.ready && osrm_check.ready;
  body["status"] = overall_ready ? "ok" : "degraded";

  Json::Value checks{Json::objectValue};
  checks["database"] = database_check.ready ? "ok" : "down";
  checks["database_detail"] = database_check.detail;
  checks["worker"] = worker_check.ready ? "ok" : "down";
  checks["worker_detail"] = worker_check.detail;
  checks["osrm"] = osrm_check.ready ? "ok" : "down";
  checks["osrm_detail"] = osrm_check.detail;
  body["checks"] = std::move(checks);

  auto response = drogon::HttpResponse::newHttpJsonResponse(body);
  response->setStatusCode(overall_ready ? drogon::k200OK : drogon::k503ServiceUnavailable);
  return response;
}

[[nodiscard]] drogon::HttpClientPtr GetOsrmHttpClient() {
  static drogon::HttpClientPtr client = drogon::HttpClient::newHttpClient(
      deliveryoptimizer::api::ResolveNormalizedUrlEnvOrDefault("OSRM_URL", kDefaultOsrmUrl));
  return client;
}

struct OsrmProbeCache {
  std::mutex mutex;
  std::optional<DependencyCheck> cached_result;
  std::chrono::steady_clock::time_point cached_at{};
};

OsrmProbeCache& GetOsrmProbeCache() {
  static OsrmProbeCache cache;
  return cache;
}

std::optional<DependencyCheck> GetCachedOsrmProbe() {
  auto& cache = GetOsrmProbeCache();

  std::lock_guard<std::mutex> lock(cache.mutex);
  if (!cache.cached_result.has_value()) {
    return std::nullopt;
  }

  if (std::chrono::steady_clock::now() - cache.cached_at > kOsrmProbeCacheTtl) {
    return std::nullopt;
  }

  return cache.cached_result;
}

void CacheOsrmProbe(const DependencyCheck& result) {
  auto& cache = GetOsrmProbeCache();

  std::lock_guard<std::mutex> lock(cache.mutex);
  cache.cached_result = result;
  cache.cached_at = std::chrono::steady_clock::now();
}

} // namespace

namespace deliveryoptimizer::api {

void RegisterHealthEndpoint(drogon::HttpAppFramework& app) {
  app.registerHandler(
      "/health", [](const drogon::HttpRequestPtr& /*request*/,
                    std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
        const DependencyCheck database_check = CheckDatabase();
        const DependencyCheck worker_check = CheckWorker();
        if (const auto cached_probe = GetCachedOsrmProbe()) {
          std::move(callback)(BuildHealthResponse(database_check, worker_check, *cached_probe));
          return;
        }

        auto osrm_client = GetOsrmHttpClient();
        auto osrm_probe_request = drogon::HttpRequest::newHttpRequest();
        osrm_probe_request->setMethod(drogon::Get);
        osrm_probe_request->setPath(std::string{kOsrmProbePath});

        osrm_client->sendRequest(
            osrm_probe_request,
            [database_check, worker_check, osrm_client = std::move(osrm_client),
             callback = std::move(callback)](const drogon::ReqResult result,
                                             const drogon::HttpResponsePtr& response) mutable {
              (void)osrm_client;
              const DependencyCheck osrm_probe = EvaluateOsrmProbe(result, response);
              CacheOsrmProbe(osrm_probe);
              std::move(callback)(BuildHealthResponse(database_check, worker_check, osrm_probe));
            },
            kOsrmProbeTimeoutSeconds);
      });
}

} // namespace deliveryoptimizer::api
