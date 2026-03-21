# Delivery Optimizer

This branch provides the C++ API runtime, a PostgreSQL-backed async optimization queue, worker runtime, and ARM routing stack assets (OSRM + VROOM).

## Contributor Docs

- C++ local environment setup: `docs/cpp-local-contributor-setup.md`
- ARM deployment assets: `docs/http-server-arm-deployment.md`

## Repository Layout

- `app/api`: C++ HTTP server entrypoint and endpoint modules.
- `libs`: domain/application/adapter libraries.
- `deploy`: Dockerfiles, compose files, and env files.
- `tests`: C++ tests, local HTTP integration tests, and routing smoke tests.
- `app/ui`: Next.js frontend.

## API Endpoints

- `GET /health`
- `GET /optimize?deliveries=<n>&vehicles=<n>`
- `POST /api/v1/deliveries/optimize`
- `GET /api/v1/deliveries/optimize/<job_id>`
- `GET /api/v1/osrm/*` (allowlisted OSRM services)

Example:

```bash
curl -X POST http://127.0.0.1:8080/api/v1/deliveries/optimize \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: example-request-1' \
  --data-binary '{
    "depot": { "location": [-122.4194, 37.7749] },
    "vehicles": [{ "id": "van-1", "capacity": 8 }],
    "jobs": [{ "id": "order-1", "location": [-122.4183, 37.7758], "demand": 1 }]
  }'
```

Successful submissions return `202 Accepted` with a `job_id`, `poll_url`, and `Location` header. Poll the job resource until `status` becomes `succeeded` or `failed`.

```bash
curl -f http://127.0.0.1:8080/api/v1/deliveries/optimize/<job_id>
```

If `jobs[].demand` is omitted, the API defaults it to `1`. If `jobs[].service` is omitted, the API defaults it to `300` seconds. Reusing the same `Idempotency-Key` with the same canonical payload returns the existing job; reusing it with a different payload returns `409 Conflict`.

## Build (C++)

```bash
conan profile detect --force
conan install . --output-folder=build --build=missing -s build_type=Release
cmake -S . -B build/build/Release \
  -DCMAKE_TOOLCHAIN_FILE=build/build/Release/generators/conan_toolchain.cmake \
  -DCMAKE_BUILD_TYPE=Release
cmake --build build/build/Release
ctest --test-dir build/build/Release --output-on-failure
```

Run:

```bash
./build/build/Release/app/api/deliveryoptimizer-migrate
./build/build/Release/app/api/deliveryoptimizer-api
./build/build/Release/app/api/deliveryoptimizer-worker
```

## Routing Stack (Docker)

```bash
docker compose \
  --env-file deploy/env/http-server.arm64.env \
  -f deploy/compose/docker-compose.arm64.yml \
  up --build -d
```

Quick checks:

```bash
curl -f http://127.0.0.1:8080/health
curl -f "http://127.0.0.1:5001/nearest/v1/driving/-122.4194,37.7749?number=1&generate_hints=false"
docker compose \
  --env-file deploy/env/http-server.arm64.env \
  -f deploy/compose/docker-compose.arm64.yml \
  exec worker vroom --help
```

## UI

- Node.js `>=20.9.0`

```bash
npm --prefix app/ui install
npm --prefix app/ui run dev
```

Open `http://localhost:3000`.
