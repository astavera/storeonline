#!/usr/bin/env bash
# Runs read-only HTTP checks against a private canary deployment.

set -Eeuo pipefail

readonly BASE_URL="${1:?usage: smoke-canary.sh https://shop.example.com}"

if [[ "${BASE_URL}" != https://* && "${ALLOW_HTTP_CANARY:-false}" != "true" ]]; then
  printf 'The canary URL must use HTTPS.\n' >&2
  exit 64
fi

temporary_directory="$(mktemp -d)"
trap 'rm -rf -- "${temporary_directory}"' EXIT

curl --fail --silent --show-error \
  --max-time 15 \
  "${BASE_URL%/}/api/health" > "${temporary_directory}/health.json"

curl --fail --silent --show-error \
  --max-time 15 \
  "${BASE_URL%/}/robots.txt" > "${temporary_directory}/robots.txt"

curl --fail --silent --show-error \
  --max-time 15 \
  --dump-header "${temporary_directory}/headers.txt" \
  --output "${temporary_directory}/storefront.html" \
  "${BASE_URL%/}/"

grep -Eiq 'disallow:[[:space:]]*/' "${temporary_directory}/robots.txt" || {
  printf 'robots.txt does not block crawlers during canary.\n' >&2
  exit 1
}

for header_name in content-security-policy x-content-type-options referrer-policy; do
  grep -Eiq "^${header_name}:" "${temporary_directory}/headers.txt" || {
    printf 'Required response header missing: %s\n' "${header_name}" >&2
    exit 1
  }
done

if grep -Eiq 'SQUARE_ACCESS_TOKEN|ORDERPRO_AUTH0_CLIENT_SECRET|ADMIN_SESSION_SECRET|DATABASE_URL' \
  "${temporary_directory}/storefront.html"; then
  printf 'A server-only environment name appeared in the storefront HTML.\n' >&2
  exit 1
fi

printf 'Canary smoke checks passed for %s\n' "${BASE_URL}"
printf 'These checks do not authorize payments or public traffic.\n'
