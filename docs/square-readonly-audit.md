# Square Read-only Audit

Status: not run against live data in this milestone.

Reason: the available Square MCP config is set to `PRODUCTION=true` and `DISALLOW_WRITES=true`. The brief requests Sandbox first. I inspected service metadata for locations, catalog, and inventory, but did not query production business data.

Next safe audit:

1. Configure Square Sandbox credentials.
2. Confirm `DISALLOW_WRITES=true`.
3. List locations.
4. List catalog object types: items, variations, images, taxes, modifiers, categories.
5. Retrieve inventory counts by location.
6. Document Square category/reporting structure without mutating it.
7. Store findings in this document.
