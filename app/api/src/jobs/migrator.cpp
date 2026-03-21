#include "deliveryoptimizer/api/jobs/migrator.hpp"

#include <drogon/orm/DbClient.h>

#include <algorithm>
#include <chrono>
#include <cctype>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace {

constexpr std::string_view kDefaultMigrationsDirectory = "db/migrations";

std::string ReadFile(const std::filesystem::path& path) {
  std::ifstream stream(path, std::ios::binary);
  if (!stream.is_open()) {
    throw std::runtime_error("Failed to open migration file: " + path.string());
  }

  return std::string(std::istreambuf_iterator<char>{stream}, std::istreambuf_iterator<char>{});
}

std::vector<std::filesystem::path> ListMigrationFiles(const std::string& migrations_directory) {
  std::vector<std::filesystem::path> files;
  for (const auto& entry : std::filesystem::directory_iterator(migrations_directory)) {
    if (entry.is_regular_file() && entry.path().extension() == ".sql") {
      files.push_back(entry.path());
    }
  }
  std::sort(files.begin(), files.end());
  return files;
}

std::string TrimWhitespace(std::string statement) {
  const auto first =
      std::find_if_not(statement.begin(), statement.end(),
                       [](const unsigned char character) { return std::isspace(character) != 0; });
  if (first == statement.end()) {
    return {};
  }

  const auto last =
      std::find_if_not(statement.rbegin(), statement.rend(),
                       [](const unsigned char character) { return std::isspace(character) != 0; })
          .base();
  return std::string(first, last);
}

std::vector<std::string> SplitSqlStatements(const std::string& sql_text) {
  std::vector<std::string> statements;
  std::string current_statement;
  current_statement.reserve(sql_text.size());

  for (const char character : sql_text) {
    if (character == ';') {
      auto trimmed = TrimWhitespace(std::move(current_statement));
      if (!trimmed.empty()) {
        statements.push_back(std::move(trimmed));
      }
      current_statement.clear();
      continue;
    }

    current_statement.push_back(character);
  }

  auto trailing_statement = TrimWhitespace(std::move(current_statement));
  if (!trailing_statement.empty()) {
    statements.push_back(std::move(trailing_statement));
  }

  return statements;
}

} // namespace

namespace deliveryoptimizer::api::jobs {

std::string ResolveMigrationsDirectoryFromEnv() {
  const char* raw_value = std::getenv("DELIVERYOPTIMIZER_MIGRATIONS_DIR");
  if (raw_value == nullptr || *raw_value == '\0') {
    return std::string{kDefaultMigrationsDirectory};
  }

  return std::string{raw_value};
}

std::size_t ApplyMigrations(const drogon::orm::DbClientPtr& client,
                            const std::string& migrations_directory) {
  if (!std::filesystem::exists(migrations_directory)) {
    throw std::runtime_error("Migrations directory does not exist: " + migrations_directory);
  }

  (void)client->execSqlSync(
      "CREATE TABLE IF NOT EXISTS schema_migrations ("
      "version TEXT PRIMARY KEY, "
      "applied_at_epoch BIGINT NOT NULL"
      ")");

  std::size_t applied_count = 0U;
  for (const auto& path : ListMigrationFiles(migrations_directory)) {
    const std::string version = path.filename().string();
    const auto existing =
        client->execSqlSync("SELECT version FROM schema_migrations WHERE version = $1", version);
    if (!existing.empty()) {
      continue;
    }

    auto transaction = client->newTransaction();
    try {
      for (const auto& statement : SplitSqlStatements(ReadFile(path))) {
        (void)transaction->execSqlSync(statement);
      }
      const auto now_epoch =
          std::chrono::time_point_cast<std::chrono::seconds>(std::chrono::system_clock::now())
              .time_since_epoch()
              .count();
      (void)transaction->execSqlSync(
          "INSERT INTO schema_migrations (version, applied_at_epoch) VALUES ($1, $2)", version,
          static_cast<long long>(now_epoch));
      ++applied_count;
    } catch (...) {
      transaction->rollback();
      throw;
    }
  }

  return applied_count;
}

} // namespace deliveryoptimizer::api::jobs
