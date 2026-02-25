#!/usr/bin/env bash
set -euo pipefail

server_bin=""
curl_bin=""
port=""
work_dir=""
log_file=""
server_pid=""
HTTP_SERVER_LAST_HTTP_CODE=""

http_server_usage() {
  echo "usage: $0 <server-binary> [curl-binary]" >&2
}

http_server_init() {
  local default_port_base="$1"
  shift

  if [[ $# -lt 1 ]]; then
    http_server_usage
    exit 2
  fi

  server_bin="$1"
  curl_bin="${2:-curl}"
  default_port="$((default_port_base + ($$ % 20000)))"
  port="${DELIVERYOPTIMIZER_TEST_PORT:-${default_port}}"
  work_dir="$(mktemp -d)"
  log_file="${work_dir}/server.log"
  server_pid=""
  HTTP_SERVER_LAST_HTTP_CODE=""

  trap http_server_cleanup EXIT
}

http_server_cleanup() {
  if [[ -n "${server_pid:-}" ]]; then
    kill "${server_pid}" >/dev/null 2>&1 || true
    wait "${server_pid}" >/dev/null 2>&1 || true
  fi

  rm -rf "${work_dir:-}"
}

http_server_start() {
  env DELIVERYOPTIMIZER_PORT="${port}" "$@" "${server_bin}" >"${log_file}" 2>&1 &
  server_pid=$!
}

http_server_url() {
  local path="$1"
  if [[ "${path}" == /* ]]; then
    echo "http://127.0.0.1:${port}${path}"
    return
  fi

  echo "http://127.0.0.1:${port}/${path}"
}

http_server_wait_until_ready() {
  local path="${1:-/optimize?deliveries=1&vehicles=1}"
  local attempts="${2:-50}"
  local interval_seconds="${3:-0.2}"
  local ready=false

  for _ in $(seq 1 "${attempts}"); do
    if "${curl_bin}" -fsS "$(http_server_url "${path}")" >/dev/null 2>&1; then
      ready=true
      break
    fi
    sleep "${interval_seconds}"
  done

  if [[ "${ready}" != "true" ]]; then
    echo "server failed to start on port ${port}" >&2
    cat "${log_file}" >&2 || true
    exit 1
  fi
}

http_server_wait_until_responding() {
  local path="${1:-/health}"
  local output_file="${2:-${work_dir}/response.json}"
  local attempts="${3:-50}"
  local interval_seconds="${4:-0.2}"
  local ready=false

  for _ in $(seq 1 "${attempts}"); do
    HTTP_SERVER_LAST_HTTP_CODE="$("${curl_bin}" -sS -o "${output_file}" -w "%{http_code}" \
      "$(http_server_url "${path}")" || true)"
    if [[ "${HTTP_SERVER_LAST_HTTP_CODE}" != "000" ]]; then
      ready=true
      break
    fi
    sleep "${interval_seconds}"
  done

  if [[ "${ready}" != "true" ]]; then
    echo "server failed to start on port ${port}" >&2
    cat "${log_file}" >&2 || true
    exit 1
  fi
}
