#include "deliveryoptimizer/api/endpoints/deliveries_optimize_endpoint.hpp"

#include "deliveryoptimizer/api/jobs/optimize_job.hpp"
#include "deliveryoptimizer/api/jobs/runtime_options.hpp"
#include "job_api_utils.hpp"

#include <drogon/drogon.h>
#include <json/json.h>

#include <exception>
#include <string>
#include <string_view>
#include <utility>

namespace {

constexpr std::string_view kIdempotencyKeyHeader = "Idempotency-Key";
constexpr std::string_view kRetryAfterSeconds = "30";

drogon::HttpResponsePtr BuildValidationResponse(const Json::Value& issues) {
  Json::Value body{Json::objectValue};
  body["error"] = "Validation failed.";
  body["issues"] = issues;

  auto response = drogon::HttpResponse::newHttpJsonResponse(body);
  response->setStatusCode(drogon::k400BadRequest);
  return response;
}

drogon::HttpResponsePtr BuildIdempotencyConflictResponse(
    const deliveryoptimizer::api::jobs::JobRecord& job) {
  Json::Value body{Json::objectValue};
  body["error"] = "Idempotency-Key already maps to a different optimize request.";
  body["job_id"] = job.job_id;
  body["poll_url"] = deliveryoptimizer::api::BuildOptimizeJobPath(job.job_id);

  auto response = drogon::HttpResponse::newHttpJsonResponse(body);
  response->setStatusCode(drogon::k409Conflict);
  response->addHeader("Location", deliveryoptimizer::api::BuildOptimizeJobPath(job.job_id));
  return response;
}

} // namespace

namespace deliveryoptimizer::api {

void RegisterDeliveriesOptimizeEndpoint(drogon::HttpAppFramework& app) {
  app.registerHandler(
      "/api/v1/deliveries/optimize",
      [](const drogon::HttpRequestPtr& request,
         std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
        const std::string idempotency_key = request->getHeader(std::string{kIdempotencyKeyHeader});
        if (idempotency_key.empty()) {
          std::move(callback)(BuildErrorResponse(drogon::k428PreconditionRequired,
                                                 "Idempotency-Key header is required."));
          return;
        }

        const auto& parsed_json = request->getJsonObject();
        if (!parsed_json) {
          std::move(callback)(
              BuildErrorResponse(drogon::k400BadRequest, "Request body must be valid JSON."));
          return;
        }

        Json::Value issues{Json::arrayValue};
        const auto parsed_input = jobs::ParseOptimizeRequest(*parsed_json, issues);
        if (!parsed_input.has_value()) {
          std::move(callback)(BuildValidationResponse(issues));
          return;
        }

        const auto job_store = GetApiJobStore();
        if (!job_store) {
          std::move(callback)(
              BuildErrorResponse(drogon::k503ServiceUnavailable, "Optimization queue unavailable."));
          return;
        }

        const jobs::RuntimeOptions runtime_options = jobs::LoadRuntimeOptionsFromEnv();

        jobs::SubmitJobResult submit_result;
        try {
          submit_result =
              job_store->SubmitJob(idempotency_key, *parsed_input, runtime_options.job_max_attempts,
                                   runtime_options.job_retention_seconds,
                                   runtime_options.job_queue_cap);
        } catch (const std::exception&) {
          std::move(callback)(
              BuildErrorResponse(drogon::k503ServiceUnavailable, "Optimization queue unavailable."));
          return;
        }

        if (submit_result.disposition == jobs::SubmitJobDisposition::kOverloaded) {
          auto response = BuildErrorResponse(drogon::k429TooManyRequests,
                                             "Optimization queue is at capacity.");
          response->addHeader("Retry-After", std::string{kRetryAfterSeconds});
          std::move(callback)(response);
          return;
        }

        if (!submit_result.job.has_value()) {
          std::move(callback)(
              BuildErrorResponse(drogon::k503ServiceUnavailable, "Optimization queue unavailable."));
          return;
        }

        if (submit_result.disposition == jobs::SubmitJobDisposition::kConflict) {
          std::move(callback)(BuildIdempotencyConflictResponse(*submit_result.job));
          return;
        }

        auto response = drogon::HttpResponse::newHttpJsonResponse(
            BuildJobResourceBody(*submit_result.job));
        response->addHeader("Location", BuildOptimizeJobPath(submit_result.job->job_id));
        response->setStatusCode(submit_result.disposition == jobs::SubmitJobDisposition::kCreated
                                    ? drogon::k202Accepted
                                    : drogon::k200OK);
        std::move(callback)(response);
      },
      {drogon::Post});
}

} // namespace deliveryoptimizer::api
