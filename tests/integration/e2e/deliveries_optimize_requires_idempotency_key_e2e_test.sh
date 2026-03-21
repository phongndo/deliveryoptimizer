#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/e2e_helpers.sh"

e2e_init "$@"
osrm_ready_file="${work_dir}/osrm-nearest-ready.json"
health_file="${work_dir}/health.json"
payload_file="${work_dir}/optimize-payload.json"
response_file="${work_dir}/optimize-response.json"

e2e_stack_up
e2e_wait_for_osrm_nearest_ok "${osrm_ready_file}"
e2e_wait_for_api_health "${health_file}"

cat >"${payload_file}" <<'JSON'
{
  "depot": { "location": [7.4236, 43.7384] },
  "vehicles": [
    { "id": "van-1", "capacity": 8 }
  ],
  "jobs": [
    { "id": "order-1", "location": [7.4212, 43.7308], "demand": 2, "service": 180 }
  ]
}
JSON

http_code="$("${curl_bin}" -sS -o "${response_file}" -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  --data-binary "@${payload_file}" \
  "http://127.0.0.1:${api_port}/api/v1/deliveries/optimize")"

if [[ "${http_code}" != "428" ]]; then
  echo "expected HTTP 428 when Idempotency-Key is missing, got ${http_code}" >&2
  cat "${response_file}" >&2 || true
  exit 1
fi

if ! grep -Eq '"error"[[:space:]]*:[[:space:]]*"Idempotency-Key header is required\."' "${response_file}"; then
  echo "missing idempotency error was not returned" >&2
  cat "${response_file}" >&2 || true
  exit 1
fi
