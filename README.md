# Modern State - State News NYC Ecommerce

Production-grade Next.js ecommerce scaffold for Modern State, the evolution of State News on NYC's Upper East Side.

## First milestone status

- App Router, TypeScript, Tailwind, design tokens, config files, route tree, admin shell, checkout shell, and tests are scaffolded.
- Square is server-only by design. No production writes are implemented.
- Website departments are independent from Square categories and `reporting_category`.
- Candy & Snacks is preserved as legacy/search/SEO context, not a main department.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verify

```bash
npm run test
npm run build
```
