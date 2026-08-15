# Source code organization

The application uses route, feature, component, server, configuration, and shared-library boundaries so files are easy to locate without mixing browser and backend responsibilities.

## Main folders

- `app/` contains Next.js routes, layouts, route handlers, and route-level data loading.
- `components/` contains reusable UI grouped by purpose, such as admin, commerce, checkout, layout, and shared controls.
- `features/` contains business capabilities and their services, contracts, configuration, and feature-specific UI.
- `server/` contains backend integrations, persistence, security, checkout, fulfillment, and webhook processing.
- `config/` contains application-wide navigation, locations, redirects, and storefront configuration.
- `lib/` contains framework-independent shared types and utilities.
- `design/` contains design tokens, themes, and reusable visual presets.
- `tests/` mirrors product behavior with unit, integration, live, and end-to-end coverage.

## Homepage feature

All homepage-specific code lives in `features/homepage/`:

- `components/` contains the homepage template, hero, promotions, product, location, flexible CMS sections, and administrative studio.
- `config/` contains editable section definitions, presets, defaults, and SEO metadata.
- `services/` resolves homepage catalog content on the server.
- `utils/` maps editable settings to section types and presentation classes.
- `index.ts` exposes browser-safe components and types.
- `server.ts` exposes server-only content services.

File names use kebab-case. React component and TypeScript type names continue to use PascalCase.
