#include "deliveryoptimizer/api/endpoints/health_endpoint.hpp"

#include "deliveryoptimizer/api/observability.hpp"
#include "env_utils.hpp"

#include <chrono>
#include <drogon/drogon.h>
#include <filesystem>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>
#include <unistd.h>
#include <utility>
#include <vector>

namespace {

constexpr std::string_view kDefaultVroomBin = "/usr/local/bin/vroom";
constexpr std::string_view kDefaultOsrmUrl = "http://127.0.0.1:5001";
constexpr std::string_view kOsrmProbePath =
    "/nearest/v1/driving/-122.4194,37.7749?number=1&generate_hints=false";
constexpr double kOsrmProbeTimeoutSeconds = 4.0;
constexpr std::chrono::seconds kOsrmProbeCacheTtl{2};

struct OsrmProbeResult {
  bool ready;
  std::string detail;
};

[[nodiscard]] bool IsVroomBinaryReady() {
  const std::string vroom_bin =
      deliveryoptimizer::api::ResolveEnvOrDefault("VROOM_BIN", kDefaultVroomBin);
  std::error_code error;
  const std::filesystem::file_status status = std::filesystem::status(vroom_bin, error);
  if (error || !std::filesystem::is_regular_file(status)) {
    return false;
  }

  return ::access(vroom_bin.c_str(), X_OK) == 0;
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

[[nodiscard]] drogon::HttpResponsePtr BuildHealthResponse(
    const bool vroom_ready, const OsrmProbeResult& osrm_probe,
    const std::shared_ptr<const deliveryoptimizer::api::ObservabilityRegistry>& observability,
    const deliveryoptimizer::api::HealthExtensionProvider& extension) {
  Json::Value body{Json::objectValue};
  bool overall_ready = vroom_ready && osrm_probe.ready;

  Json::Value checks{Json::objectValue};
  checks["vroom_binary"] = vroom_ready ? "ok" : "missing";
  checks["osrm"] = osrm_probe.ready ? "ok" : "down";
  checks["osrm_detail"] = osrm_probe.detail;
  if (observability != nullptr) {
    checks["solver_queue_depth"] = static_cast<Json::UInt64>(observability->QueueDepth());
    checks["solver_inflight"] = static_cast<Json::UInt64>(observability->InflightSolves());
  }
  if (extension) {
    extension(checks, overall_ready);
  }
  body["status"] = overall_ready ? "ok" : "degraded";
  body["checks"] = checks;

  auto response = drogon::HttpResponse::newHttpJsonResponse(body);
  response->setStatusCode(overall_ready ? drogon::k200OK : drogon::k503ServiceUnavailable);
  return response;
}

[[nodiscard]] drogon::HttpClientPtr GetOsrmHttpClient() {
  // Leak the pointer-to-shared_ptr intentionally: keeping the HttpClientPtr itself
  // off static storage prevents its destructor from running after Drogon's loops shut down.
  static const auto* client = new drogon::HttpClientPtr{drogon::HttpClient::newHttpClient(
      deliveryoptimizer::api::ResolveNormalizedUrlEnvOrDefault("OSRM_URL", kDefaultOsrmUrl))};
  return *client;
}

using OsrmProbeWaiter = std::function<void(const OsrmProbeResult&)>;

struct OsrmProbeCache {
  std::mutex mutex;
  std::optional<OsrmProbeResult> cached_result;
  std::chrono::steady_clock::time_point cached_at;
  bool probe_in_flight{false};
  std::vector<OsrmProbeWaiter> waiters;
};

struct OsrmProbeDispatch {
  std::optional<OsrmProbeResult> cached_result;
  bool should_start_probe{false};
};

OsrmProbeCache& GetOsrmProbeCache() {
  static auto* cache = new OsrmProbeCache;
  return *cache;
}

[[nodiscard]] std::optional<OsrmProbeResult>
ReadFreshCachedOsrmProbe(const OsrmProbeCache& cache,
                         const std::chrono::steady_clock::time_point now) {
  if (!cache.cached_result.has_value()) {
    return std::nullopt;
  }

  if (now - cache.cached_at > kOsrmProbeCacheTtl) {
    return std::nullopt;
  }

  return cache.cached_result;
}

[[nodiscard]] OsrmProbeDispatch AddOsrmProbeWaiter(OsrmProbeWaiter waiter) {
  auto& cache = GetOsrmProbeCache();

  std::lock_guard<std::mutex> lock(cache.mutex);
  if (auto cached_result = ReadFreshCachedOsrmProbe(cache, std::chrono::steady_clock::now())) {
    return OsrmProbeDispatch{.cached_result = std::move(cached_result)};
  }

  cache.waiters.push_back(std::move(waiter));
  if (cache.probe_in_flight) {
    return OsrmProbeDispatch{};
  }

  cache.probe_in_flight = true;
  return OsrmProbeDispatch{.cached_result = std::nullopt, .should_start_probe = true};
}

[[nodiscard]] std::vector<OsrmProbeWaiter>
CacheOsrmProbeAndTakeWaiters(const OsrmProbeResult& result) {
  auto& cache = GetOsrmProbeCache();

  std::vector<OsrmProbeWaiter> waiters;
  std::lock_guard<std::mutex> lock(cache.mutex);
  cache.cached_result = result;
  cache.cached_at = std::chrono::steady_clock::now();
  cache.probe_in_flight = false;
  waiters.swap(cache.waiters);
  return waiters;
}

void StartOsrmProbe() {
  auto osrm_client = GetOsrmHttpClient();
  auto osrm_probe_request = drogon::HttpRequest::newHttpRequest();
  osrm_probe_request->setMethod(drogon::Get);
  osrm_probe_request->setPath(std::string{kOsrmProbePath});

  osrm_client->sendRequest(
      osrm_probe_request,
      [osrm_client = std::move(osrm_client)](const drogon::ReqResult result,
                                             const drogon::HttpResponsePtr& response) mutable {
        (void)osrm_client;
        const OsrmProbeResult osrm_probe = EvaluateOsrmProbe(result, response);
        for (auto& waiter : CacheOsrmProbeAndTakeWaiters(osrm_probe)) {
          // Drogon's response callback is safe to invoke from this client callback thread;
          // off-loop socket writes are queued back to each request's connection loop.
          waiter(osrm_probe);
        }
      },
      kOsrmProbeTimeoutSeconds);
}

} // namespace

namespace deliveryoptimizer::api {

void RegisterHealthEndpoint(drogon::HttpAppFramework& app,
                            std::shared_ptr<const ObservabilityRegistry> observability,
                            HealthExtensionProvider extension) {
  app.registerHandler(
      "/health", [observability = std::move(observability), extension = std::move(extension)](
                     const drogon::HttpRequestPtr& /*request*/,
                     std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
        const bool vroom_ready = IsVroomBinaryReady();
        auto response_callback =
            std::make_shared<std::function<void(const drogon::HttpResponsePtr&)>>(
                std::move(callback));
        auto respond = [vroom_ready, observability = observability, extension = extension,
                        response_callback](const OsrmProbeResult& osrm_probe) {
          (*response_callback)(
              BuildHealthResponse(vroom_ready, osrm_probe, observability, extension));
        };
        const OsrmProbeDispatch dispatch = AddOsrmProbeWaiter(respond);
        if (dispatch.cached_result.has_value()) {
          respond(*dispatch.cached_result);
          return;
        }

        if (dispatch.should_start_probe) {
          StartOsrmProbe();
          return;
        }

        // Waiter registered; another in-flight probe will respond via fan-out.
        return;
      });
}

} // namespace deliveryoptimizer::api
