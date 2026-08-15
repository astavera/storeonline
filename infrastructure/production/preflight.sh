#!/usr/bin/env bash
# Performs read-only host and configuration checks before a canary deployment.

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
readonly COMPOSE_FILE="${SCRIPT_DIR}/compose.yml"

if (( $# != 2 )); then
  printf 'Usage: %s RUNTIME_ENV_FILE MIGRATOR_ENV_FILE\n' "$0" >&2
  exit 2
fi

runtime_env_file="$1"
migrator_env_file="$2"
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

for command_name in docker curl grep sed awk stat df realpath; do
  require_command "${command_name}"
done

if (( failures > 0 )); then
  printf '\nPreflight failed with %d problem(s). No deployment was performed.\n' "${failures}" >&2
  exit 1
fi

resolve_env_file() {
  local path="$1"
  if [[ "${path}" != /* ]]; then
    path="${REPOSITORY_ROOT}/${path}"
  fi
  printf '%s' "${path}"
}

runtime_env_file="$(resolve_env_file "${runtime_env_file}")"
migrator_env_file="$(resolve_env_file "${migrator_env_file}")"

validate_private_file() {
  local label="$1"
  local path="$2"

  if [[ -L "${path}" ]]; then
    fail "${label} environment path must not be a symbolic link"
    return
  fi
  if [[ ! -f "${path}" ]]; then
    fail "${label} environment path must be an existing regular file"
    return
  fi

  local mode
  mode="$(stat -c '%a' "${path}")"
  if [[ "${mode}" == "600" ]]; then
    pass "${label} environment is a regular non-link file with mode 0600"
  else
    fail "${label} environment file must have mode 0600"
  fi
}

validate_private_file "runtime" "${runtime_env_file}"
validate_private_file "migrator" "${migrator_env_file}"

if [[ -f "${runtime_env_file}" && ! -L "${runtime_env_file}" ]]; then
  runtime_env_file="$(realpath "${runtime_env_file}")"
fi
if [[ -f "${migrator_env_file}" && ! -L "${migrator_env_file}" ]]; then
  migrator_env_file="$(realpath "${migrator_env_file}")"
fi

if [[ "${runtime_env_file}" == "${migrator_env_file}" ]] || \
   [[ -e "${runtime_env_file}" && -e "${migrator_env_file}" && "${runtime_env_file}" -ef "${migrator_env_file}" ]]; then
  fail "runtime and migrator environment files must be distinct files"
else
  pass "runtime and migrator environment files are distinct"
fi

if (( failures > 0 )); then
  printf '\nPreflight failed with %d problem(s). No deployment was performed.\n' "${failures}" >&2
  exit 1
fi

env_value() {
  local file="$1"
  local name="$2"
  local line
  line="$(grep -E "^[[:space:]]*${name}[[:space:]]*=" "${file}" | tail -n 1 || true)"
  local value="${line#*=}"
  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"
  printf '%s' "${value}"
}

require_single_value() {
  local file="$1"
  local label="$2"
  local name="$3"
  local count
  count="$(grep -Ec "^[[:space:]]*${name}[[:space:]]*=" "${file}" || true)"
  if [[ "${count}" != "1" ]]; then
    fail "${label} must define ${name} exactly once"
    return
  fi
  local value
  value="$(env_value "${file}" "${name}")"
  if [[ -n "${value}" && "${value}" != CHANGE_ME* ]]; then
    pass "${label} value configured: ${name}"
  else
    fail "${label} value missing or placeholder: ${name}"
  fi
}

require_value() {
  local file="$1"
  local label="$2"
  local name="$3"
  local value
  value="$(env_value "${file}" "${name}")"
  if [[ -n "${value}" && "${value}" != CHANGE_ME* ]]; then
    pass "${label} value configured: ${name}"
  else
    fail "${label} value missing or placeholder: ${name}"
  fi
}

require_value_length() {
  local file="$1"
  local label="$2"
  local name="$3"
  local minimum="$4"
  local value
  value="$(env_value "${file}" "${name}")"
  if (( ${#value} >= minimum )) && [[ "${value}" != CHANGE_ME* ]]; then
    pass "${label} secret length accepted: ${name}"
  else
    fail "${label} secret ${name} must contain at least ${minimum} characters"
  fi
}

require_flag() {
  local name="$1"
  local expected="$2"
  local actual
  actual="$(env_value "${runtime_env_file}" "${name}")"
  if [[ "${actual}" == "${expected}" ]]; then
    pass "fail-closed flag: ${name}=${expected}"
  else
    fail "runtime environment must set ${name}=${expected}"
  fi
}

validate_database_url() {
  local file="$1"
  local label="$2"
  local name="$3"
  local expected_user="$4"
  local value authority_and_path authority userinfo hostport user password host port database

  require_single_value "${file}" "${label}" "${name}"
  value="$(env_value "${file}" "${name}")"
  if [[ "${value}" != postgresql://* && "${value}" != postgres://* ]]; then
    fail "${label} ${name} must be a PostgreSQL URL"
    return
  fi

  authority_and_path="${value#*://}"
  if [[ "${authority_and_path}" != */* ]]; then
    fail "${label} ${name} must include the database name"
    return
  fi
  authority="${authority_and_path%%/*}"
  if [[ "${authority}" != *@* ]]; then
    fail "${label} ${name} must include PostgreSQL credentials"
    return
  fi
  userinfo="${authority%@*}"
  hostport="${authority##*@}"
  if [[ "${userinfo}" != *:* ]]; then
    fail "${label} ${name} must include a non-empty password"
    return
  fi

  user="${userinfo%%:*}"
  password="${userinfo#*:}"
  host="${hostport%%:*}"
  port="${hostport##*:}"
  database="${authority_and_path#*/}"
  database="${database%%\?*}"

  if [[ "${user}" == "${expected_user}" ]]; then
    pass "${label} ${name} uses the exact ${expected_user} role"
  else
    fail "${label} ${name} must use the exact ${expected_user} role"
  fi
  if [[ -n "${password}" ]]; then
    pass "${label} ${name} contains a password"
  else
    fail "${label} ${name} must include a non-empty password"
  fi
  if [[ "${host}" == "storefront-postgres" && "${port}" == "5432" ]]; then
    pass "${label} ${name} targets storefront-postgres:5432"
  else
    fail "${label} ${name} must target storefront-postgres:5432"
  fi
  if [[ "${database}" == "storefront_prod" ]]; then
    pass "${label} ${name} targets storefront_prod"
  else
    fail "${label} ${name} must target storefront_prod"
  fi
}

for name in \
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
  require_value "${runtime_env_file}" "runtime" "${name}"
done

require_value_length "${runtime_env_file}" "runtime" ADMIN_SESSION_SECRET 32
require_value_length "${runtime_env_file}" "runtime" WEBHOOK_WORKER_SECRET 32
require_value_length "${runtime_env_file}" "runtime" CUSTOMER_SESSION_SECRET 32

site_url="$(env_value "${runtime_env_file}" NEXT_PUBLIC_SITE_URL)"
if [[ "${site_url}" == https://* ]]; then
  pass "canonical storefront URL uses HTTPS"
else
  fail "NEXT_PUBLIC_SITE_URL must use HTTPS"
fi

admin_hash="$(env_value "${runtime_env_file}" ADMIN_PASSWORD_HASH)"
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

orderpro_api_url="$(env_value "${runtime_env_file}" ORDERPRO_API_BASE_URL)"
if [[ "${orderpro_api_url}" == "http://orderpro-api:3000" ]]; then
  pass "OrderPRO API uses the private Docker service address"
else
  fail "ORDERPRO_API_BASE_URL must be http://orderpro-api:3000 during preparation"
fi

if grep -Eiq '^[[:space:]]*NEXT_PUBLIC_.*ORDERPRO' "${runtime_env_file}" "${migrator_env_file}"; then
  fail "OrderPRO configuration must never use a NEXT_PUBLIC_ variable"
else
  pass "OrderPRO configuration is server-only"
fi

validate_database_url "${runtime_env_file}" "runtime" DATABASE_URL storefront_runtime
validate_database_url "${runtime_env_file}" "runtime" DIRECT_URL storefront_runtime
validate_database_url "${migrator_env_file}" "migrator" DATABASE_URL storefront_migrator
validate_database_url "${migrator_env_file}" "migrator" DIRECT_URL storefront_migrator

if grep -Eq '^[[:space:]]*(STOREFRONT_DB_PASSWORD|STOREFRONT_RUNTIME_DB_PASSWORD|STOREFRONT_MIGRATOR_DB_PASSWORD)[[:space:]]*=' \
  "${runtime_env_file}" "${migrator_env_file}"; then
  fail "private environment files must not expose standalone database password variables"
else
  pass "database passwords exist only inside their service-specific URLs"
fi

if grep -Eq '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*MIGRATOR[A-Za-z0-9_]*[[:space:]]*=' "${runtime_env_file}" || \
   grep -Fq 'storefront_migrator' "${runtime_env_file}"; then
  fail "migrator credentials must not reach the storefront runtime environment"
else
  pass "migrator credentials are absent from the storefront runtime environment"
fi

if grep -Fq 'storefront_runtime' "${migrator_env_file}"; then
  fail "runtime credentials must not reach the migrator environment"
else
  pass "runtime credentials are absent from the migrator environment"
fi

migrator_unexpected_names="$(sed -E '/^[[:space:]]*($|#)/d; s/[[:space:]]*=.*$//; /^[[:space:]]*(DATABASE_URL|DIRECT_URL)[[:space:]]*$/d' "${migrator_env_file}")"
if [[ -z "${migrator_unexpected_names}" ]]; then
  pass "migrator environment contains only DATABASE_URL and DIRECT_URL"
else
  fail "migrator environment contains variables not authorized for migrations"
fi

runtime_database_url="$(env_value "${runtime_env_file}" DATABASE_URL)"
migrator_database_url="$(env_value "${migrator_env_file}" DATABASE_URL)"
runtime_password="${runtime_database_url#*://storefront_runtime:}"
runtime_password="${runtime_password%%@*}"
migrator_password="${migrator_database_url#*://storefront_migrator:}"
migrator_password="${migrator_password%%@*}"
if [[ -n "${runtime_password}" && -n "${migrator_password}" && "${runtime_password}" != "${migrator_password}" ]]; then
  pass "runtime and migrator PostgreSQL passwords are distinct"
else
  fail "runtime and migrator PostgreSQL passwords must be distinct"
fi
unset runtime_database_url migrator_database_url runtime_password migrator_password

migrate_block="$(sed -n '/^  migrate:/,/^  storefront:/p' "${COMPOSE_FILE}")"
storefront_block="$(sed -n '/^  storefront:/,/^networks:/p' "${COMPOSE_FILE}")"

if [[ "$(grep -Fc 'STOREFRONT_MIGRATOR_ENV_FILE:?' "${COMPOSE_FILE}" || true)" == "1" ]] && \
   [[ "${migrate_block}" == *'STOREFRONT_MIGRATOR_ENV_FILE:?'* ]] && \
   [[ "${migrate_block}" != *'STOREFRONT_RUNTIME_ENV_FILE'* ]]; then
  pass "migrate receives only STOREFRONT_MIGRATOR_ENV_FILE"
else
  fail "migrate must receive only the required STOREFRONT_MIGRATOR_ENV_FILE"
fi

if [[ "$(grep -Fc 'STOREFRONT_RUNTIME_ENV_FILE:?' "${COMPOSE_FILE}" || true)" == "1" ]] && \
   [[ "${storefront_block}" == *'STOREFRONT_RUNTIME_ENV_FILE:?'* ]] && \
   [[ "${storefront_block}" != *'STOREFRONT_MIGRATOR_ENV_FILE'* ]]; then
  pass "storefront receives only STOREFRONT_RUNTIME_ENV_FILE"
else
  fail "storefront must receive only the required STOREFRONT_RUNTIME_ENV_FILE"
fi

if grep -Eq '^[[:space:]]+(DATABASE_URL|DIRECT_URL):' "${COMPOSE_FILE}"; then
  fail "Compose must not inject database URLs outside the service-specific env files"
else
  pass "Compose has no cross-service database credential injection"
fi

if grep -Eq '^[[:space:]]+depends_on:' "${COMPOSE_FILE}"; then
  fail "storefront must not depend automatically on migrate"
else
  pass "migrations require an explicit Compose command"
fi

if [[ "$(grep -Fc 'STOREFRONT_IMAGE_TAG:?' "${COMPOSE_FILE}" || true)" == "2" ]] && \
   ! grep -Fq 'STOREFRONT_IMAGE_TAG:-' "${COMPOSE_FILE}"; then
  pass "Compose requires an explicit immutable image tag without fallback"
else
  fail "Compose must require STOREFRONT_IMAGE_TAG without a fallback"
fi

image_tag="${STOREFRONT_IMAGE_TAG:-}"
if [[ "${image_tag}" =~ ^[0-9a-f]{40}$ ]]; then
  pass "STOREFRONT_IMAGE_TAG is an immutable 40-character commit"
else
  fail "STOREFRONT_IMAGE_TAG must be a lowercase 40-character Git commit"
fi

if docker info >/dev/null 2>&1; then
  pass "Docker daemon is reachable"
else
  fail "Docker daemon is not reachable"
fi

database_network="$(env_value "${runtime_env_file}" STOREFRONT_DATABASE_NETWORK)"
orderpro_network="$(env_value "${runtime_env_file}" STOREFRONT_ORDERPRO_NETWORK)"
gateway_network="$(env_value "${runtime_env_file}" STOREFRONT_GATEWAY_NETWORK)"

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
      pass "orderpro-api does not publish a host port"
    else
      fail "orderpro-api publishes a host port and must be made private"
    fi
  done <<<"${orderpro_api_ids}"
fi

if STOREFRONT_RUNTIME_ENV_FILE="${runtime_env_file}" \
  STOREFRONT_MIGRATOR_ENV_FILE="${migrator_env_file}" \
  docker compose \
    --env-file "${runtime_env_file}" \
    -f "${COMPOSE_FILE}" \
    config --quiet >/dev/null 2>&1; then
  pass "Docker Compose configuration is valid with isolated environments"
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
