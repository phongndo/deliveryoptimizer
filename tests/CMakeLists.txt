find_package(GTest CONFIG REQUIRED)
find_package(JsonCpp CONFIG REQUIRED)
include(GoogleTest)

set(
  DELIVERYOPTIMIZER_TEST_COMPONENT_DIRS
  adapters
  application
  config
  domain
)

set(DELIVERYOPTIMIZER_TEST_SOURCES)
foreach(component_dir IN LISTS DELIVERYOPTIMIZER_TEST_COMPONENT_DIRS)
  file(
    GLOB_RECURSE component_sources
    CONFIGURE_DEPENDS
    "${CMAKE_CURRENT_SOURCE_DIR}/${component_dir}/*.cpp"
  )
  list(APPEND DELIVERYOPTIMIZER_TEST_SOURCES ${component_sources})
endforeach()
list(SORT DELIVERYOPTIMIZER_TEST_SOURCES)

add_executable(deliveryoptimizer_tests ${DELIVERYOPTIMIZER_TEST_SOURCES})
target_compile_features(deliveryoptimizer_tests PRIVATE cxx_std_20)
target_compile_definitions(
  deliveryoptimizer_tests
  PRIVATE
    DELIVERYOPTIMIZER_SOURCE_DIR="${CMAKE_SOURCE_DIR}"
)
target_link_libraries(
  deliveryoptimizer_tests
  PRIVATE
    deliveryoptimizer::adapters
    GTest::gtest_main
    JsonCpp::JsonCpp
)
add_dependencies(deliveryoptimizer_tests deliveryoptimizer_api)

if(DELIVERYOPTIMIZER_ENABLE_WARNINGS)
  deliveryoptimizer_set_warnings(deliveryoptimizer_tests)
endif()

gtest_discover_tests(deliveryoptimizer_tests DISCOVERY_TIMEOUT 30)

find_program(BASH_PROGRAM bash REQUIRED)
find_program(CURL_PROGRAM curl REQUIRED)
find_program(DOCKER_PROGRAM docker)

add_test(
  NAME DeliveryOptimizerApiTest.HealthAndOptimize
  COMMAND "${BASH_PROGRAM}" "${CMAKE_CURRENT_SOURCE_DIR}/integration/http_server/health_and_optimize_test.sh"
          "$<TARGET_FILE:deliveryoptimizer_api>" "${CURL_PROGRAM}"
)
set_tests_properties(DeliveryOptimizerApiTest.HealthAndOptimize PROPERTIES TIMEOUT 30)

add_test(
  NAME DeliveryOptimizerApiValidationTest.OptimizeRejectsNegativeDeliveries
  COMMAND "${BASH_PROGRAM}"
          "${CMAKE_CURRENT_SOURCE_DIR}/integration/http_server/optimize_rejects_negative_deliveries_test.sh"
          "$<TARGET_FILE:deliveryoptimizer_api>" "${CURL_PROGRAM}"
)
set_tests_properties(DeliveryOptimizerApiValidationTest.OptimizeRejectsNegativeDeliveries PROPERTIES TIMEOUT 30)

add_test(
  NAME DeliveryOptimizerApiValidationTest.OptimizeRejectsExcessiveDeliveries
  COMMAND "${BASH_PROGRAM}"
          "${CMAKE_CURRENT_SOURCE_DIR}/integration/http_server/optimize_rejects_excessive_deliveries_test.sh"
          "$<TARGET_FILE:deliveryoptimizer_api>" "${CURL_PROGRAM}"
)
set_tests_properties(DeliveryOptimizerApiValidationTest.OptimizeRejectsExcessiveDeliveries PROPERTIES TIMEOUT 30)

add_test(
  NAME DeliveryOptimizerApiContractTest.DeliveriesOptimizePreservesVehicleStartEnd
  COMMAND "${BASH_PROGRAM}"
          "${CMAKE_CURRENT_SOURCE_DIR}/integration/http_server/deliveries_optimize_preserves_vehicle_start_end_test.sh"
          "$<TARGET_FILE:deliveryoptimizer_api>" "${CURL_PROGRAM}"
)
set_tests_properties(DeliveryOptimizerApiContractTest.DeliveriesOptimizePreservesVehicleStartEnd PROPERTIES TIMEOUT 30)

add_test(
  NAME DeliveryOptimizerApiContractTest.DeliveriesOptimizeResponseIncludesExternalIds
  COMMAND "${BASH_PROGRAM}"
          "${CMAKE_CURRENT_SOURCE_DIR}/integration/http_server/deliveries_optimize_response_includes_external_ids_test.sh"
          "$<TARGET_FILE:deliveryoptimizer_api>" "${CURL_PROGRAM}"
)
set_tests_properties(DeliveryOptimizerApiContractTest.DeliveriesOptimizeResponseIncludesExternalIds PROPERTIES TIMEOUT 30)

add_test(
  NAME DeliveryOptimizerApiContractTest.HealthReportsDependencyReadiness
  COMMAND "${BASH_PROGRAM}"
          "${CMAKE_CURRENT_SOURCE_DIR}/integration/http_server/health_reports_dependency_readiness_test.sh"
          "$<TARGET_FILE:deliveryoptimizer_api>" "${CURL_PROGRAM}"
)
set_tests_properties(DeliveryOptimizerApiContractTest.HealthReportsDependencyReadiness PROPERTIES TIMEOUT 30)

add_test(
  NAME DeliveryOptimizerApiContractTest.DeliveriesOptimizeMissingServiceDefaultsTo300
  COMMAND "${BASH_PROGRAM}"
          "${CMAKE_CURRENT_SOURCE_DIR}/integration/http_server/deliveries_optimize_missing_service_defaults_to_300_test.sh"
          "$<TARGET_FILE:deliveryoptimizer_api>" "${CURL_PROGRAM}"
)
set_tests_properties(DeliveryOptimizerApiContractTest.DeliveriesOptimizeMissingServiceDefaultsTo300 PROPERTIES TIMEOUT 30)

if(DOCKER_PROGRAM)
  set(DELIVERYOPTIMIZER_E2E_ENV_FILE "${CMAKE_SOURCE_DIR}/tests/integration/e2e/e2e_stack.env")
  set(DELIVERYOPTIMIZER_E2E_COMPOSE_FILE "${CMAKE_SOURCE_DIR}/deploy/compose/docker-compose.arm64.yml")

  function(deliveryoptimizer_add_docker_e2e_test test_name script_name timeout_seconds)
    add_test(
      NAME ${test_name}
      COMMAND "${BASH_PROGRAM}" "${CMAKE_CURRENT_SOURCE_DIR}/integration/e2e/${script_name}"
              "${DELIVERYOPTIMIZER_E2E_ENV_FILE}" "${DELIVERYOPTIMIZER_E2E_COMPOSE_FILE}"
              "${DOCKER_PROGRAM}" "${CURL_PROGRAM}"
    )
    set_tests_properties(
      ${test_name}
      PROPERTIES
        DISABLED TRUE
        RUN_SERIAL TRUE
        TIMEOUT ${timeout_seconds}
    )
  endfunction()

  function(deliveryoptimizer_add_docker_api_e2e_test test_name script_name timeout_seconds)
    add_test(
      NAME ${test_name}
      COMMAND "${BASH_PROGRAM}" "${CMAKE_CURRENT_SOURCE_DIR}/integration/e2e/${script_name}"
              "${DELIVERYOPTIMIZER_E2E_ENV_FILE}" "${DELIVERYOPTIMIZER_E2E_COMPOSE_FILE}"
              "${DOCKER_PROGRAM}" "${CURL_PROGRAM}"
    )
    set_tests_properties(
      ${test_name}
      PROPERTIES
        RUN_SERIAL TRUE
        TIMEOUT ${timeout_seconds}
        LABELS "e2e;api"
    )
  endfunction()

  add_test(
    NAME DeliveryOptimizerRoutingSmokeTest.OsrmAndVroom
    COMMAND
      "${BASH_PROGRAM}" "${CMAKE_CURRENT_SOURCE_DIR}/integration/routing/osrm_and_vroom_smoketest.sh"
      "${CMAKE_SOURCE_DIR}/tests/integration/routing/routing_smoketest.env"
      "${CMAKE_SOURCE_DIR}/deploy/compose/docker-compose.arm64.yml"
      "${DOCKER_PROGRAM}" "${CURL_PROGRAM}"
  )
  set_tests_properties(
    DeliveryOptimizerRoutingSmokeTest.OsrmAndVroom
    PROPERTIES
      DISABLED TRUE
      RUN_SERIAL TRUE
      TIMEOUT 1800
  )

  deliveryoptimizer_add_docker_e2e_test(
    DeliveryOptimizerE2ETest.OsrmNearestReturnsOk
    osrm_nearest_returns_ok_e2e_test.sh
    1800
  )
  deliveryoptimizer_add_docker_e2e_test(
    DeliveryOptimizerE2ETest.VroomHelpIsAvailable
    vroom_help_is_available_e2e_test.sh
    1800
  )
  deliveryoptimizer_add_docker_e2e_test(
    DeliveryOptimizerE2ETest.HealthEndpointReturnsOk
    health_endpoint_returns_ok_e2e_test.sh
    1800
  )
  deliveryoptimizer_add_docker_e2e_test(
    DeliveryOptimizerE2ETest.OptimizeValidQueryReturnsSummary
    optimize_valid_query_returns_summary_e2e_test.sh
    1800
  )
  deliveryoptimizer_add_docker_e2e_test(
    DeliveryOptimizerE2ETest.OptimizeRejectsNegativeDeliveries
    optimize_rejects_negative_deliveries_e2e_test.sh
    1800
  )
  deliveryoptimizer_add_docker_e2e_test(
    DeliveryOptimizerE2ETest.OptimizeRejectsExcessiveDeliveries
    optimize_rejects_excessive_deliveries_e2e_test.sh
    1800
  )

  deliveryoptimizer_add_docker_api_e2e_test(
    DeliveryOptimizerE2ETest.OsrmProxyNearestReturnsOk
    osrm_proxy_nearest_returns_ok_e2e_test.sh
    2400
  )
  deliveryoptimizer_add_docker_api_e2e_test(
    DeliveryOptimizerE2ETest.OsrmProxyBlocksTileService
    osrm_proxy_blocks_tile_service_e2e_test.sh
    2400
  )
  deliveryoptimizer_add_docker_api_e2e_test(
    DeliveryOptimizerE2ETest.DeliveriesOptimizeValidPayloadReturnsRoutingResponse
    deliveries_optimize_valid_payload_returns_routing_response_e2e_test.sh
    2400
  )
  deliveryoptimizer_add_docker_api_e2e_test(
    DeliveryOptimizerE2ETest.DeliveriesOptimizeInvalidPayloadReturnsValidationError
    deliveries_optimize_invalid_payload_returns_validation_error_e2e_test.sh
    2400
  )
  deliveryoptimizer_add_docker_api_e2e_test(
    DeliveryOptimizerE2ETest.DeliveriesOptimizeMalformedJsonReturnsParseError
    deliveries_optimize_malformed_json_returns_parse_error_e2e_test.sh
    2400
  )
endif()
