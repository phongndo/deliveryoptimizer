#include "deliveryoptimizer/api/endpoints/optimize_job_status_endpoint.hpp"

#include "job_api_utils.hpp"

#include <drogon/drogon.h>

#include <exception>
#include <string>
#include <utility>

namespace deliveryoptimizer::api {

void RegisterOptimizeJobStatusEndpoint(drogon::HttpAppFramework& app) {
  app.registerHandlerViaRegex(
      "^/api/v1/deliveries/optimize/([^/]+)$",
      [](const drogon::HttpRequestPtr& /*request*/,
         std::function<void(const drogon::HttpResponsePtr&)>&& callback,
         const std::string& job_id) {
        const auto job_store = GetApiJobStore();
        if (!job_store) {
          std::move(callback)(
              BuildErrorResponse(drogon::k503ServiceUnavailable, "Optimization queue unavailable."));
          return;
        }

        try {
          const auto job = job_store->FindJobById(job_id);
          if (!job.has_value()) {
            std::move(callback)(
                BuildErrorResponse(drogon::k404NotFound, "Optimization job not found."));
            return;
          }

          auto response = drogon::HttpResponse::newHttpJsonResponse(BuildJobResourceBody(*job));
          response->addHeader("Location", BuildOptimizeJobPath(job->job_id));
          std::move(callback)(response);
        } catch (const std::exception&) {
          std::move(callback)(
              BuildErrorResponse(drogon::k503ServiceUnavailable, "Optimization queue unavailable."));
        }
      },
      {drogon::Get});
}

} // namespace deliveryoptimizer::api
