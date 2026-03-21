#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/e2e_helpers.sh"

e2e_init "$@"
osrm_ready_file="${work_dir}/osrm-nearest-ready.json"
health_file="${work_dir}/health.json"
payload_file="${work_dir}/optimize-payload.json"
first_response_file="${work_dir}/optimize-first-response.json"
second_response_file="${work_dir}/optimize-second-response.json"
status_response_file="${work_dir}/optimize-status-response.json"

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

first_code="$("${curl_bin}" -sS -o "${first_response_file}" -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: e2e-replay" \
  --data-binary "@${payload_file}" \
  "http://127.0.0.1:${api_port}/api/v1/deliveries/optimize")"

if [[ "${first_code}" != "202" ]]; then
  echo "expected first submission to return HTTP 202, got ${first_code}" >&2
  cat "${first_response_file}" >&2 || true
  exit 1
fi

second_code="$("${curl_bin}" -sS -o "${second_response_file}" -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: e2e-replay" \
  --data-binary "@${payload_file}" \
  "http://127.0.0.1:${api_port}/api/v1/deliveries/optimize")"

if [[ "${second_code}" != "200" ]]; then
  echo "expected idempotent replay to return HTTP 200, got ${second_code}" >&2
  cat "${second_response_file}" >&2 || true
  exit 1
fi

first_job_id="$(e2e_extract_json_string job_id "${first_response_file}")"
second_job_id="$(e2e_extract_json_string job_id "${second_response_file}")"

if [[ -z "${first_job_id}" || -z "${second_job_id}" ]]; then
  echo "expected both responses to include a job_id" >&2
  cat "${first_response_file}" >&2 || true
  cat "${second_response_file}" >&2 || true
  exit 1
fi

if [[ "${first_job_id}" != "${second_job_id}" ]]; then
  echo "expected idempotent replay to return the same job_id" >&2
  cat "${first_response_file}" >&2 || true
  cat "${second_response_file}" >&2 || true
  exit 1
fi

e2e_wait_for_job_success "${first_job_id}" "${status_response_file}"
