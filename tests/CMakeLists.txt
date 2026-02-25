find_package(GTest CONFIG REQUIRED)
find_package(JsonCpp CONFIG REQUIRED)
include(GoogleTest)

add_executable(
  deliveryoptimizer_tests
  adapters/osrm_contract/builds_route_path_with_stable_query_contract_test.cpp
  adapters/osrm_contract/builds_table_path_with_stable_query_contract_test.cpp
  adapters/osrm_contract/route_path_requires_at_least_two_coordinates_test.cpp
  adapters/osrm_contract/table_path_requires_at_least_two_coordinates_test.cpp
  adapters/routing_facade/returns_no_plan_when_deliveries_missing_test.cpp
  adapters/routing_facade/returns_no_plan_when_vehicles_missing_test.cpp
  adapters/routing_facade/returns_optimized_plan_for_valid_inputs_test.cpp
  adapters/vroom_contract/build_solve_payload_creates_expected_entity_counts_test.cpp
  adapters/vroom_contract/describe_solve_summary_uses_stable_contract_test.cpp
  adapters/vroom_contract/parse_solve_summary_reads_routes_and_unassigned_test.cpp
  adapters/vroom_contract/parse_solve_summary_returns_nullopt_for_invalid_json_test.cpp
  adapters/vroom_contract/parse_solve_summary_returns_nullopt_when_summary_is_missing_test.cpp
  application/optimize_service/returns_no_plan_when_deliveries_missing_test.cpp
  application/optimize_service/returns_no_plan_when_vehicles_missing_test.cpp
  application/optimize_service/returns_optimized_summary_when_inputs_valid_test.cpp
  domain/problem/describe_problem_uses_stable_contract_test.cpp
  domain/problem/empty_when_deliveries_missing_test.cpp
  domain/problem/empty_when_vehicles_missing_test.cpp
  domain/problem/not_empty_when_inputs_present_test.cpp
)
target_compile_features(deliveryoptimizer_tests PRIVATE cxx_std_20)
target_link_libraries(
  deliveryoptimizer_tests
  PRIVATE
    deliveryoptimizer::application
    deliveryoptimizer::domain
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

add_test(
  NAME DeliveryOptimizerApiTest.HealthAndOptimize
  COMMAND "${BASH_PROGRAM}" "${CMAKE_CURRENT_SOURCE_DIR}/integration/http_server/health_and_optimize_test.sh"
          "$<TARGET_FILE:deliveryoptimizer_api>" "${CURL_PROGRAM}"
)
set_tests_properties(DeliveryOptimizerApiTest.HealthAndOptimize PROPERTIES TIMEOUT 30)
