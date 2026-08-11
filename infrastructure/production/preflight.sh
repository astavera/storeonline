#!/usr/bin/env bash
# Performs read-only VPS and configuration checks before a canary deployment.

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
readonly COMPOSE_FILE="${SCRIPT_DIR}/compose.yml"

env_file="${1:-${REPOSITORY_ROOT}/.env.storefront-private}"
if [[ "${env_file}" != /* ]]; then
  env_file="${REPOSITORY_ROOT}/${env_file}"
fi

failures=0

pass() {
  printf 'PASS  %s\n' "$1"
}

fail() {
  printf 'FAIL  %s\n' "$1" >&2
  failures=$((failures + 1))
}

require_command() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "command available: $1"
  else
    fail "required command missing: $1"
  fi
}

env_value() {
  local name="$1"
  local line
  line="$(grep -E "^[[:space:]]*${name}=" "${env_file}" | tail -n 1 || true)"
  local value="${line#*=}"
  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"
  printf '%s' "${value}"
}

require_value() {
  local name="$1"
  local value
  value="$(env_value "${name}")"
  if [[ -n "${value}" && "${value}" != CHANGE_ME* ]]; then
    pass "environment value configured: ${name}"
  else
    fail "environment value missing or placeholder: ${name}"
  fi
}

require_value_length() {
  local name="$1"
  local minimum="$2"
  local value
  value="$(env_value "${name}")"
  if (( ${#value} >= minimum )) && [[ "${value}" != CHANGE_ME* ]]; then
    pass "secret length accepted: ${name}"
  else
    fail "secret must contain at least ${minimum} characters: ${name}"
  fi
}

require_flag() {
  local name="$1"
  local expected="$2"
  local actual
  actual="$(env_value "${name}")"
  if [[ "${actual}" == "${expected}" ]]; then
    pass "fail-closed flag: ${name}=${expected}"
  else
    fail "expected ${name}=${expected}; found ${actual:-unset}"
  fi
}

for command_name in docker curl grep sed awk stat df realpath; do
  require_command "${command_name}"
done

if [[ ! -f "${env_file}" ]]; then
  fail "private environment file not found: ${env_file}"
  printf '\nPreflight failed with %d problem(s).\n' "${failures}" >&2
  exit 1
fi
pass "private environment file exists"

env_file="$(realpath "${env_file}")"
env_mode="$(stat -c '%a' "${env_file}")"
env_group_digit=$(( (10#${env_mode} / 10) % 10 ))
env_other_digit=$(( 10#${env_mode} % 10 ))
if (( env_group_digit == 0 && env_other_digit == 0 )); then
  pass "private environment permissions are restricted (${env_mode})"
else
  fail "private environment file must not be readable by group or others (${env_mode})"
fi

for name in \
  DATABASE_URL \
  DIRECT_URL \
  NEXT_PUBLIC_SITE_URL \
  SQUARE_ENVIRONMENT \
  SQUARE_ACCESS_TOKEN \
  SQUARE_WEBHOOK_SIGNATURE_KEY \
  STOREFRONT_DATABASE_NETWORK \
  STOREFRONT_ORDERPRO_NETWORK \
  STOREFRONT_GATEWAY_NETWORK \
  ORDERPRO_API_BASE_URL \
  ADMIN_LOGIN_EMAIL \
  ADMIN_PASSWORD_HASH \
  ADMIN_ALLOWED_ORIGINS \
  RESEND_API_KEY \
  CUSTOMER_AUTH_EMAIL_FROM; do
  require_value "${name}"
done

require_value_length ADMIN_SESSION_SECRET 32
require_value_length WEBHOOK_WORKER_SECRET 32
require_value_length CUSTOMER_SESSION_SECRET 32

site_url="$(env_value NEXT_PUBLIC_SITE_URL)"
if [[ "${site_url}" == https://* ]]; then
  pass "canonical storefront URL uses HTTPS"
else
  fail "NEXT_PUBLIC_SITE_URL must use HTTPS"
fi

admin_hash="$(env_value ADMIN_PASSWORD_HASH)"
if [[ "${admin_hash}" == scrypt-v1\$* ]]; then
  pass "admin password uses the expected scrypt format"
else
  fail "ADMIN_PASSWORD_HASH must use the scrypt-v1 format"
fi

require_flag NEXT_PUBLIC_SITE_INDEXABLE false
require_flag SQUARE_ALLOW_PRODUCTION_READONLY_SYNC true
require_flag SQUARE_CHECKOUT_ENABLED false
require_flag ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED false
require_flag ORDERPRO_SHIPPING_CHECKOUT_ENABLED false
require_flag ADMIN_DEV_BYPASS false
require_flag ALLOW_LOCAL_PERSISTENCE_FALLBACK false
require_flag CUSTOMER_AUTH_DEV_PREVIEW false
require_flag SHIPPO_TEST_MODE true

orderpro_api_url="$(env_value ORDERPRO_API_BASE_URL)"
if [[ "${orderpro_api_url}" == "http://orderpro-api:3000" ]]; then
  pass "OrderPRO API uses the private Docker service address"
else
  fail "ORDERPRO_API_BASE_URL must be http://orderpro-api:3000 during VPS preparation"
fi

if grep -Eiq '^[[:space:]]*NEXT_PUBLIC_.*ORDERPRO' "${env_file}"; then
  fail "OrderPRO configuration must never use a NEXT_PUBLIC_ variable"
else
  pass "OrderPRO configuration is server-only"
fi

database_url="$(env_value DATABASE_URL)"
direct_url="$(env_value DIRECT_URL)"
if [[ "${database_url}" == *"@storefront-postgres:5432/storefront_prod"* ]] && \
   [[ "${direct_url}" == *"@storefront-postgres:5432/storefront_prod"* ]]; then
  pass "Storefront database URLs target the isolated Storefront database alias"
else
  fail "DATABASE_URL and DIRECT_URL must target storefront-postgres/storefront_prod"
fi

if docker info >/dev/null 2>&1; then
  pass "Docker daemon is reachable"
else
  fail "Docker daemon is not reachable"
fi

database_network="$(env_value STOREFRONT_DATABASE_NETWORK)"
orderpro_network="$(env_value STOREFRONT_ORDERPRO_NETWORK)"
gateway_network="$(env_value STOREFRONT_GATEWAY_NETWORK)"

database_network="${database_network:-storefront-production-database}"
orderpro_network="${orderpro_network:-storefront-orderpro-private}"
gateway_network="${gateway_network:-storefront-public-gateway}"

for network_name in "${database_network}" "${orderpro_network}" "${gateway_network}"; do
  if docker network inspect "${network_name}" >/dev/null 2>&1; then
    pass "Docker network exists: ${network_name}"
  else
    fail "Docker network missing: ${network_name}"
  fi
done

if docker network inspect "${orderpro_network}" >/dev/null 2>&1; then
  private_members="$(docker network inspect --format '{{range .Containers}}{{.Name}}{{"\n"}}{{end}}' "${orderpro_network}")"
  if grep -Eiq 'caddy' <<<"${private_members}"; then
    fail "Caddy must not join the Storefront-to-OrderPRO private network"
  else
    pass "Caddy is absent from the Storefront-to-OrderPRO private network"
  fi
fi

if docker network inspect "${gateway_network}" >/dev/null 2>&1; then
  gateway_members="$(docker network inspect --format '{{range .Containers}}{{.Name}}{{"\n"}}{{end}}' "${gateway_network}")"
  if grep -Eiq 'orderpro-api' <<<"${gateway_members}"; then
    fail "orderpro-api must not join the public Caddy gateway network"
  else
    pass "orderpro-api is absent from the public Caddy gateway network"
  fi
fi

orderpro_api_ids="$(docker ps --filter 'name=orderpro-api' --format '{{.ID}}' || true)"
if [[ -n "${orderpro_api_ids}" ]]; then
  while IFS= read -r container_id; do
    port_bindings="$(docker inspect --format '{{json .HostConfig.PortBindings}}' "${container_id}")"
    if [[ "${port_bindings}" == "{}" || "${port_bindings}" == "null" ]]; then
      pass "orderpro-api does not publish a VPS host port"
    else
      fail "orderpro-api publishes a VPS host port and must be made private"
    fi
  done <<<"${orderpro_api_ids}"
fi

if STOREFRONT_ENV_FILE="${env_file}" docker compose \
  --env-file "${env_file}" \
  -f "${COMPOSE_FILE}" \
  config --quiet; then
  pass "Docker Compose configuration is valid"
else
  fail "Docker Compose configuration is invalid"
fi

available_kb="$(df -Pk "${REPOSITORY_ROOT}" | awk 'NR==2 {print $4}')"
if [[ "${available_kb}" =~ ^[0-9]+$ ]] && (( available_kb >= 5242880 )); then
  pass "at least 5 GiB is available for build and rollback images"
else
  fail "less than 5 GiB is available for build and rollback images"
fi

if (( failures > 0 )); then
  printf '\nPreflight failed with %d problem(s). No deployment was performed.\n' "${failures}" >&2
  exit 1
fi

printf '\nPreflight passed. No deployment was performed.\n'
