#!/usr/bin/env bash
# Creates verified PostgreSQL and persistent-media backups before migration.

set -Eeuo pipefail
umask 077

readonly DOCKER_BIN="${DOCKER_BIN:-/usr/bin/docker}"
readonly POSTGRES_CONTAINER="${POSTGRES_CONTAINER:?Set POSTGRES_CONTAINER to the production PostgreSQL container name}"
readonly POSTGRES_DATABASE="${POSTGRES_DATABASE:-storefront_prod}"
readonly POSTGRES_USER="${POSTGRES_USER:-postgres}"
readonly MEDIA_VOLUME="${MEDIA_VOLUME:-storefront-admin-media}"
readonly MEDIA_BACKUP_IMAGE="${MEDIA_BACKUP_IMAGE:-alpine:3.22}"
readonly BACKUP_ROOT_INPUT="${BACKUP_ROOT:-/srv/storefront/backups}"

if [[ "${BACKUP_ROOT_INPUT}" != /* ]]; then
  printf 'BACKUP_ROOT must be an absolute path.\n' >&2
  exit 64
fi

case "${BACKUP_ROOT_INPUT}" in
  /|/srv|/srv/storefront)
    printf 'BACKUP_ROOT is too broad: %s\n' "${BACKUP_ROOT_INPUT}" >&2
    exit 64
    ;;
esac

readonly BACKUP_ROOT="$(realpath -m "${BACKUP_ROOT_INPUT}")"
readonly RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
readonly RUN_DIRECTORY="${BACKUP_ROOT}/${RUN_ID}"

mkdir -p "${RUN_DIRECTORY}"
chmod 700 "${BACKUP_ROOT}" "${RUN_DIRECTORY}"

if ! "${DOCKER_BIN}" container inspect "${POSTGRES_CONTAINER}" >/dev/null 2>&1; then
  printf 'PostgreSQL container was not found: %s\n' "${POSTGRES_CONTAINER}" >&2
  exit 1
fi
if ! "${DOCKER_BIN}" volume inspect "${MEDIA_VOLUME}" >/dev/null 2>&1; then
  printf 'Admin media volume was not found: %s\n' "${MEDIA_VOLUME}" >&2
  exit 1
fi
if ! "${DOCKER_BIN}" image inspect "${MEDIA_BACKUP_IMAGE}" >/dev/null 2>&1; then
  printf 'Backup helper image is not present: %s\n' "${MEDIA_BACKUP_IMAGE}" >&2
  printf 'Pull and approve that exact image before retrying.\n' >&2
  exit 1
fi

database_dump="${RUN_DIRECTORY}/storefront-postgres.dump"
database_manifest="${RUN_DIRECTORY}/storefront-postgres.contents.txt"
media_archive="${RUN_DIRECTORY}/admin-media.tar.gz"

"${DOCKER_BIN}" exec "${POSTGRES_CONTAINER}" \
  pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --username "${POSTGRES_USER}" \
  --dbname "${POSTGRES_DATABASE}" > "${database_dump}"

if [[ ! -s "${database_dump}" ]]; then
  printf 'PostgreSQL backup is empty.\n' >&2
  exit 1
fi

"${DOCKER_BIN}" exec -i "${POSTGRES_CONTAINER}" \
  pg_restore --list < "${database_dump}" > "${database_manifest}"

"${DOCKER_BIN}" run --rm \
  --read-only \
  --network none \
  --volume "${MEDIA_VOLUME}:/source:ro" \
  --volume "${RUN_DIRECTORY}:/backup" \
  "${MEDIA_BACKUP_IMAGE}" \
  tar -C /source -czf /backup/admin-media.tar.gz .

if [[ ! -s "${media_archive}" ]]; then
  printf 'Admin media backup is empty.\n' >&2
  exit 1
fi

cat > "${RUN_DIRECTORY}/metadata.txt" <<EOF
created_at_utc=${RUN_ID}
postgres_container=${POSTGRES_CONTAINER}
postgres_database=${POSTGRES_DATABASE}
postgres_user=${POSTGRES_USER}
media_volume=${MEDIA_VOLUME}
EOF

(
  cd "${RUN_DIRECTORY}"
  sha256sum \
    storefront-postgres.dump \
    storefront-postgres.contents.txt \
    admin-media.tar.gz \
    metadata.txt > SHA256SUMS
  sha256sum --check SHA256SUMS
)

chmod 600 "${RUN_DIRECTORY}"/*
printf 'Verified backup created at %s\n' "${RUN_DIRECTORY}"
printf 'No migration or restore was performed.\n'
