#include "deliveryoptimizer/adapters/routing_facade.hpp"

#include <cerrno>
#include <cstdint>
#include <cstdlib>
#include <drogon/drogon.h>
#include <limits>
#include <thread>
#include <utility>

namespace {

constexpr std::uint16_t kDefaultListenPort = 8080U;

[[nodiscard]] std::uint16_t ResolveListenPort() {
  const char* raw_port = std::getenv("DELIVERYOPTIMIZER_PORT");
  if (raw_port == nullptr || *raw_port == '\0') {
    return kDefaultListenPort;
  }

  errno = 0;
  char* end = nullptr;
  const long parsed = std::strtol(raw_port, &end, 10);
  const bool invalid = errno != 0 || end == raw_port || *end != '\0' || parsed <= 0L ||
                       parsed > static_cast<long>(std::numeric_limits<std::uint16_t>::max());
  if (invalid) {
    return kDefaultListenPort;
  }

  return static_cast<std::uint16_t>(parsed);
}

} // namespace

int main() {
  drogon::app().registerHandler(
      "/health", [](const drogon::HttpRequestPtr& /*request*/,
                    std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
        Json::Value body;
        body["status"] = "ok";
        std::move(callback)(drogon::HttpResponse::newHttpJsonResponse(body));
      });

  drogon::app().registerHandler(
      "/optimize", [](const drogon::HttpRequestPtr& request,
                      std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
        const auto deliveries =
            static_cast<std::size_t>(request->getOptionalParameter<int>("deliveries").value_or(1));
        const auto vehicles =
            static_cast<std::size_t>(request->getOptionalParameter<int>("vehicles").value_or(1));

        Json::Value body;
        body["summary"] =
            deliveryoptimizer::adapters::RoutingFacade::Optimize(deliveries, vehicles);
        std::move(callback)(drogon::HttpResponse::newHttpJsonResponse(body));
      });

  drogon::app().addListener("0.0.0.0", ResolveListenPort());
  const unsigned int detected_threads = std::thread::hardware_concurrency();
  const unsigned int thread_count = detected_threads == 0U ? 1U : detected_threads;
  drogon::app().setThreadNum(thread_count);
  drogon::app().run();

  return 0;
}
