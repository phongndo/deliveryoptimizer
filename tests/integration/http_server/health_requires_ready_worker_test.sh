#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tests/integration/http_server/http_server_helpers.sh
source "${script_dir}/http_server_helpers.sh"

if [[ $# -lt 4 ]]; then
  echo "usage: $0 <server-binary> <migrate-binary> <python-binary> <docker-binary> [curl-binary]" >&2
  exit 2
fi

server_bin="$1"
migrate_bin="$2"
python_bin="$3"
docker_bin="$4"
curl_bin="${5:-curl}"
repo_root="$(cd "${script_dir}/../../.." && pwd)"
stub_default_port="$((53000 + ($$ % 10000)))"
stub_port="${DELIVERYOPTIMIZER_OSRM_STUB_PORT:-${stub_default_port}}"
postgres_container_name="deliveryoptimizer-health-worker-test-$$"
postgres_image="postgres:16-alpine"

http_server_init 37000 "${server_bin}" "${curl_bin}"
health_file="${work_dir}/health.json"
ready_file="${work_dir}/stub-ready.txt"
stub_log_file="${work_dir}/stub.log"
rm -f "${ready_file}"

cleanup_health_requires_ready_worker() {
  if [[ -n "${stub_pid:-}" ]]; then
    kill "${stub_pid}" >/dev/null 2>&1 || true
    wait "${stub_pid}" >/dev/null 2>&1 || true
  fi
  "${docker_bin}" rm -f "${postgres_container_name}" >/dev/null 2>&1 || true
  http_server_cleanup
}
trap cleanup_health_requires_ready_worker EXIT

"${docker_bin}" run --rm -d --name "${postgres_container_name}" \
  -e POSTGRES_DB=deliveryoptimizer \
  -e POSTGRES_USER=deliveryoptimizer \
  -e POSTGRES_PASSWORD=deliveryoptimizer \
  -p 127.0.0.1::5432 \
  "${postgres_image}" >/dev/null

postgres_host_port="$("${docker_bin}" inspect --format \
  '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}' \
  "${postgres_container_name}")"
database_url="host=127.0.0.1 port=${postgres_host_port} dbname=deliveryoptimizer user=deliveryoptimizer password=deliveryoptimizer"

postgres_ready=false
for _ in $(seq 1 100); do
  if "${docker_bin}" exec "${postgres_container_name}" \
    pg_isready -U deliveryoptimizer -d deliveryoptimizer >/dev/null 2>&1; then
    postgres_ready=true
    break
  fi
  sleep 0.2
done

if [[ "${postgres_ready}" != "true" ]]; then
  echo "postgres test container failed to become ready" >&2
  "${docker_bin}" logs "${postgres_container_name}" >&2 || true
  exit 1
fi

env DELIVERYOPTIMIZER_DATABASE_URL="${database_url}" \
  DELIVERYOPTIMIZER_MIGRATIONS_DIR="${repo_root}/db/migrations" \
  "${migrate_bin}" >/dev/null

env STUB_PORT="${stub_port}" READY_FILE="${ready_file}" \
  "${python_bin}" - >"${stub_log_file}" 2>&1 <<'PY' &
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

port = int(os.environ["STUB_PORT"])
ready_file = os.environ["READY_FILE"]


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        payload = b'{"code":"Ok"}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        return


server = HTTPServer(("127.0.0.1", port), Handler)
with open(ready_file, "w", encoding="utf-8") as ready:
    ready.write("ready")
server.serve_forever()
PY
stub_pid=$!

stub_ready=false
for _ in $(seq 1 50); do
  if [[ -f "${ready_file}" ]]; then
    stub_ready=true
    break
  fi
  if ! kill -0 "${stub_pid}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

if [[ "${stub_ready}" != "true" ]]; then
  echo "OSRM stub failed to start on port ${stub_port}" >&2
  cat "${stub_log_file}" >&2 || true
  exit 1
fi

http_server_start DELIVERYOPTIMIZER_DATABASE_URL="${database_url}" \
  OSRM_URL="http://127.0.0.1:${stub_port}"
http_server_wait_until_responding "/health" "${health_file}"
http_code="${HTTP_SERVER_LAST_HTTP_CODE}"

if [[ "${http_code}" != "503" ]]; then
  echo "expected /health to return HTTP 503 when the worker is not ready, got ${http_code}" >&2
  cat "${health_file}" >&2 || true
  exit 1
fi

if ! grep -Eq '"status"[[:space:]]*:[[:space:]]*"degraded"' "${health_file}"; then
  echo "expected /health response status to be degraded when the worker is not ready" >&2
  cat "${health_file}" >&2 || true
  exit 1
fi

if ! grep -Eq '"database"[[:space:]]*:[[:space:]]*"ok"' "${health_file}"; then
  echo "expected /health to report the database as ready" >&2
  cat "${health_file}" >&2 || true
  exit 1
fi

if ! grep -Eq '"osrm"[[:space:]]*:[[:space:]]*"ok"' "${health_file}"; then
  echo "expected /health to report OSRM as ready" >&2
  cat "${health_file}" >&2 || true
  exit 1
fi

if ! grep -Eq '"worker"[[:space:]]*:[[:space:]]*"down"' "${health_file}"; then
  echo "expected /health to report the worker as down when no worker is ready" >&2
  cat "${health_file}" >&2 || true
  exit 1
fi
