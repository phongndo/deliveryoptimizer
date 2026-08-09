#include "deliveryoptimizer/api/endpoints/deliveries_optimize_endpoint.hpp"

#include "deliveryoptimizer/api/forecast_optimizer.hpp"
#include "deliveryoptimizer/api/observability.hpp"
#include "deliveryoptimizer/api/optimize_request.hpp"
#include "deliveryoptimizer/api/solve_coordinator.hpp"
#include "deliveryoptimizer/api/solve_execution.hpp"
#include "deliveryoptimizer/api/vroom_runner.hpp"

#include <drogon/drogon.h>
#include <json/json.h>
#include <memory>
#include <optional>
#include <string_view>
#include <trantor/net/EventLoop.h>
#include <utility>

namespace {

struct CompletedResponse {
  drogon::HttpResponsePtr response;
  deliveryoptimizer::api::SolveRequestOutcome outcome;
};

// Single per-request bundle so every std::function capture stays within the
// 16-byte small-buffer optimization instead of heap-allocating one closure per
// submit (and re-copying the weather options strings on the re-run path).
struct SyncSolveContext {
  std::shared_ptr<deliveryoptimizer::api::SolveCoordinator> coordinator;
  std::shared_ptr<deliveryoptimizer::api::OptimizeRequestInput> optimize_request;
  deliveryoptimizer::api::WeatherForecastOptions weather_options;
  std::shared_ptr<deliveryoptimizer::api::ObservabilityRegistry> observability;
  std::shared_ptr<deliveryoptimizer::api::SolveLifecycle> lifecycle;
  std::shared_ptr<std::function<void(const drogon::HttpResponsePtr&)>> response_callback;
  trantor::EventLoop* response_loop{nullptr};
  std::optional<Json::Value> forecast;
  int weather_service_adjustment_seconds{0};
};

[[nodiscard]] drogon::HttpResponsePtr BuildErrorResponse(const drogon::HttpStatusCode code,
                                                         const std::string_view error_message) {
  Json::Value body{Json::objectValue};
  body["error"] = std::string{error_message};
  auto response = drogon::HttpResponse::newHttpJsonResponse(std::move(body));
  response->setStatusCode(code);
  return response;
}

[[nodiscard]] drogon::HttpResponsePtr BuildValidationResponse(Json::Value issues) {
  Json::Value body{Json::objectValue};
  body["error"] = "Validation failed.";
  body["issues"] = std::move(issues);
  auto response = drogon::HttpResponse::newHttpJsonResponse(std::move(body));
  response->setStatusCode(drogon::k400BadRequest);
  return response;
}

[[nodiscard]] CompletedResponse
BuildAdmissionRejectionResponse(const deliveryoptimizer::api::SolveAdmissionStatus status) {
  switch (status) {
  case deliveryoptimizer::api::SolveAdmissionStatus::kRejectedTooManyJobs:
  case deliveryoptimizer::api::SolveAdmissionStatus::kRejectedTooManyVehicles:
    return CompletedResponse{
        .response =
            BuildErrorResponse(drogon::k422UnprocessableEntity,
                               "Routing optimization is unavailable for requests of this size."),
        .outcome = status == deliveryoptimizer::api::SolveAdmissionStatus::kRejectedTooManyJobs
                       ? deliveryoptimizer::api::SolveRequestOutcome::kRejectedTooManyJobs
                       : deliveryoptimizer::api::SolveRequestOutcome::kRejectedTooManyVehicles,
    };
  case deliveryoptimizer::api::SolveAdmissionStatus::kRejectedQueueFull:
    return CompletedResponse{
        .response = BuildErrorResponse(drogon::k503ServiceUnavailable,
                                       "Routing optimization is temporarily overloaded."),
        .outcome = deliveryoptimizer::api::SolveRequestOutcome::kRejectedQueueFull,
    };
  case deliveryoptimizer::api::SolveAdmissionStatus::kAccepted:
    break;
  }

  return CompletedResponse{
      .response = BuildErrorResponse(drogon::k502BadGateway, "Routing optimization failed."),
      .outcome = deliveryoptimizer::api::SolveRequestOutcome::kFailed,
  };
}

[[nodiscard]] CompletedResponse
BuildSolveExecutionResponse(deliveryoptimizer::api::SolveExecutionResult result) {
  if (result.response_body.has_value()) {
    auto response =
        drogon::HttpResponse::newHttpJsonResponse(std::move(*result.response_body));
    response->setStatusCode(static_cast<drogon::HttpStatusCode>(result.http_status));
    return CompletedResponse{
        .response = response,
        .outcome = result.outcome,
    };
  }

  return CompletedResponse{
      .response = BuildErrorResponse(static_cast<drogon::HttpStatusCode>(result.http_status),
                                     result.error_message),
      .outcome = result.outcome,
  };
}

void DispatchResponse(
    trantor::EventLoop* response_loop,
    const std::shared_ptr<std::function<void(const drogon::HttpResponsePtr&)>>& callback,
    const drogon::HttpResponsePtr& response) {
  response_loop->queueInLoop([callback, response] { (*callback)(response); });
}

void CompleteAndRespond(const std::shared_ptr<SyncSolveContext>& context,
                        CompletedResponse completed_response) {
  FinalizeSolveRequest(context->observability, context->lifecycle, completed_response.outcome,
                       static_cast<std::uint16_t>(completed_response.response->getStatusCode()));
  DispatchResponse(context->response_loop, context->response_callback,
                   std::move(completed_response.response));
}

} // namespace

namespace deliveryoptimizer::api {

void RegisterDeliveriesOptimizeEndpoint(drogon::HttpAppFramework& app,
                                        const SolveAdmissionConfig& admission_config,
                                        std::shared_ptr<ObservabilityRegistry> observability) {
  const WeatherForecastOptions weather_options = ResolveWeatherForecastOptionsFromEnv();
  auto runner = std::make_shared<ProcessVroomRunner>(ResolveVroomRuntimeConfigFromEnv());
  auto coordinator = std::make_shared<SolveCoordinator>(admission_config, runner,
                                                        SolveCoordinatorOptions{}, observability);

  app.registerHandler(
      "/api/v1/deliveries/optimize",
      [coordinator = std::move(coordinator), weather_options,
       observability = std::move(observability)](
          const drogon::HttpRequestPtr& request,
          std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
        auto context = std::make_shared<SyncSolveContext>();
        context->coordinator = coordinator;
        context->weather_options = weather_options;
        context->observability = observability;
        context->lifecycle = std::make_shared<SolveLifecycle>(CreateSolveLifecycle(request));
        context->response_callback =
            std::make_shared<std::function<void(const drogon::HttpResponsePtr&)>>(
                std::move(callback));
        context->response_loop = trantor::EventLoop::getEventLoopOfCurrentThread();
        if (context->response_loop == nullptr) {
          context->response_loop = drogon::app().getLoop();
        }

        // Both lambdas capture only the 16-byte shared pointer, so the std::function
        // storage stays in the small-buffer optimization (no per-request closure
        // allocations beyond the context itself).
        const auto& parsed_json = request->getJsonObject();
        if (!parsed_json) {
          CompleteAndRespond(context, CompletedResponse{
                                          .response = BuildErrorResponse(
                                              drogon::k400BadRequest,
                                              "Request body must be valid JSON."),
                                          .outcome = SolveRequestOutcome::kInvalidJson,
                                      });
          return;
        }

        const auto early_request_size = TryParseOptimizeRequestSize(*parsed_json);
        if (early_request_size.has_value()) {
          context->lifecycle->jobs = early_request_size->jobs;
          context->lifecycle->vehicles = early_request_size->vehicles;
          const SolveAdmissionStatus admission_status =
              coordinator->CheckAdmission(*early_request_size, context->lifecycle);
          if (admission_status != SolveAdmissionStatus::kAccepted) {
            CompleteAndRespond(context, BuildAdmissionRejectionResponse(admission_status));
            return;
          }
        }

        Json::Value issues{Json::arrayValue};
        auto parsed_request = ParseAndValidateOptimizeRequest(*parsed_json, issues);
        if (!parsed_request.has_value()) {
          CompleteAndRespond(context, CompletedResponse{
                                          .response = BuildValidationResponse(std::move(issues)),
                                          .outcome = SolveRequestOutcome::kValidationFailed,
                                      });
          return;
        }

        context->optimize_request =
            std::make_shared<OptimizeRequestInput>(std::move(parsed_request->input));
        context->lifecycle->jobs = context->optimize_request->jobs.size();
        context->lifecycle->vehicles = context->optimize_request->vehicles.size();

        const SolveRequestSize request_size{
            .jobs = context->optimize_request->jobs.size(),
            .vehicles = context->optimize_request->vehicles.size(),
        };
        const SolveAdmissionStatus admission_status = coordinator->Submit(
            request_size, [context] { return BuildVroomInputText(*context->optimize_request); },
            [context](CoordinatedSolveResult result) mutable {
              if (!result.output.has_value()) {
                CompleteAndRespond(context, BuildSolveExecutionResponse(
                                                BuildSolveExecutionResult(
                                                    *context->optimize_request,
                                                    std::move(result), std::nullopt)));
                return;
              }

              WeatherForecastOptions sync_weather_options = context->weather_options;
              // Clear the key so recalculation short-circuits OpenWeather; sync path must not
              // block the event loop.
              sync_weather_options.openweather_api_key.clear();
              const WeatherImpactEstimate impact = RecalculateWeatherImpact(
                  sync_weather_options, *context->optimize_request, *result.output);
              context->forecast = BuildWeatherForecastAnnotation(sync_weather_options, impact);
              if (!impact.should_reoptimize) {
                CompleteAndRespond(context, BuildSolveExecutionResponse(
                                                BuildSolveExecutionResult(
                                                    *context->optimize_request,
                                                    std::move(result), context->forecast)));
                return;
              }

              // Only the scalar adjustment is needed by the re-run factory, so it
              // lives on the shared context to keep every std::function capture at
              // the 16-byte small-buffer size.
              context->weather_service_adjustment_seconds =
                  impact.should_reoptimize ? impact.delay_seconds_per_stop : 0;
              const SolveAdmissionStatus rerun_status = context->coordinator->Submit(
                  SolveRequestSize{
                      .jobs = context->optimize_request->jobs.size(),
                      .vehicles = context->optimize_request->vehicles.size(),
                  },
                  [context] {
                    return BuildVroomInputText(*context->optimize_request,
                                               context->weather_service_adjustment_seconds);
                  },
                  [context](CoordinatedSolveResult rerun_result) mutable {
                    CompleteAndRespond(
                        context,
                        BuildSolveExecutionResponse(BuildSolveExecutionResult(
                            *context->optimize_request, std::move(rerun_result),
                            context->forecast)));
                  });
              if (rerun_status != SolveAdmissionStatus::kAccepted) {
                CompleteAndRespond(context, BuildAdmissionRejectionResponse(rerun_status));
              }
            },
            context->lifecycle);
        if (admission_status != SolveAdmissionStatus::kAccepted) {
          CompleteAndRespond(context, BuildAdmissionRejectionResponse(admission_status));
        }
      },
      {drogon::Post});
}

} // namespace deliveryoptimizer::api
