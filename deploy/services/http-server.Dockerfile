# syntax=docker/dockerfile:1.7

ARG UBUNTU_VERSION=24.04
ARG CONAN_VERSION=2.9.2
ARG VROOM_REF=v1.14.0
ARG VROOM_COMMIT=1fd711bc8c20326dd8e9538e2c7e4cb1ebd67bdb
ARG VROOM_BUILD_JOBS=2

FROM --platform=$TARGETPLATFORM ubuntu:${UBUNTU_VERSION} AS builder
ARG CONAN_VERSION
ARG VROOM_REF
ARG VROOM_COMMIT
ARG VROOM_BUILD_JOBS
ARG TARGETPLATFORM

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    CONAN_HOME=/tmp/conan-home \
    PATH=/opt/venv/bin:$PATH

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends \
      build-essential \
      ccache \
      cmake \
      git \
      libasio-dev \
      libboost-all-dev \
      liblua5.3-dev \
      libssl-dev \
      ninja-build \
      pkg-config \
      python3 \
      python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir "conan==${CONAN_VERSION}"

WORKDIR /workspace

COPY conanfile.py CMakeLists.txt ./
COPY cmake ./cmake
COPY app/api ./app/api
COPY db ./db
COPY libs ./libs

RUN --mount=type=cache,target=/tmp/conan-home,sharing=locked \
    conan profile detect --force \
    && conan install . \
      --output-folder=build \
      --build=missing \
      -s:h build_type=Release \
      -s:b build_type=Release \
    && cmake -S . -B build/build/Release \
      -G "Unix Makefiles" \
      -DCMAKE_TOOLCHAIN_FILE=build/build/Release/generators/conan_toolchain.cmake \
      -DCMAKE_BUILD_TYPE=Release \
      -DDELIVERYOPTIMIZER_ENABLE_TESTS=OFF \
    && cmake --build build/build/Release \
      --target deliveryoptimizer_api deliveryoptimizer_worker deliveryoptimizer_migrate \
      -j"$(nproc)" \
    && { \
      strip build/build/Release/app/api/deliveryoptimizer-api || true; \
      strip build/build/Release/app/api/deliveryoptimizer-worker || true; \
      strip build/build/Release/app/api/deliveryoptimizer-migrate || true; \
    } \
    && git clone --recurse-submodules --shallow-submodules --depth 1 --branch "${VROOM_REF}" \
      https://github.com/VROOM-Project/vroom.git /tmp/vroom \
    && git -C /tmp/vroom fetch --depth 1 origin "${VROOM_COMMIT}" \
    && git -C /tmp/vroom checkout "${VROOM_COMMIT}" \
    && make -C /tmp/vroom/src -j"${VROOM_BUILD_JOBS}" \
    && install -D /tmp/vroom/bin/vroom /usr/local/bin/vroom \
    && { strip /usr/local/bin/vroom || true; } \
    && bash -euo pipefail -c '\
      API_ROOT="/tmp/api-runtime-root"; \
      WORKER_ROOT="/tmp/worker-runtime-root"; \
      COMMON_LIB_DIR="/tmp/runtime-libs"; \
      API_BINARY="$(find /workspace/build -type f -name deliveryoptimizer-api -print -quit)"; \
      WORKER_BINARY="$(find /workspace/build -type f -name deliveryoptimizer-worker -print -quit)"; \
      MIGRATE_BINARY="$(find /workspace/build -type f -name deliveryoptimizer-migrate -print -quit)"; \
      test -n "${API_BINARY}"; \
      test -n "${WORKER_BINARY}"; \
      test -n "${MIGRATE_BINARY}"; \
      mkdir -p \
        "${API_ROOT}/usr/local/bin" \
        "${API_ROOT}/opt/runtime-libs" \
        "${WORKER_ROOT}/usr/local/bin" \
        "${WORKER_ROOT}/opt/runtime-libs" \
        "${WORKER_ROOT}/opt/deliveryoptimizer/db/migrations" \
        "${COMMON_LIB_DIR}"; \
      cp "${API_BINARY}" "${API_ROOT}/usr/local/bin/deliveryoptimizer-api"; \
      cp "${WORKER_BINARY}" "${WORKER_ROOT}/usr/local/bin/deliveryoptimizer-worker"; \
      cp "${MIGRATE_BINARY}" "${WORKER_ROOT}/usr/local/bin/deliveryoptimizer-migrate"; \
      cp /usr/local/bin/vroom "${WORKER_ROOT}/usr/local/bin/vroom"; \
      cp /workspace/db/migrations/*.sql "${WORKER_ROOT}/opt/deliveryoptimizer/db/migrations/"; \
      { \
        ldd "${API_BINARY}"; \
        ldd "${WORKER_BINARY}"; \
        ldd "${MIGRATE_BINARY}"; \
        ldd /usr/local/bin/vroom; \
      } \
        | awk "{if (\$3 ~ /^\\//) print \$3; else if (\$1 ~ /^\\//) print \$1}" \
        | sort -u \
        | while read -r lib; do cp -L "${lib}" "${COMMON_LIB_DIR}/"; done; \
      cp -R "${COMMON_LIB_DIR}/." "${API_ROOT}/opt/runtime-libs/"; \
      cp -R "${COMMON_LIB_DIR}/." "${WORKER_ROOT}/opt/runtime-libs/"; \
    '

FROM --platform=$TARGETPLATFORM ubuntu:${UBUNTU_VERSION} AS runtime-base
ENV DEBIAN_FRONTEND=noninteractive
ENV LD_LIBRARY_PATH=/opt/runtime-libs

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
    && groupadd --system --gid 10001 deliveryoptimizer \
    && useradd --system --uid 10001 --gid 10001 --create-home deliveryoptimizer \
    && rm -rf /var/lib/apt/lists/*

FROM runtime-base AS api-runtime
COPY --from=builder /tmp/api-runtime-root/usr/local/bin/deliveryoptimizer-api /usr/local/bin/deliveryoptimizer-api
COPY --from=builder /tmp/api-runtime-root/opt/runtime-libs/ /opt/runtime-libs/

USER deliveryoptimizer
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl --fail --silent http://127.0.0.1:8080/health >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/deliveryoptimizer-api"]

FROM runtime-base AS worker-runtime
ENV VROOM_BIN=/usr/local/bin/vroom
ENV VROOM_ROUTER=osrm
ENV VROOM_HOST=osrm
ENV VROOM_PORT=5001
ENV VROOM_TIMEOUT_SECONDS=30
ENV DELIVERYOPTIMIZER_MIGRATIONS_DIR=/opt/deliveryoptimizer/db/migrations

COPY --from=builder /tmp/worker-runtime-root/usr/local/bin/deliveryoptimizer-worker /usr/local/bin/deliveryoptimizer-worker
COPY --from=builder /tmp/worker-runtime-root/usr/local/bin/deliveryoptimizer-migrate /usr/local/bin/deliveryoptimizer-migrate
COPY --from=builder /tmp/worker-runtime-root/usr/local/bin/vroom /usr/local/bin/vroom
COPY --from=builder /tmp/worker-runtime-root/opt/runtime-libs/ /opt/runtime-libs/
COPY --from=builder /tmp/worker-runtime-root/opt/deliveryoptimizer/ /opt/deliveryoptimizer/

USER deliveryoptimizer

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["/usr/local/bin/deliveryoptimizer-worker", "--healthcheck"]

ENTRYPOINT ["/usr/local/bin/deliveryoptimizer-worker"]
