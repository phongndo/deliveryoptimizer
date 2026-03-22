#include "deliveryoptimizer/api/jobs/job_store.hpp"

#include "deliveryoptimizer/api/jobs/optimize_job.hpp"

#include <drogon/orm/DbClient.h>
#include <gtest/gtest.h>

#include <barrier>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <functional>
#include <memory>
#include <optional>
#include <random>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <sys/wait.h>
#include <thread>
#include <unistd.h>
#include <utility>

int RunGoogleTests(int argc, char** argv) {
  ::testing::InitGoogleTest(&argc, argv);
  return RUN_ALL_TESTS();
}

int main(int argc, char** argv) { return RunGoogleTests(argc, argv); }

int test_main(int argc, char** argv) { return RunGoogleTests(argc, argv); }

namespace {

using deliveryoptimizer::api::jobs::ComputeFnv1a64Hex;
using deliveryoptimizer::api::jobs::JobStore;
using deliveryoptimizer::api::jobs::OptimizeRequestInput;
using deliveryoptimizer::api::jobs::SubmitJobDisposition;

constexpr std::string_view kDockerImage = "postgres:16-alpine";
constexpr int kInsertBlockLockKey1 = 41051;
constexpr int kInsertBlockLockKey2 = 7;

std::string TrimWhitespace(std::string value) {
  const auto first = value.find_first_not_of(" \t\r\n");
  if (first == std::string::npos) {
    return {};
  }

  const auto last = value.find_last_not_of(" \t\r\n");
  return value.substr(first, last - first + 1U);
}

void CheckCommandStatus(const int status, const std::string_view command) {
  if (status == -1) {
    throw std::runtime_error("Failed to execute command: " + std::string{command});
  }

  if (!WIFEXITED(status) || WEXITSTATUS(status) != 0) {
    std::ostringstream stream;
    stream << "Command failed (" << command << ") with status " << status;
    throw std::runtime_error(stream.str());
  }
}

void RunCommand(const std::string& command) {
  CheckCommandStatus(std::system(command.c_str()), command);
}

std::string RunCommandCapture(const std::string& command) {
  std::unique_ptr<FILE, decltype(&pclose)> pipe(popen(command.c_str(), "r"), &pclose);
  if (!pipe) {
    throw std::runtime_error("Failed to open pipe for command: " + command);
  }

  std::string output;
  char buffer[256];
  while (fgets(buffer, sizeof(buffer), pipe.get()) != nullptr) {
    output.append(buffer);
  }

  CheckCommandStatus(pclose(pipe.release()), command);
  return TrimWhitespace(std::move(output));
}

OptimizeRequestInput BuildRequest(const std::string& suffix) {
  return OptimizeRequestInput{
      .depot_lon = 7.4236,
      .depot_lat = 43.7384,
      .vehicles =
          {{
              .external_id = "vehicle-" + suffix,
              .capacity = 8,
          }},
      .jobs =
          {{
              .external_id = "job-" + suffix,
              .lon = 7.4212,
              .lat = 43.7308,
              .demand = 2,
              .service = 180,
          }},
  };
}

void InitializeJobStoreSchema(const drogon::orm::DbClientPtr& client) {
  client->execSqlSync(
      "CREATE TABLE IF NOT EXISTS optimization_jobs ("
      "  job_id TEXT PRIMARY KEY,"
      "  idempotency_key TEXT NOT NULL UNIQUE,"
      "  request_hash TEXT NOT NULL,"
      "  request_payload JSONB NOT NULL,"
      "  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),"
      "  result_payload JSONB,"
      "  error_code TEXT,"
      "  error_message TEXT,"
      "  attempt_count INTEGER NOT NULL DEFAULT 0,"
      "  max_attempts INTEGER NOT NULL,"
      "  worker_id TEXT,"
      "  lease_expires_at_epoch BIGINT,"
      "  created_at_epoch BIGINT NOT NULL,"
      "  started_at_epoch BIGINT,"
      "  completed_at_epoch BIGINT,"
      "  expires_at_epoch BIGINT NOT NULL"
      ")");
  client->execSqlSync(
      "CREATE INDEX IF NOT EXISTS optimization_jobs_status_created_idx "
      "ON optimization_jobs (status, created_at_epoch)");
  client->execSqlSync(
      "CREATE INDEX IF NOT EXISTS optimization_jobs_lease_idx "
      "ON optimization_jobs (lease_expires_at_epoch)");
  client->execSqlSync(
      "CREATE INDEX IF NOT EXISTS optimization_jobs_expires_idx "
      "ON optimization_jobs (expires_at_epoch)");
}

class ScopedPostgresContainer {
public:
  ScopedPostgresContainer() {
    const auto seed =
        static_cast<unsigned long long>(std::chrono::steady_clock::now().time_since_epoch().count());
    container_name_ =
        "deliveryoptimizer-job-store-test-" + std::to_string(::getpid()) + "-" + std::to_string(seed);

    RunCommand(std::string{DELIVERYOPTIMIZER_DOCKER_BIN} +
               " run --rm -d --name " + container_name_ +
               " -e POSTGRES_DB=deliveryoptimizer"
               " -e POSTGRES_USER=deliveryoptimizer"
               " -e POSTGRES_PASSWORD=deliveryoptimizer"
               " -p 127.0.0.1::5432 " + std::string{kDockerImage} + " >/dev/null");

    host_port_ = RunCommandCapture(std::string{DELIVERYOPTIMIZER_DOCKER_BIN} +
                                   " inspect --format "
                                   "'{{(index (index .NetworkSettings.Ports \"5432/tcp\") 0).HostPort}}' " +
                                   container_name_);
    connection_string_ = "host=127.0.0.1 port=" + host_port_ +
                         " dbname=deliveryoptimizer user=deliveryoptimizer "
                         "password=deliveryoptimizer";

    WaitUntilReady();
    InitializeJobStoreSchema(CreateClient(1));
  }

  ~ScopedPostgresContainer() {
    if (!container_name_.empty()) {
      (void)std::system((std::string{DELIVERYOPTIMIZER_DOCKER_BIN} + " rm -f " + container_name_ +
                         " >/dev/null 2>&1")
                            .c_str());
    }
  }

  ScopedPostgresContainer(const ScopedPostgresContainer&) = delete;
  ScopedPostgresContainer& operator=(const ScopedPostgresContainer&) = delete;

  [[nodiscard]] drogon::orm::DbClientPtr CreateClient(const int connection_count) const {
    auto client = drogon::orm::DbClient::newPgClient(
        connection_string_, static_cast<std::size_t>(connection_count));
    if (!client) {
      throw std::runtime_error("Failed to create PostgreSQL client for test container.");
    }
    return client;
  }

private:
  void WaitUntilReady() const {
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds{30};
    while (std::chrono::steady_clock::now() < deadline) {
      try {
        auto client = CreateClient(1);
        (void)client->execSqlSync("SELECT 1");
        return;
      } catch (...) {
        std::this_thread::sleep_for(std::chrono::milliseconds{100});
      }
    }

    throw std::runtime_error("PostgreSQL container did not become ready in time.");
  }

  std::string container_name_;
  std::string host_port_;
  std::string connection_string_;
};

class JobStorePostgresIntegrationTest : public ::testing::Test {
protected:
  static void SetUpTestSuite() { postgres_ = std::make_unique<ScopedPostgresContainer>(); }

  static void TearDownTestSuite() { postgres_.reset(); }

  void SetUp() override {
    auto client = CreateClient(1);
    client->execSqlSync("DROP TRIGGER IF EXISTS optimization_jobs_test_block_insert ON optimization_jobs");
    client->execSqlSync("DROP FUNCTION IF EXISTS optimization_jobs_test_block_insert()");
    client->execSqlSync("TRUNCATE TABLE optimization_jobs");
  }

  [[nodiscard]] drogon::orm::DbClientPtr CreateClient(const int connection_count) const {
    return postgres_->CreateClient(connection_count);
  }

  static void InstallInsertBlocker(const drogon::orm::DbClientPtr& client) {
    client->execSqlSync(
        "CREATE FUNCTION optimization_jobs_test_block_insert() "
        "RETURNS trigger AS $$ "
        "BEGIN "
        "  PERFORM pg_advisory_lock(" +
        std::to_string(kInsertBlockLockKey1) + ", " + std::to_string(kInsertBlockLockKey2) + "); "
        "  PERFORM pg_advisory_unlock(" +
        std::to_string(kInsertBlockLockKey1) + ", " + std::to_string(kInsertBlockLockKey2) + "); "
        "  RETURN NEW; "
        "END; "
        "$$ LANGUAGE plpgsql");
    client->execSqlSync(
        "CREATE TRIGGER optimization_jobs_test_block_insert "
        "BEFORE INSERT ON optimization_jobs "
        "FOR EACH ROW EXECUTE FUNCTION optimization_jobs_test_block_insert()");
  }

  static std::unique_ptr<ScopedPostgresContainer> postgres_;
};

std::unique_ptr<ScopedPostgresContainer> JobStorePostgresIntegrationTest::postgres_;

TEST_F(JobStorePostgresIntegrationTest,
       ConcurrentIdempotentSubmitReturnsExistingJobInsteadOfThrowingUniqueViolation) {
  InstallInsertBlocker(CreateClient(1));

  auto blocker_client = CreateClient(1);
  auto blocker_transaction = blocker_client->newTransaction();
  blocker_transaction->execSqlSync("SELECT pg_advisory_lock($1, $2)", kInsertBlockLockKey1,
                                   kInsertBlockLockKey2);

  auto store = std::make_shared<JobStore>(CreateClient(8));
  const OptimizeRequestInput input = BuildRequest("shared");
  std::barrier sync_point(3);

  struct ThreadResult {
    std::optional<deliveryoptimizer::api::jobs::SubmitJobResult> submit_result;
    std::optional<std::string> exception;
  };

  ThreadResult first;
  ThreadResult second;
  auto run_submit = [&](ThreadResult& result) {
    sync_point.arrive_and_wait();
    try {
      result.submit_result = store->SubmitJob("duplicate-key", input, 3, 3600, 10);
    } catch (const std::exception& exception) {
      result.exception = exception.what();
    }
  };

  std::jthread first_thread(run_submit, std::ref(first));
  std::jthread second_thread(run_submit, std::ref(second));

  sync_point.arrive_and_wait();
  std::this_thread::sleep_for(std::chrono::milliseconds{200});
  blocker_transaction->execSqlSync("SELECT pg_advisory_unlock($1, $2)", kInsertBlockLockKey1,
                                   kInsertBlockLockKey2);

  first_thread.join();
  second_thread.join();

  ASSERT_FALSE(first.exception.has_value()) << *first.exception;
  ASSERT_FALSE(second.exception.has_value()) << *second.exception;
  ASSERT_TRUE(first.submit_result.has_value());
  ASSERT_TRUE(second.submit_result.has_value());
  ASSERT_TRUE(first.submit_result->job.has_value());
  ASSERT_TRUE(second.submit_result->job.has_value());

  const auto first_disposition = first.submit_result->disposition;
  const auto second_disposition = second.submit_result->disposition;
  EXPECT_TRUE((first_disposition == SubmitJobDisposition::kCreated &&
               second_disposition == SubmitJobDisposition::kExisting) ||
              (first_disposition == SubmitJobDisposition::kExisting &&
               second_disposition == SubmitJobDisposition::kCreated));
  EXPECT_EQ(first.submit_result->job->job_id, second.submit_result->job->job_id);

  const auto rows = CreateClient(1)->execSqlSync("SELECT COUNT(*) AS job_count FROM optimization_jobs");
  EXPECT_EQ(rows[0]["job_count"].as<int>(), 1);
}

TEST_F(JobStorePostgresIntegrationTest, ConcurrentSubmitsRespectQueueCapAtomically) {
  InstallInsertBlocker(CreateClient(1));

  auto blocker_client = CreateClient(1);
  auto blocker_transaction = blocker_client->newTransaction();
  blocker_transaction->execSqlSync("SELECT pg_advisory_lock($1, $2)", kInsertBlockLockKey1,
                                   kInsertBlockLockKey2);

  auto store = std::make_shared<JobStore>(CreateClient(8));
  const OptimizeRequestInput input = BuildRequest("queue-cap");
  std::barrier sync_point(3);

  struct ThreadResult {
    std::optional<deliveryoptimizer::api::jobs::SubmitJobResult> submit_result;
    std::optional<std::string> exception;
  };

  ThreadResult first;
  ThreadResult second;
  auto run_submit = [&](const std::string& key, ThreadResult& result) {
    sync_point.arrive_and_wait();
    try {
      result.submit_result = store->SubmitJob(key, input, 3, 3600, 1);
    } catch (const std::exception& exception) {
      result.exception = exception.what();
    }
  };

  std::jthread first_thread(run_submit, "queue-key-1", std::ref(first));
  std::jthread second_thread(run_submit, "queue-key-2", std::ref(second));

  sync_point.arrive_and_wait();
  std::this_thread::sleep_for(std::chrono::milliseconds{200});
  blocker_transaction->execSqlSync("SELECT pg_advisory_unlock($1, $2)", kInsertBlockLockKey1,
                                   kInsertBlockLockKey2);

  first_thread.join();
  second_thread.join();

  ASSERT_FALSE(first.exception.has_value()) << *first.exception;
  ASSERT_FALSE(second.exception.has_value()) << *second.exception;
  ASSERT_TRUE(first.submit_result.has_value());
  ASSERT_TRUE(second.submit_result.has_value());

  const auto first_disposition = first.submit_result->disposition;
  const auto second_disposition = second.submit_result->disposition;
  EXPECT_TRUE((first_disposition == SubmitJobDisposition::kCreated &&
               second_disposition == SubmitJobDisposition::kOverloaded) ||
              (first_disposition == SubmitJobDisposition::kOverloaded &&
               second_disposition == SubmitJobDisposition::kCreated));

  const auto rows = CreateClient(1)->execSqlSync(
      "SELECT COUNT(*) AS job_count FROM optimization_jobs WHERE status IN ('queued', 'running')");
  EXPECT_EQ(rows[0]["job_count"].as<int>(), 1);
}

TEST_F(JobStorePostgresIntegrationTest, CleanupKeepsExpiredQueuedAndRunningJobs) {
  auto client = CreateClient(1);
  JobStore store{CreateClient(2)};

  const OptimizeRequestInput input = BuildRequest("cleanup");
  const std::string request_payload =
      deliveryoptimizer::api::jobs::BuildCanonicalRequestString(input);
  const std::string request_hash = ComputeFnv1a64Hex(request_payload);
  const auto now = std::chrono::sys_seconds{std::chrono::seconds{1'000}};
  const auto expired_epoch = static_cast<long long>((now - std::chrono::seconds{1}).time_since_epoch().count());
  const auto created_epoch = static_cast<long long>((now - std::chrono::seconds{60}).time_since_epoch().count());

  auto insert_job = [&](const std::string& job_id, const std::string& key, const std::string& status) {
    client->execSqlSync(
        "INSERT INTO optimization_jobs ("
        "job_id, idempotency_key, request_hash, request_payload, status, "
        "attempt_count, max_attempts, created_at_epoch, expires_at_epoch"
        ") VALUES ($1, $2, $3, CAST($4 AS jsonb), $5, 0, 3, $6, $7)",
        job_id, key, request_hash, request_payload, status, created_epoch, expired_epoch);
  };

  insert_job("queued-job", "queued-key", "queued");
  insert_job("running-job", "running-key", "running");
  insert_job("succeeded-job", "succeeded-key", "succeeded");
  insert_job("failed-job", "failed-key", "failed");

  const std::size_t deleted_jobs = store.CleanupExpiredJobs(now);
  EXPECT_EQ(deleted_jobs, 2U);

  const auto remaining_rows =
      client->execSqlSync("SELECT job_id, status FROM optimization_jobs ORDER BY job_id");
  ASSERT_EQ(remaining_rows.size(), 2U);
  EXPECT_EQ(remaining_rows[0]["job_id"].as<std::string>(), "queued-job");
  EXPECT_EQ(remaining_rows[0]["status"].as<std::string>(), "queued");
  EXPECT_EQ(remaining_rows[1]["job_id"].as<std::string>(), "running-job");
  EXPECT_EQ(remaining_rows[1]["status"].as<std::string>(), "running");
}

} // namespace
