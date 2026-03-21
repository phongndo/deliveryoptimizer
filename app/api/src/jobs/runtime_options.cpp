#include "deliveryoptimizer/api/jobs/runtime_options.hpp"

#include <algorithm>
#include <charconv>
#include <cstdlib>
#include <optional>
#include <string_view>

namespace {

constexpr std::string_view kDefaultDatabaseUrl =
    "host=127.0.0.1 port=5432 dbname=deliveryoptimizer user=deliveryoptimizer "
    "password=deliveryoptimizer";
constexpr std::size_t kDefaultApiDbConnections = 4U;
constexpr std::size_t kDefaultWorkerDbConnections = 4U;
constexpr int kDefaultWorkerConcurrency = 2;
constexpr int kDefaultJobMaxAttempts = 3;
constexpr int kDefaultJobRetentionSeconds = 24 * 60 * 60;
constexpr int kDefaultJobQueueCap = 100;
constexpr int kDefaultWorkerPollIntervalMs = 500;

template <typename Integer>
std::optional<Integer> ParsePositiveIntegerEnv(const char* raw_value) {
  if (raw_value == nullptr || *raw_value == '\0') {
    return std::nullopt;
  }

  const std::string_view value_text{raw_value};
  Integer parsed_value = 0;
  const auto [end_ptr, error] =
      std::from_chars(value_text.data(), value_text.data() + value_text.size(), parsed_value);
  if (error != std::errc{} || end_ptr != value_text.data() + value_text.size() ||
      parsed_value <= 0) {
    return std::nullopt;
  }

  return parsed_value;
}

template <typename Integer>
Integer ResolvePositiveIntegerEnv(const char* key, const Integer default_value) {
  const auto parsed = ParsePositiveIntegerEnv<Integer>(std::getenv(key));
  return parsed.value_or(default_value);
}

std::optional<int> ResolveOptionalPositiveIntEnv(const char* key) {
  return ParsePositiveIntegerEnv<int>(std::getenv(key));
}

std::string ResolveDatabaseUrl() {
  const char* raw_value = std::getenv("DELIVERYOPTIMIZER_DATABASE_URL");
  if (raw_value == nullptr || *raw_value == '\0') {
    return std::string{kDefaultDatabaseUrl};
  }

  return std::string{raw_value};
}

} // namespace

namespace deliveryoptimizer::api::jobs {

RuntimeOptions LoadRuntimeOptionsFromEnv() {
  return RuntimeOptions{
      .database_url = ResolveDatabaseUrl(),
      .api_db_connections =
          ResolvePositiveIntegerEnv<std::size_t>("DELIVERYOPTIMIZER_API_DB_CONNECTIONS",
                                                 kDefaultApiDbConnections),
      .worker_db_connections =
          ResolvePositiveIntegerEnv<std::size_t>("DELIVERYOPTIMIZER_WORKER_DB_CONNECTIONS",
                                                 kDefaultWorkerDbConnections),
      .worker_concurrency =
          ResolvePositiveIntegerEnv<int>("DELIVERYOPTIMIZER_WORKER_CONCURRENCY",
                                         kDefaultWorkerConcurrency),
      .job_max_attempts =
          ResolvePositiveIntegerEnv<int>("DELIVERYOPTIMIZER_JOB_MAX_ATTEMPTS",
                                         kDefaultJobMaxAttempts),
      .job_retention_seconds =
          ResolvePositiveIntegerEnv<int>("DELIVERYOPTIMIZER_JOB_RETENTION_SECONDS",
                                         kDefaultJobRetentionSeconds),
      .job_queue_cap = ResolvePositiveIntegerEnv<int>("DELIVERYOPTIMIZER_JOB_QUEUE_CAP",
                                                      kDefaultJobQueueCap),
      .worker_poll_interval_ms =
          ResolvePositiveIntegerEnv<int>("DELIVERYOPTIMIZER_WORKER_POLL_INTERVAL_MS",
                                         kDefaultWorkerPollIntervalMs),
      .job_lease_seconds = ResolveOptionalPositiveIntEnv("DELIVERYOPTIMIZER_JOB_LEASE_SECONDS"),
  };
}

} // namespace deliveryoptimizer::api::jobs
