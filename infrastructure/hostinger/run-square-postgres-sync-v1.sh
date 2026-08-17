#!/usr/bin/env bash
# Runs a pinned immutable Square read-only sync image without HTTP or host Node.

set -Eeuo pipefail
umask 077

readonly CONTRACT_VERSION="1"
readonly EXPECTED_RUNNER_PATH="/srv/storefront/operations/square-sync/run-square-postgres-sync-v1.sh"
readonly EXPECTED_ENV_FILE="/srv/storefront/secrets/storefront-square-sync.env"
readonly EXPECTED_RELEASE_POINTER="/srv/storefront/operations/square-sync/current-release"
readonly RELEASES_ROOT="/srv/storefront/releases"
readonly EGRESS_NETWORK="storefront-square-sync-egress"
readonly LOCK_FILE="/run/storefront-square-sync/sync.lock"
readonly CID_FILE="/run/storefront-square-sync/container.cid"
readonly CONTAINER_NAME="storefront-square-postgres-sync"
readonly DOCKER_BIN="/usr/bin/docker"
readonly STAT_BIN="/usr/bin/stat"
readonly READLINK_BIN="/usr/bin/readlink"
readonly FLOCK_BIN="/usr/bin/flock"
readonly RM_BIN="/usr/bin/rm"

fail() {
  local code="$1"
  shift
  printf 'SQUARE_SYNC_REFUSED code=%s reason=%s\n' "$code" "$*" >&2
  exit 78
}

cleanup_only=false
if (( $# == 1 )) && [[ "$1" == "--cleanup" ]]; then
  cleanup_only=true
elif (( $# != 2 )); then
  printf 'usage: %s %s %s | %s --cleanup\n' "$EXPECTED_RUNNER_PATH" "$EXPECTED_ENV_FILE" "$EXPECTED_RELEASE_POINTER" "$EXPECTED_RUNNER_PATH" >&2
  exit 64
fi

(( EUID == 0 )) || fail "root_required" "the root-owned secret cannot be delegated"
if [[ "$cleanup_only" == "false" ]]; then
  [[ "$1" == "$EXPECTED_ENV_FILE" ]] || fail "env_path" "the approved external environment path is required"
  [[ "$2" == "$EXPECTED_RELEASE_POINTER" ]] || fail "release_pointer_path" "the approved release pointer path is required"
fi
[[ "${BASH_SOURCE[0]}" == "$EXPECTED_RUNNER_PATH" ]] || fail "runner_path" "install and invoke the versioned operations wrapper at its approved path"

for binary in "$DOCKER_BIN" "$STAT_BIN" "$READLINK_BIN" "$FLOCK_BIN" "$RM_BIN"; do
  [[ -x "$binary" ]] || fail "runtime_dependency" "an approved runtime dependency is unavailable"
done

validate_root_file() {
  local path="$1"
  local expected_mode="$2"
  local label="$3"
  local metadata uid mode links kind

  [[ ! -L "$path" && -f "$path" ]] || fail "${label}_type" "$label must be a regular non-symlink file"
  metadata="$("$STAT_BIN" -Lc '%u|%a|%h|%F' -- "$path")" || fail "${label}_stat" "$label metadata is unavailable"
  IFS='|' read -r uid mode links kind <<<"$metadata"
  [[ "$uid" == "0" && "$mode" == "$expected_mode" && "$links" == "1" && "$kind" == "regular file" ]] || \
    fail "${label}_metadata" "$label must be root-owned, mode $expected_mode, and have one hard link"
}

validate_root_file "$EXPECTED_RUNNER_PATH" "755" "runner"

cleanup_sync_container() {
  local candidate_id=""
  local container_metadata=""
  local inspected_id=""
  local inspected_name=""
  local run_contract=""

  if [[ -e "$CID_FILE" || -L "$CID_FILE" ]]; then
    validate_root_file "$CID_FILE" "600" "cid_file"
    IFS= read -r candidate_id < "$CID_FILE" || true
    [[ "$candidate_id" =~ ^[0-9a-f]{64}$ ]] || fail "cid_file_content" "the sync cidfile is malformed"
  elif container_metadata="$("$DOCKER_BIN" container inspect --format '{{.Id}}|{{.Name}}|{{index .Config.Labels "com.modernstate.storefront.square-sync.run"}}' "$CONTAINER_NAME" 2>/dev/null)"; then
    IFS='|' read -r candidate_id inspected_name run_contract <<<"$container_metadata"
    [[ "$candidate_id" =~ ^[0-9a-f]{64}$ ]] || fail "cleanup_identity" "the named sync container identity is malformed"
  else
    return 0
  fi

  if container_metadata="$("$DOCKER_BIN" container inspect --format '{{.Id}}|{{.Name}}|{{index .Config.Labels "com.modernstate.storefront.square-sync.run"}}' "$candidate_id" 2>/dev/null)"; then
    IFS='|' read -r inspected_id inspected_name run_contract <<<"$container_metadata"
    [[ "$inspected_id" == "$candidate_id" && "$inspected_name" == "/$CONTAINER_NAME" && "$run_contract" == "$CONTRACT_VERSION" ]] || \
      fail "cleanup_identity" "refusing to remove a container outside the Square sync contract"
    "$DOCKER_BIN" rm --force -- "$candidate_id" >/dev/null
  fi

  "$RM_BIN" -f -- "$CID_FILE"
}

if [[ "$cleanup_only" == "true" ]]; then
  cleanup_sync_container
  printf 'SQUARE_SYNC_CLEANUP_COMPLETE contract=%s\n' "$CONTRACT_VERSION"
  exit 0
fi

validate_root_file "$EXPECTED_ENV_FILE" "600" "environment"
validate_root_file "$EXPECTED_RELEASE_POINTER" "600" "release_pointer"

readonly resolved_environment="$("$READLINK_BIN" -e -- "$EXPECTED_ENV_FILE")"
[[ "$resolved_environment" == "$EXPECTED_ENV_FILE" ]] || fail "env_resolution" "the external environment path must resolve exactly"

declare -Ar allowed_environment_names=(
  [DATABASE_URL]=1
  [DIRECT_URL]=1
  [SQUARE_ENVIRONMENT]=1
  [SQUARE_ALLOW_PRODUCTION_READONLY_SYNC]=1
  [SQUARE_CATALOG_SYNC_MAX_AGE_SECONDS]=1
  [SQUARE_INVENTORY_SYNC_MAX_AGE_SECONDS]=1
  [SQUARE_ACCESS_TOKEN]=1
  [E2E_CATALOG_FIXTURE]=1
  [SQUARE_CHECKOUT_ENABLED]=1
  [SQUARE_RETURNS_REFUNDS_ENABLED]=1
  [ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED]=1
  [ORDERPRO_SHIPPING_CHECKOUT_ENABLED]=1
  [ORDERPRO_RETURNS_ENABLED]=1
  [ALLOW_LOCAL_PERSISTENCE_FALLBACK]=1
)
declare -A seen_environment_names=()

validate_database_url() {
  local variable_name="$1"
  local assignment="$2"
  local url="${assignment#*=}"
  local query field key value
  local sslmode_count=0
  local sslaccept_count=0
  local -a query_fields=()

  [[ "$url" =~ ^postgresql://storefront_sync\.[a-z0-9]+:[^@/?#]+@aws-[a-z0-9.-]+\.pooler\.supabase\.com:5432/postgres\?(.+)$ ]] || \
    fail "database_identity" "$variable_name must use the storefront_sync Supabase session-pooler identity"
  query="${BASH_REMATCH[1]}"
  IFS='&' read -r -a query_fields <<<"$query"

  for field in "${query_fields[@]}"; do
    [[ "$field" == *=* ]] || fail "database_tls" "$variable_name contains a malformed query parameter"
    key="${field%%=*}"
    value="${field#*=}"
    case "$key" in
      sslmode)
        ((sslmode_count += 1))
        [[ "$value" == "require" ]] || fail "database_tls" "$variable_name must require TLS"
        ;;
      sslaccept)
        ((sslaccept_count += 1))
        [[ "$value" == "strict" ]] || fail "database_tls" "$variable_name must reject invalid certificates"
        ;;
    esac
  done

  (( sslmode_count == 1 && sslaccept_count == 1 )) || \
    fail "database_tls" "$variable_name must contain one sslmode=require and one sslaccept=strict parameter"
}

while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ -z "$line" || "$line" == \#* ]] && continue
  [[ "$line" =~ ^([A-Z][A-Z0-9_]*)= ]] || fail "env_syntax" "the external environment contains an unsupported line"
  name="${BASH_REMATCH[1]}"
  [[ -n "${allowed_environment_names[$name]+present}" ]] || fail "env_name" "the external environment contains an unapproved name"
  [[ -z "${seen_environment_names[$name]+present}" ]] || fail "env_duplicate" "the external environment contains a duplicate name"
  seen_environment_names["$name"]=1

  case "$name" in
    SQUARE_ENVIRONMENT)
      [[ "$line" == "SQUARE_ENVIRONMENT=production" ]] || fail "unsafe_configuration" "SQUARE_ENVIRONMENT must be exactly production"
      ;;
    SQUARE_ALLOW_PRODUCTION_READONLY_SYNC)
      [[ "$line" == "SQUARE_ALLOW_PRODUCTION_READONLY_SYNC=true" ]] || fail "unsafe_configuration" "production read-only sync must be explicitly approved"
      ;;
    E2E_CATALOG_FIXTURE|SQUARE_CHECKOUT_ENABLED|SQUARE_RETURNS_REFUNDS_ENABLED|ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED|ORDERPRO_SHIPPING_CHECKOUT_ENABLED|ORDERPRO_RETURNS_ENABLED|ALLOW_LOCAL_PERSISTENCE_FALLBACK)
      [[ "$line" == "$name=false" ]] || fail "unsafe_configuration" "$name must be exactly false"
      ;;
    SQUARE_CATALOG_SYNC_MAX_AGE_SECONDS)
      [[ "$line" =~ ^SQUARE_CATALOG_SYNC_MAX_AGE_SECONDS=([0-9]+)$ ]] || fail "catalog_age" "catalog maximum age must be an integer"
      (( 10#${BASH_REMATCH[1]} >= 60 && 10#${BASH_REMATCH[1]} <= 86400 )) || fail "catalog_age" "catalog maximum age is outside the approved range"
      ;;
    SQUARE_INVENTORY_SYNC_MAX_AGE_SECONDS)
      [[ "$line" =~ ^SQUARE_INVENTORY_SYNC_MAX_AGE_SECONDS=([0-9]+)$ ]] || fail "inventory_age" "inventory maximum age must be an integer"
      (( 10#${BASH_REMATCH[1]} >= 60 && 10#${BASH_REMATCH[1]} <= 1800 )) || fail "inventory_age" "inventory maximum age is outside the approved range"
      ;;
    SQUARE_ACCESS_TOKEN)
      [[ "$line" != "SQUARE_ACCESS_TOKEN=" && "$line" != "SQUARE_ACCESS_TOKEN=CHANGE_ME_"* ]] || fail "square_token" "a non-placeholder Square token is required"
      ;;
    DATABASE_URL|DIRECT_URL)
      validate_database_url "$name" "$line"
      ;;
  esac
done < "$EXPECTED_ENV_FILE"
unset line name

for name in "${!allowed_environment_names[@]}"; do
  [[ -n "${seen_environment_names[$name]+present}" ]] || fail "env_missing" "the external environment is missing a required name"
done
unset name seen_environment_names

mapfile -t release_pointer_lines < "$EXPECTED_RELEASE_POINTER"
(( ${#release_pointer_lines[@]} == 2 )) || fail "release_pointer_content" "the release pointer must contain exactly release and image lines"
[[ "${release_pointer_lines[0]}" == release=* ]] || fail "release_pointer_content" "the first pointer line must select the release"
[[ "${release_pointer_lines[1]}" == image=* ]] || fail "release_pointer_content" "the second pointer line must pin the image ID"
readonly configured_release="${release_pointer_lines[0]#release=}"
readonly image_id="${release_pointer_lines[1]#image=}"
unset release_pointer_lines

[[ "$configured_release" =~ ^/srv/storefront/releases/[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || fail "release_path" "the release must be one direct child of the approved release root"
[[ ! -L "$configured_release" && -d "$configured_release" ]] || fail "release_type" "the selected release must be a regular directory, not a symlink"
readonly release_dir="$("$READLINK_BIN" -e -- "$configured_release")"
[[ "$release_dir" == "$configured_release" && "$(dirname -- "$release_dir")" == "$RELEASES_ROOT" ]] || fail "release_resolution" "the release path must resolve exactly beneath the approved root"
[[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "image_id" "the release pointer must pin a lowercase Docker image ID"

release_metadata="$("$STAT_BIN" -Lc '%a|%F' -- "$release_dir")" || fail "release_stat" "release metadata is unavailable"
IFS='|' read -r release_mode release_kind <<<"$release_metadata"
[[ "$release_mode" =~ ^[0-7][0145][0145]$ && "$release_kind" == "directory" ]] || fail "release_metadata" "the release directory must not be group- or world-writable"

readonly release_id="$(basename -- "$release_dir")"
readonly expected_entrypoint='["node","--disable-warning=ExperimentalWarning","--disable-warning=MODULE_TYPELESS_PACKAGE_JSON","--conditions=react-server","--experimental-transform-types","--import","./scripts/register-typescript-alias.mjs","./scripts/sync-square-postgres-read-only.ts"]'
readonly expected_command='["--sync"]'
image_metadata="$("$DOCKER_BIN" image inspect --format '{{.Id}}|{{index .Config.Labels "com.modernstate.storefront.square-sync.contract"}}|{{index .Config.Labels "com.modernstate.storefront.square-sync.release"}}|{{.Config.User}}|{{.Config.WorkingDir}}|{{json .Config.Entrypoint}}|{{json .Config.Cmd}}|{{json .Config.ExposedPorts}}' "$image_id" 2>/dev/null)" || fail "image_missing" "the pinned local sync image is unavailable"
IFS='|' read -r inspected_image_id image_contract image_release image_user image_workdir image_entrypoint image_command image_ports <<<"$image_metadata"
[[ "$inspected_image_id" == "$image_id" ]] || fail "image_identity" "Docker returned a different image identity"
[[ "$image_contract" == "$CONTRACT_VERSION" && "$image_release" == "$release_id" ]] || fail "image_release" "the pinned image labels do not match the selected release"
[[ "$image_user" == "node" && "$image_workdir" == "/app" ]] || fail "image_runtime" "the pinned image runtime identity is not approved"
[[ "$image_entrypoint" == "$expected_entrypoint" && "$image_command" == "$expected_command" && "$image_ports" == "null" ]] || fail "image_runtime" "the pinned image command, entrypoint, or port metadata is not approved"

exec 9>"$LOCK_FILE"
if ! "$FLOCK_BIN" -n 9; then
  printf 'SQUARE_SYNC_BUSY contract=%s\n' "$CONTRACT_VERSION" >&2
  exit 75
fi

# Reconcile a container left behind if systemd previously had to kill the
# Docker client. EXIT/signal cleanup handles normal interruption; ExecStopPost
# invokes the same identity-checked cleanup even after SIGKILL.
cleanup_sync_container
cleanup_on_exit() {
  local exit_code=$?
  trap - EXIT
  cleanup_sync_container
  exit "$exit_code"
}
trap cleanup_on_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

if ! network_metadata="$("$DOCKER_BIN" network inspect --format '{{.Name}}|{{.Driver}}|{{.Internal}}|{{.Scope}}|{{index .Labels "com.modernstate.storefront.square-sync.network"}}|{{len .Containers}}' "$EGRESS_NETWORK" 2>/dev/null)"; then
  "$DOCKER_BIN" network create \
    --driver bridge \
    --label com.modernstate.storefront.square-sync.network="$CONTRACT_VERSION" \
    "$EGRESS_NETWORK" >/dev/null
  network_metadata="$("$DOCKER_BIN" network inspect --format '{{.Name}}|{{.Driver}}|{{.Internal}}|{{.Scope}}|{{index .Labels "com.modernstate.storefront.square-sync.network"}}|{{len .Containers}}' "$EGRESS_NETWORK")"
fi
IFS='|' read -r network_name network_driver network_internal network_scope network_contract network_containers <<<"$network_metadata"
[[ "$network_name" == "$EGRESS_NETWORK" && "$network_driver" == "bridge" && "$network_internal" == "false" && "$network_scope" == "local" && "$network_contract" == "$CONTRACT_VERSION" ]] || fail "egress_network" "the dedicated Square sync egress network metadata is not approved"
[[ "$network_containers" == "0" ]] || fail "egress_network_busy" "the dedicated Square sync egress network has another attached container"

printf 'SQUARE_SYNC_START contract=%s release=%s image=%s\n' "$CONTRACT_VERSION" "$release_id" "$image_id"

run_sync_container() {
  local exit_code=0

  "$DOCKER_BIN" run \
    --rm \
    --cidfile "$CID_FILE" \
    --pull=never \
    --name "$CONTAINER_NAME" \
    --hostname square-sync \
    --network "$EGRESS_NETWORK" \
    --env-file "$EXPECTED_ENV_FILE" \
    --env NODE_ENV=production \
    --env SQUARE_SYNC_EXTERNAL_ENV_ONLY=true \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m,mode=1777 \
    --cap-drop ALL \
    --security-opt no-new-privileges:true \
    --pids-limit 128 \
    --memory 1g \
    --cpus 1.0 \
    --user 1000:1000 \
    --init \
    --stop-timeout 30 \
    --label com.modernstate.storefront.square-sync.run="$CONTRACT_VERSION" \
    "$image_id" "$@" || exit_code=$?

  cleanup_sync_container
  return "$exit_code"
}

run_sync_container --check
run_sync_container --sync
run_sync_container --status
printf 'SQUARE_SYNC_COMPLETE contract=%s release=%s image=%s\n' "$CONTRACT_VERSION" "$release_id" "$image_id"
