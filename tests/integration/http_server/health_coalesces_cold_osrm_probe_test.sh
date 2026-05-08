#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tests/integration/http_server/http_server_helpers.sh
source "${script_dir}/http_server_helpers.sh"

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <server-binary> <python-binary> [curl-binary]" >&2
  exit 2
fi

python_bin="$2"
curl_bin="${3:-curl}"
stub_default_port="$((53000 + ($$ % 10000)))"
stub_port="${DELIVERYOPTIMIZER_OSRM_STUB_PORT:-${stub_default_port}}"

http_server_init 36500 "$1" "${curl_bin}"
ready_file="${work_dir}/stub-ready.txt"
probe_count_file="${work_dir}/probe-count.txt"
stub_log_file="${work_dir}/stub.log"
rm -f "${ready_file}" "${probe_count_file}"

http_server_cleanup_with_stub() {
  if [[ -n "${stub_pid:-}" ]]; then
    kill "${stub_pid}" >/dev/null 2>&1 || true
    wait "${stub_pid}" >/dev/null 2>&1 || true
  fi
  http_server_cleanup
}
trap http_server_cleanup_with_stub EXIT

env STUB_PORT="${stub_port}" PROBE_COUNT_FILE="${probe_count_file}" READY_FILE="${ready_file}" \
  "${python_bin}" - >"${stub_log_file}" 2>&1 <<'PY' &
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

port = int(os.environ["STUB_PORT"])
probe_count_file = os.environ["PROBE_COUNT_FILE"]
ready_file = os.environ["READY_FILE"]
lock = threading.Lock()
probe_count = 0


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        global probe_count
        if self.path.startswith("/nearest/v1/driving/"):
            time.sleep(0.4)
            with lock:
                probe_count += 1
                with open(probe_count_file, "w", encoding="utf-8") as count_file:
                    count_file.write(str(probe_count))

        payload = b'{"code":"Ok"}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        return


server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
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

http_server_start VROOM_BIN="/tmp/does-not-exist-vroom" OSRM_URL="http://127.0.0.1:${stub_port}"

server_ready=false
for _ in $(seq 1 50); do
  http_code="$("${curl_bin}" -sS -o /dev/null -w "%{http_code}" \
    "$(http_server_url /api/v1/osrm/tile/v1/driving/0/0/0.mvt)" || true)"
  if [[ "${http_code}" == "403" ]]; then
    server_ready=true
    break
  fi
  sleep 0.1
done

if [[ "${server_ready}" != "true" ]]; then
  echo "server failed to start on port ${port}" >&2
  cat "${log_file}" >&2 || true
  exit 1
fi

pids=()
for index in $(seq 1 5); do
  "${curl_bin}" -sS -o "${work_dir}/health-${index}.json" -w "%{http_code}" \
    "$(http_server_url /health)" >"${work_dir}/health-${index}.code" &
  pids+=("$!")
done

for pid in "${pids[@]}"; do
  wait "${pid}"
done

for index in $(seq 1 5); do
  http_code="$(cat "${work_dir}/health-${index}.code")"
  if [[ "${http_code}" != "503" ]]; then
    echo "expected concurrent /health request ${index} to return 503 with missing VROOM, got ${http_code}" >&2
    cat "${work_dir}/health-${index}.json" >&2 || true
    exit 1
  fi
done

probe_count="$(cat "${probe_count_file}")"
if [[ "${probe_count}" != "1" ]]; then
  echo "expected concurrent cold /health requests to share one OSRM probe, got ${probe_count}" >&2
  cat "${stub_log_file}" >&2 || true
  exit 1
fi
