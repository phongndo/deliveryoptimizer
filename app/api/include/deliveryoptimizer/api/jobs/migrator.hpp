#pragma once

#include <cstddef>
#include <memory>
#include <string>

namespace drogon::orm {
class DbClient;
using DbClientPtr = std::shared_ptr<DbClient>;
}

namespace deliveryoptimizer::api::jobs {

std::string ResolveMigrationsDirectoryFromEnv();

std::size_t ApplyMigrations(const drogon::orm::DbClientPtr& client,
                            const std::string& migrations_directory);

} // namespace deliveryoptimizer::api::jobs
