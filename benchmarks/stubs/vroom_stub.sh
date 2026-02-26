#!/usr/bin/env bash
set -euo pipefail

input_path=""
output_path=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -i|--input)
      input_path="${2:-}"
      shift 2
      ;;
    --output)
      output_path="${2:-}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# Keep payload-dependent IDs stable when available.
vehicle_id=1
job_id=1

if [[ -n "${input_path}" && -f "${input_path}" ]]; then
  first_vehicle="$(jq -r '.vehicles[0].id // empty' "${input_path}" 2>/dev/null || true)"
  first_job="$(jq -r '.jobs[0].id // empty' "${input_path}" 2>/dev/null || true)"

  if [[ "${first_vehicle}" =~ ^[0-9]+$ ]] && [[ "${first_vehicle}" -gt 0 ]]; then
    vehicle_id="${first_vehicle}"
  fi

  if [[ "${first_job}" =~ ^[0-9]+$ ]] && [[ "${first_job}" -gt 0 ]]; then
    job_id="${first_job}"
  fi
fi

response_payload="$(cat <<JSON
{
  "summary": { "routes": 1, "unassigned": 0 },
  "routes": [
    {
      "vehicle": ${vehicle_id},
      "steps": [
        { "type": "start" },
        { "type": "job", "job": ${job_id} },
        { "type": "end" }
      ]
    }
  ],
  "unassigned": []
}
JSON
)"

if [[ -n "${output_path}" ]]; then
  printf '%s\n' "${response_payload}" > "${output_path}"
else
  printf '%s\n' "${response_payload}"
fi
