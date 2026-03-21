#include "deliveryoptimizer/api/jobs/migrator.hpp"
#include "deliveryoptimizer/api/jobs/runtime_options.hpp"

#include <drogon/orm/DbClient.h>

#include <exception>
#include <iostream>

int main() {
  try {
    const auto runtime_options = deliveryoptimizer::api::jobs::LoadRuntimeOptionsFromEnv();
    auto client = drogon::orm::DbClient::newPgClient(runtime_options.database_url,
                                                     runtime_options.api_db_connections);
    if (!client) {
      std::cerr << "Failed to create PostgreSQL client for migrations.\n";
      return 1;
    }

    (void)deliveryoptimizer::api::jobs::ApplyMigrations(
        client, deliveryoptimizer::api::jobs::ResolveMigrationsDirectoryFromEnv());
    return 0;
  } catch (const std::exception& exception) {
    std::cerr << exception.what() << "\n";
    return 1;
  }
}
