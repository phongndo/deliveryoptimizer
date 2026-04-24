set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

build_dir := "build/build/Release"
api_bin := build_dir + "/app/api/deliveryoptimizer-api"
jobs := env_var_or_default("JOBS", "4")

alias setup := configure-release
alias build := build-tests
alias exe := build-api
alias test := test-unit
alias ctest := ctest-custom
alias run := run-api

# Show available Just recipes.
default:
    @just --list

# Configure the Conan release build tree used by local C++ checks.
configure-release:
    nix develop -c sh -lc 'conan profile detect --force && conan install . --output-folder=build --build=missing -s build_type=Release && cmake --preset conan-release'

# Build the C++ GTest binary, or pass target=<name> for another CMake target.
build-tests target="deliveryoptimizer_tests":
    nix develop -c cmake --build {{build_dir}} --target {{target}} -j{{jobs}}

# Build the backend API executable.
build-api:
    nix develop -c cmake --build {{build_dir}} --target deliveryoptimizer_api -j{{jobs}}

# Build and run the C++ unit test suite.
test-unit: build-tests
    nix develop -c ctest --test-dir {{build_dir}} --output-on-failure -L unit

# Run CTest with custom args, for example: just ctest-custom -R SomeTest
ctest-custom *args:
    nix develop -c ctest --test-dir {{build_dir}} --output-on-failure {{args}}

# Build and run the backend API executable.
run-api *args: build-api
    nix develop -c ./{{api_bin}} {{args}}
