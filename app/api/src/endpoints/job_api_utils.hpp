#pragma once

#include "deliveryoptimizer/api/jobs/job_store.hpp"
#include "deliveryoptimizer/api/jobs/optimize_job.hpp"
#include "deliveryoptimizer/api/jobs/runtime_options.hpp"

#include <drogon/drogon.h>
#include <drogon/orm/DbClient.h>
#include <json/json.h>

#include <memory>
#include <optional>
#include <string>
#include <string_view>

namespace deliveryoptimizer::api {

inline std::string BuildOptimizeJobPath(const std::string_view job_id) {
  return "/api/v1/deliveries/optimize/" + std::string{job_id};
}

inline std::shared_ptr<jobs::JobStore> GetApiJobStore() {
  static std::shared_ptr<jobs::JobStore> store = [] {
    const auto runtime_options = jobs::LoadRuntimeOptionsFromEnv();
    auto client = drogon::orm::DbClient::newPgClient(runtime_options.database_url,
                                                     runtime_options.api_db_connections);
    if (!client) {
      return std::shared_ptr<jobs::JobStore>{};
    }
    return std::make_shared<jobs::JobStore>(std::move(client));
  }();
  return store;
}

inline std::optional<Json::Value> ParseJsonValue(const std::string_view text) {
  Json::CharReaderBuilder builder;
  builder["collectComments"] = false;

  Json::Value root;
  JSONCPP_STRING errors;
  std::unique_ptr<Json::CharReader> reader{builder.newCharReader()};
  const char* begin = text.data();
  const char* end = begin + text.size();
  if (!reader->parse(begin, end, &root, &errors)) {
    return std::nullopt;
  }

  return root;
}

inline Json::Value BuildJobResourceBody(const jobs::JobRecord& job) {
  Json::Value body{Json::objectValue};
  body["job_id"] = job.job_id;
  body["status"] = jobs::ToString(job.status);
  body["created_at"] = jobs::FormatEpochSecondsIso8601(job.created_at);
  body["expires_at"] = jobs::FormatEpochSecondsIso8601(job.expires_at);
  body["poll_url"] = BuildOptimizeJobPath(job.job_id);

  if (job.started_at.has_value()) {
    body["started_at"] = jobs::FormatEpochSecondsIso8601(*job.started_at);
  }
  if (job.completed_at.has_value()) {
    body["completed_at"] = jobs::FormatEpochSecondsIso8601(*job.completed_at);
  }
  if (job.error_code.has_value() || job.error_message.has_value()) {
    Json::Value error{Json::objectValue};
    if (job.error_code.has_value()) {
      error["code"] = *job.error_code;
    }
    if (job.error_message.has_value()) {
      error["message"] = *job.error_message;
    }
    body["error"] = std::move(error);
  }
  if (job.result_payload_text.has_value()) {
    const auto parsed_result = ParseJsonValue(*job.result_payload_text);
    if (parsed_result.has_value()) {
      body["result"] = std::move(*parsed_result);
    }
  }
  return body;
}

inline drogon::HttpResponsePtr BuildErrorResponse(const drogon::HttpStatusCode code,
                                                  const std::string_view error_message) {
  Json::Value body{Json::objectValue};
  body["error"] = std::string{error_message};
  auto response = drogon::HttpResponse::newHttpJsonResponse(body);
  response->setStatusCode(code);
  return response;
}

} // namespace deliveryoptimizer::api
