#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>

namespace deliveryoptimizer::api {

struct ServerOptions {
  std::uint16_t listen_port;
  std::size_t worker_threads;
};

[[nodiscard]] std::optional<ServerOptions> LoadServerOptionsFromEnv();

} // namespace deliveryoptimizer::api
