# Operations access adapter

This module is the Store Admin side of a proposed server-to-server contract with
`https://operation.modernstate.com`. It is intentionally unavailable until the
Operations service implements and approves the same contract.

## External API dependency

Operations must expose these authenticated endpoints:

- `POST /api/v1/admin/access-assignments/sync`
- `POST /api/v1/admin/access-assignments/revoke`

Both endpoints must echo `x-correlation-id`, honor `idempotency-key`, validate
`x-operations-access-contract: ACCESS_ASSIGNMENTS_V1`, and return the strict JSON
shapes defined in `contracts.ts`.

An assignment is locally `active` only after Operations returns HTTP 200,
`state: "ACTIVE"`, a non-null confirmation timestamp, and the exact user, role,
and locations requested. A revocation follows the equivalent fail-closed rule.
HTTP 202 remains pending.

## Required configuration

- `OPERATIONS_ACCESS_SYNC_MODE=API_V1`
- `OPERATIONS_ACCESS_API_BASE_URL=https://operation.modernstate.com`
- `OPERATIONS_ACCESS_API_CONTRACT=ACCESS_ASSIGNMENTS_V1`
- `OPERATIONS_ACCESS_AUTH_MODE=BEARER`
- `OPERATIONS_ACCESS_API_TOKEN=<server-only token, at least 32 characters>`
- `OPERATIONS_ACCESS_TIMEOUT_MS=5000` (optional, 1000–15000)

Until the API contract and a scoped, rotatable service credential exist, leave
the integration disabled. The bearer token must never be sent to the browser or
stored in audit payloads.
