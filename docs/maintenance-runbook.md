# Maintenance Runbook

## Daily checks

- Review Square sync status.
- Review failed webhook events.
- Review fulfillment task exceptions.
- Review admin audit logs for risky changes.

## Incident response

1. Disable affected admin mutation if needed.
2. Preserve logs without exposing sensitive values.
3. Reconcile Square source of truth.
4. Restore website cache from Square or database backup.
5. Document root cause and update tests.

## Rollback

Keep database migrations reversible where possible. For launch, maintain a deploy rollback path and a read-only storefront mode if checkout must be paused.
