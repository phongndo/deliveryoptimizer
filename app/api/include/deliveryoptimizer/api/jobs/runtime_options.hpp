#pragma once

#include <cstddef>
#include <optional>
#include <string>

namespace deliveryoptimizer::api::jobs {

struct RuntimeOptions {
  std::string database_url;
  std::size_t api_db_connections;
  std::size_t worker_db_connections;
  int worker_concurrency;
  int job_max_attempts;
  int job_retention_seconds;
  int job_queue_cap;
  int worker_poll_interval_ms;
  std::optional<int> job_lease_seconds;
};

RuntimeOptions LoadRuntimeOptionsFromEnv();

} // namespace deliveryoptimizer::api::jobs
