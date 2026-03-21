#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/e2e_helpers.sh"

e2e_init "$@"
osrm_ready_file="${work_dir}/osrm-nearest-ready.json"
health_file="${work_dir}/health.json"
payload_file="${work_dir}/optimize-payload.json"
submit_response_file="${work_dir}/optimize-submit-response.json"
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
    { "id": "order-1", "location": [7.4212, 43.7308], "demand": 2, "service": 180 },
    { "id": "order-2", "location": [7.4261, 43.7412], "demand": 1, "service": 120 }
  ]
}
JSON

http_code="$("${curl_bin}" -sS -o "${submit_response_file}" -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: e2e-valid-payload" \
  --data-binary "@${payload_file}" \
  "http://127.0.0.1:${api_port}/api/v1/deliveries/optimize")"

if [[ "${http_code}" != "202" ]]; then
  echo "expected HTTP 202 from deliveries optimize submission, got ${http_code}" >&2
  cat "${submit_response_file}" >&2 || true
  exit 1
fi

job_id="$(e2e_extract_json_string job_id "${submit_response_file}")"
if [[ -z "${job_id}" ]]; then
  echo "submit response did not include a job_id" >&2
  cat "${submit_response_file}" >&2 || true
  exit 1
fi

e2e_wait_for_job_success "${job_id}" "${status_response_file}"

for key in job_id status result; do
  if ! grep -Eq '"'"${key}"'"[[:space:]]*:' "${status_response_file}"; then
    echo "job status response missing key ${key}" >&2
    cat "${status_response_file}" >&2 || true
    exit 1
  fi
done

for key in summary routes unassigned; do
  if ! grep -Eq '"'"${key}"'"[[:space:]]*:' "${status_response_file}"; then
    echo "optimization result missing key ${key}" >&2
    cat "${status_response_file}" >&2 || true
    exit 1
  fi
done
