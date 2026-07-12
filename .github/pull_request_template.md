## Scope

Describe the customer or operational outcome and the sections affected.

## Verification

- [ ] npm run check
- [ ] npm run build
- [ ] Relevant browser flow tested
- [ ] Prisma schema validated when data models changed
- [ ] No secrets, production tokens, or customer data added
- [ ] Rollback or feature-disable path documented for high-risk changes

## Risk

- Risk level: low / medium / high / critical
- Data migration: none / forward-only / reversible
- Payment, order, inventory, fulfillment, or admin impact:
