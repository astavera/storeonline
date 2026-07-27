#!/usr/bin/env bash
set -Eeuo pipefail

readonly DOCKER_BIN="${DOCKER_BIN:-/usr/bin/docker}"
readonly STOREFRONT_CONTAINER="${STOREFRONT_CONTAINER:-storefront-canary-storefront-1}"

case "${1:-}" in
  catalog-sync)
    endpoint="/api/internal/square/catalog-sync"
    timeout_ms=240000
    ;;
  webhook-worker)
    endpoint="/api/internal/webhooks/process?limit=25"
    timeout_ms=55000
    ;;
  *)
    echo "usage: $0 {catalog-sync|webhook-worker}" >&2
    exit 64
    ;;
esac

"$DOCKER_BIN" exec "$STOREFRONT_CONTAINER" node -e '
const url = process.argv[1];
const timeoutMs = Number(process.argv[2]);

fetch(url, {
  method: "POST",
  headers: { authorization: `Bearer ${process.env.WEBHOOK_WORKER_SECRET}` },
  signal: AbortSignal.timeout(timeoutMs)
}).then(async (response) => {
  const body = await response.text();
  console.log(new Date().toISOString(), response.status, body);
  if (!response.ok) process.exit(1);
}).catch((error) => {
  console.error(new Date().toISOString(), error);
  process.exit(1);
});
' "http://127.0.0.1:3000${endpoint}" "$timeout_ms"
