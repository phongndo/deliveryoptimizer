#include "deliveryoptimizer/api/jobs/vroom_runner.hpp"

#include <gtest/gtest.h>

#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <string>
#include <string_view>
#include <system_error>
#include <utility>
#include <vector>

#include <unistd.h>

namespace {

using deliveryoptimizer::api::jobs::IsVroomBinaryAvailable;
using deliveryoptimizer::api::jobs::VroomRuntimeConfig;

class ScopedTempPath {
public:
  static ScopedTempPath Create(const std::string_view prefix) {
    std::error_code error;
    const std::filesystem::path temp_dir = std::filesystem::temp_directory_path(error);
    EXPECT_FALSE(error);

    std::string template_path = (temp_dir / (std::string{prefix} + "XXXXXX")).string();
    std::vector<char> writable_template(template_path.begin(), template_path.end());
    writable_template.push_back('\0');

    const int file_descriptor = mkstemp(writable_template.data());
    EXPECT_NE(file_descriptor, -1);
    if (file_descriptor != -1) {
      (void)close(file_descriptor);
    }

    return ScopedTempPath(std::string{writable_template.data()});
  }

  explicit ScopedTempPath(std::string path) : path_(std::move(path)) {}

  ScopedTempPath(const ScopedTempPath&) = delete;
  ScopedTempPath& operator=(const ScopedTempPath&) = delete;

  ScopedTempPath(ScopedTempPath&& other) noexcept : path_(std::move(other.path_)) {
    other.path_.clear();
  }

  ScopedTempPath& operator=(ScopedTempPath&& other) noexcept {
    if (this == &other) {
      return *this;
    }

    Remove();
    path_ = std::move(other.path_);
    other.path_.clear();
    return *this;
  }

  ~ScopedTempPath() { Remove(); }

  [[nodiscard]] const std::string& path() const { return path_; }

private:
  void Remove() {
    if (path_.empty()) {
      return;
    }

    std::error_code error;
    (void)std::filesystem::remove(path_, error);
  }

  std::string path_;
};

void WriteExecutableFile(const std::string& path, const std::string_view contents) {
  std::ofstream output(path, std::ios::binary | std::ios::trunc);
  ASSERT_TRUE(output.is_open());
  output << contents;
  ASSERT_TRUE(output.good());
  output.close();

  std::error_code error;
  std::filesystem::permissions(
      path,
      std::filesystem::perms::owner_read | std::filesystem::perms::owner_write |
          std::filesystem::perms::owner_exec,
      std::filesystem::perm_options::replace, error);
  ASSERT_FALSE(error);
}

VroomRuntimeConfig BuildProbeConfig(const std::string& vroom_bin) {
  return VroomRuntimeConfig{
      .vroom_bin = vroom_bin,
      .vroom_router = "osrm",
      .vroom_host = "127.0.0.1",
      .vroom_port = "5001",
      .timeout_seconds = 30,
  };
}

TEST(VroomRunnerTest, BinaryAvailabilityAcceptsRunnableExecutable) {
  auto script = ScopedTempPath::Create("deliveryoptimizer-vroom-script-");
  ASSERT_FALSE(script.path().empty());
  WriteExecutableFile(script.path(), "#!/bin/sh\nexit 0\n");

  EXPECT_TRUE(IsVroomBinaryAvailable(BuildProbeConfig(script.path())));
}

TEST(VroomRunnerTest, BinaryAvailabilityRejectsExecFormatFailures) {
  auto invalid_binary = ScopedTempPath::Create("deliveryoptimizer-vroom-invalid-");
  ASSERT_FALSE(invalid_binary.path().empty());
  WriteExecutableFile(invalid_binary.path(), "this is not a runnable executable\n");

  EXPECT_FALSE(IsVroomBinaryAvailable(BuildProbeConfig(invalid_binary.path())));
}

} // namespace
