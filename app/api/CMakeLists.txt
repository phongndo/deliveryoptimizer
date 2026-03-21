find_package(Drogon CONFIG REQUIRED)
find_package(jsoncpp CONFIG REQUIRED)

add_library(deliveryoptimizer_job_runtime)
target_sources(
  deliveryoptimizer_job_runtime
  PRIVATE
    src/jobs/job_store.cpp
    src/jobs/migrator.cpp
    src/jobs/optimize_job.cpp
    src/jobs/runtime_options.cpp
    src/jobs/vroom_runner.cpp
    src/jobs/worker.cpp
  PUBLIC
    FILE_SET HEADERS
    BASE_DIRS include
    FILES
      include/deliveryoptimizer/api/jobs/job_store.hpp
      include/deliveryoptimizer/api/jobs/migrator.hpp
      include/deliveryoptimizer/api/jobs/optimize_job.hpp
      include/deliveryoptimizer/api/jobs/runtime_options.hpp
      include/deliveryoptimizer/api/jobs/vroom_runner.hpp
      include/deliveryoptimizer/api/jobs/worker.hpp
)
target_include_directories(deliveryoptimizer_job_runtime PUBLIC include)
target_compile_features(deliveryoptimizer_job_runtime PUBLIC cxx_std_20)
target_link_libraries(
  deliveryoptimizer_job_runtime
  PUBLIC
    deliveryoptimizer::adapters
  PRIVATE
    Drogon::Drogon
    JsonCpp::JsonCpp
)

if(DELIVERYOPTIMIZER_ENABLE_WARNINGS)
  deliveryoptimizer_set_warnings(deliveryoptimizer_job_runtime)
endif()

add_library(deliveryoptimizer_api_runtime)
target_sources(
  deliveryoptimizer_api_runtime
  PRIVATE
    src/api_server.cpp
    src/endpoints/deliveries_optimize_endpoint.cpp
    src/endpoints/health_endpoint.cpp
    src/endpoints/optimize_endpoint.cpp
    src/endpoints/optimize_job_status_endpoint.cpp
    src/endpoints/osrm_proxy_endpoint.cpp
    src/server_options.cpp
  PUBLIC
    FILE_SET HEADERS
    BASE_DIRS include
    FILES
      include/deliveryoptimizer/api/api_server.hpp
      include/deliveryoptimizer/api/endpoints/deliveries_optimize_endpoint.hpp
      include/deliveryoptimizer/api/endpoints/health_endpoint.hpp
      include/deliveryoptimizer/api/endpoints/optimize_endpoint.hpp
      include/deliveryoptimizer/api/endpoints/optimize_job_status_endpoint.hpp
      include/deliveryoptimizer/api/endpoints/osrm_proxy_endpoint.hpp
      include/deliveryoptimizer/api/server_options.hpp
)
target_include_directories(deliveryoptimizer_api_runtime PUBLIC include)
target_compile_features(deliveryoptimizer_api_runtime PUBLIC cxx_std_20)
target_link_libraries(
  deliveryoptimizer_api_runtime
  PUBLIC
    deliveryoptimizer_job_runtime
    deliveryoptimizer::adapters
  PRIVATE
    Drogon::Drogon
)

if(DELIVERYOPTIMIZER_ENABLE_WARNINGS)
  deliveryoptimizer_set_warnings(deliveryoptimizer_api_runtime)
endif()

add_executable(deliveryoptimizer_api src/main.cpp)
target_compile_features(deliveryoptimizer_api PRIVATE cxx_std_20)
target_link_libraries(deliveryoptimizer_api PRIVATE deliveryoptimizer_api_runtime)

if(DELIVERYOPTIMIZER_ENABLE_WARNINGS)
  deliveryoptimizer_set_warnings(deliveryoptimizer_api)
endif()

set_target_properties(deliveryoptimizer_api PROPERTIES OUTPUT_NAME deliveryoptimizer-api)

add_executable(deliveryoptimizer_worker src/worker_main.cpp)
target_compile_features(deliveryoptimizer_worker PRIVATE cxx_std_20)
target_link_libraries(deliveryoptimizer_worker PRIVATE deliveryoptimizer_job_runtime)

if(DELIVERYOPTIMIZER_ENABLE_WARNINGS)
  deliveryoptimizer_set_warnings(deliveryoptimizer_worker)
endif()

set_target_properties(deliveryoptimizer_worker PROPERTIES OUTPUT_NAME deliveryoptimizer-worker)

add_executable(deliveryoptimizer_migrate src/migrate_main.cpp)
target_compile_features(deliveryoptimizer_migrate PRIVATE cxx_std_20)
target_link_libraries(
  deliveryoptimizer_migrate
  PRIVATE
    deliveryoptimizer_job_runtime
    Drogon::Drogon
)

if(DELIVERYOPTIMIZER_ENABLE_WARNINGS)
  deliveryoptimizer_set_warnings(deliveryoptimizer_migrate)
endif()

set_target_properties(deliveryoptimizer_migrate PROPERTIES OUTPUT_NAME deliveryoptimizer-migrate)
