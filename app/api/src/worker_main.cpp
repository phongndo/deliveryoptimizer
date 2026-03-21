#include "deliveryoptimizer/api/jobs/worker.hpp"

#include <string_view>

int main(int argc, char** argv) {
  if (argc > 1 && std::string_view{argv[1]} == "--healthcheck") {
    return deliveryoptimizer::api::jobs::RunWorkerHealthcheck();
  }

  return deliveryoptimizer::api::jobs::RunWorker();
}
