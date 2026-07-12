# Admin Builder Roadmap

## Current Phase

Phase 8 is next: advanced Wix-like builder UX with inline editing, undo/redo, keyboard shortcuts, and drag reorder polish. The existing `/admin/homepage` editor remains the active production-facing editor, and the new generic builder is available at `/admin/builder/[scope]/[id]`.

## Completed Work

- Inspected the existing admin homepage route at `src/app/(admin)/admin/homepage/page.tsx`.
- Identified the advanced homepage editor in `src/components/admin/homepage-studio-editor.tsx`.
- Identified the current homepage data contract in `src/config/homepage.config.ts`.
- Identified homepage draft/publish loading and local fallback logic in `src/features/admin/services/homepage-visual-editor-service.ts`.
- Identified local CMS file persistence in `src/server/admin/admin-local-cms-store.ts`.
- Identified the admin save endpoint at `src/app/api/admin/route.ts`.
- Identified storefront homepage rendering in `src/components/templates/home-page-template.tsx`.
- Identified Prisma CMS version readiness in `prisma/schema.prisma` through `CmsContentVersion`.
- Added a reusable CMS core under `src/lib/cms/`:
  - `cms-types.ts`
  - `cms-scopes.ts`
  - `cms-storage.ts`
  - `cms-versioning.ts`
  - `section-registry.ts`
  - `section-schemas.ts`
  - `section-defaults.ts`
  - `page-templates.ts`
  - `theme-tokens.ts`
  - `data-sources.ts`
  - `validation.ts`
  - `design-presets.ts`
  - `homepage-adapter.ts`
- Added a universal `CmsPageDocument` and `CmsSection` contract.
- Added Zod validation for CMS page documents and sections.
- Added a centralized registry foundation for all required section types, including legacy homepage aliases.
- Added templates for homepage, department, holiday, product, location, policy, landing, global header, global footer, and theme documents.
- Added homepage-to-CMS adapter so existing homepage sections can be represented by the universal document model.
- Added tests for valid/invalid CMS documents.
- Added tests for registry resolution, scope compatibility, unknown fallback behavior, and full required section registration.
- Added `PageRenderer`, `SectionRenderer`, `UnknownSectionFallback`, `ResponsiveVisibilityWrapper`, and `ThemeTokenProvider` in `src/components/cms/page-renderer.tsx`.
- Routed the public homepage through `PageRenderer` while preserving the existing homepage section JSX through a compatibility render callback.
- Added PageRenderer tests for known sections, hidden sections, and unknown fallback sections.
- Added schema-level builder operations in `src/lib/cms/builder-operations.ts`.
- Added tests for add, duplicate, reorder, hide, remove, rename, variant change, and nested section edits.
- Added generic admin CMS persistence service in `src/server/admin/admin-cms-document-service.ts`.
- Added `/api/admin/cms` for validated CMS draft, preview, and publish saves.
- Added shared builder components under `src/components/admin/builder/`:
  - `BuilderShell`
  - `BuilderTopbar`
  - `BuilderSidebar`
  - `BuilderCanvas`
  - `BuilderInspector`
  - `BuilderSectionList`
  - `BuilderSectionLibrary`
  - `BuilderDevicePreview`
  - `BuilderHistoryPanel`
  - `BuilderLayersPanel`
  - `BuilderPreviewFrame`
  - `BuilderSavePublishControls`
- Added shared inspector components under `src/components/admin/inspector/`:
  - `ContentInspector`
  - `DesignInspector`
  - `MediaInspector`
  - `LayoutInspector`
  - `DataSourceInspector`
  - `SeoInspector`
  - `VisibilityInspector`
  - `AdvancedInspector`
- Added `/admin/builder/[scope]/[id]`, supporting homepage, department, holiday, product, location, policy, landing, global-header, global-footer, and theme scopes.
- Added deep `ThemeTokenOverrides` so admins can edit individual theme values safely.
- Added theme override operations and tests.
- Added section/theme preset application operations and tests.
- Added `ThemeInspector` for page-level colors, typography scale, spacing, radius, shadows, buttons, and grid columns.
- Added `PresetInspector` for page visual presets and compatible section presets.
- Connected Theme and Presets tabs into the generic `BuilderInspector`.

## What Can Be Extracted Next

- Homepage-specific visual polish from `HomepageStudioEditor` can be migrated into `BuilderShell` component-by-component.
- Upload widgets and photo preset UX from `HomepageStudioEditor` can move into the generic `MediaInspector`.
- The existing homepage section render callback can be replaced section-by-section with registry-backed components.
- The current `/api/admin` versioning flow can remain as the persistence wrapper while a generic CMS route is added.

## Minimum Safe Refactor Plan

1. Keep `/admin/homepage` working as the compatibility route.
2. Move upload widgets and photo preset UX into the generic media inspector.
3. Add undo/redo, keyboard shortcuts, and drag reorder to `BuilderShell`.
4. Add inline text editing for headings, body text, and CTA labels.
5. Replace homepage compatibility rendering with registry-backed section components once visual parity is verified.

## Remaining Work

- Phase 8: advanced Wix-like visual editing UX: inline editing, layers, undo/redo, drag reorder, keyboard shortcuts.
- Phase 9: complete editable implementations for every registered section type.
- Phase 10: make departments, holidays, products, locations, policies, placements, media, and store settings operable.
- Phase 11: safe operational foundations for Square, Shippo, Mapbox, orders, fulfillment, capacity, and audit events.
- Phase 12: auth, RBAC, audit, validation, security, observability, and performance hardening.
- Phase 13: broader unit, integration, and Playwright coverage.
- Phase 14: final architecture and admin documentation.

## Migration Notes

- CMS design JSON must not duplicate Square source-of-truth data for prices, inventory, payments, orders, or catalog identity.
- Legacy homepage section types such as `product-grid`, `image-banner`, `feature-grid`, `split-media`, and `trust-bar` remain supported.
- Custom HTML/code sections are registry entries only with safe rich text defaults. Arbitrary scripts and unsafe embeds still require security review.
- The generic CMS storage helpers are compatible with the existing CMS version payload shape but do not replace `/api/admin` yet.

## Known Limitations

- The public homepage now routes through `PageRenderer`, but it still uses a compatibility render callback for current homepage-specific JSX.
- The generic builder is new and functional, but it is less visually refined than the current homepage-specific studio editor.
- Generic builder saves validated CMS document versions, but storefront routes beyond the homepage are not yet loading those saved generic documents.
- Registered section types beyond the current homepage sections have defaults and metadata but do not all have final production storefront components.
- Theme and section presets are wired in the generic builder, but the homepage-specific studio still has its existing design controls until it is fully migrated.

## Test and Build Status

- 2026-07-09 Phase 0/1/2 pass: `npm.cmd run test` completed with 16 files and 38 tests passing.
- 2026-07-09 Phase 0/1/2 pass: `npm.cmd run build` completed successfully with 84 routes generated.
- 2026-07-09 Phase 3 pass: `npm.cmd run test` completed with 17 files and 41 tests passing.
- 2026-07-09 Phase 3 pass: `npm.cmd run build` completed successfully with 84 routes generated.
- 2026-07-09 Phase 4/5 pass: `npm.cmd run test` completed with 18 files and 44 tests passing.
- 2026-07-09 Phase 4/5 pass: `npm.cmd run build` completed successfully with 85 routes generated.
- 2026-07-09 Phase 6/7 pass: `npm.cmd run test` completed with 18 files and 46 tests passing.
- 2026-07-09 Phase 6/7 pass: `npm.cmd run build` completed successfully with 85 routes generated.
