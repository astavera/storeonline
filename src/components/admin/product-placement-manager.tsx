/*
STORE AREA: Admin
SECTION: Product Placement Manager
SECTION ID: admin.product-placement-manager
CUSTOMER-FACING: No
ADMIN-EDITABLE: No
WHAT THIS CONTROLS: Admin workflow for placing Square products into website departments, holidays, balloon sections, homepage modules, groups, search, and promo sections.
SAFE TO EDIT: Admin table columns, workflow cards, filters, and controlled placement UI copy.
DO NOT EDIT HERE: Square category mutation, Square reporting_category, Square prices, Square inventory, payment logic, or token handling.
RELATED FILES: src/features/catalog/services/product-placement-service.ts, prisma/schema.prisma
BUSINESS LOGIC FILES: src/features/catalog/services/product-placement-service.ts, src/server/admin/admin-audit-service.ts
*/

import { SectionFrame } from "@/components/sections/section-frame";
import { AdminModuleEditor } from "@/components/admin/admin-module-editor";
import { getAdminModuleById } from "@/config/admin-control-plane";
import { defaultPlacementRules } from "@/features/catalog/services/product-placement-service";

const filters = [
  "Needs Placement",
  "Visible on website",
  "Hidden from website",
  "Missing description",
  "Missing image",
  "Toys",
  "Party Supplies",
  "Balloons",
  "Stationery",
  "Arts & Crafts",
  "Greeting Cards",
  "Gifts",
  "Holidays",
  "Pickup only",
  "Local delivery",
  "Shippable",
  "Needs review"
];

const bulkActions = [
  "Assign to department",
  "Assign to holiday",
  "Assign to balloon section",
  "Add badge",
  "Hide from website",
  "Show on website",
  "Mark pickup allowed",
  "Mark local delivery allowed",
  "Mark shipping allowed",
  "Set product card style",
  "Set sort order"
];

const sampleRows = [
  {
    image: "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=300&q=80",
    squareName: "Graduation Mylar Balloon",
    sku: "BAL-GRAD-MYLAR",
    price: "$7.99",
    stock: "18",
    status: "Needs Placement",
    departments: "Balloons, Party Supplies",
    holidays: "Graduation",
    balloon: "Mylar",
    fulfillment: "Pickup, Local delivery"
  },
  {
    image: "https://images.unsplash.com/photo-1560961911-ba7ef651a56c?auto=format&fit=crop&w=300&q=80",
    squareName: "Classic Building Set",
    sku: "TOY-BUILD-001",
    price: "$24.99",
    stock: "42",
    status: "Draft",
    departments: "Toys",
    holidays: "-",
    balloon: "-",
    fulfillment: "Pickup, Shipping"
  }
];

export function ProductPlacementManager() {
  const placementModule = getAdminModuleById("product-placement");

  return (
    <main className="p-6">
      <SectionFrame area="Admin" className="surface-card p-6" component="ProductPlacementManager" sectionId="admin.product-placement-manager" variant="manager">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-secondary">No-code merchandising</p>
            <h1 className="mt-2 font-display text-3xl font-semibold">Product Placement Manager</h1>
            <p className="mt-3 max-w-3xl text-secondary">
              Place Square products anywhere on the website without changing Square categories, reporting categories, prices, or inventory.
            </p>
          </div>
          <div className="rounded-md border border-border bg-surface-muted px-4 py-3 text-sm">
            <p className="font-semibold">Default workflow</p>
            <p className="text-secondary">Sync &gt; Needs Placement &gt; Preview &gt; Publish</p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {["Products table", "Needs Placement inbox", "Preview before publishing"].map((title) => (
            <div className="rounded-md border border-border bg-surface-muted p-4" key={title}>
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-2 text-sm text-secondary">Draft-safe controls with audit logging and role-based permissions.</p>
            </div>
          ))}
        </div>

        <section className="mt-8" aria-label="Placement filters">
          <h2 className="font-display text-xl font-semibold">Filters</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {filters.map((filter) => (
              <span className="rounded-pill border border-border bg-surface px-3 py-1 text-xs font-semibold text-secondary" key={filter}>
                {filter}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-8 overflow-x-auto rounded-md border border-border" aria-label="Products table">
          <div className="grid min-w-[1180px] grid-cols-[96px_1.4fr_0.8fr_0.6fr_0.6fr_0.9fr_1fr_1fr_0.8fr_1fr] bg-surface-muted px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-secondary">
            <span>Image</span>
            <span>Square name</span>
            <span>SKU</span>
            <span>Price</span>
            <span>Stock</span>
            <span>Web status</span>
            <span>Department</span>
            <span>Holiday</span>
            <span>Balloon</span>
            <span>Fulfillment</span>
          </div>
          {sampleRows.map((row) => (
            <div className="grid min-w-[1180px] grid-cols-[96px_1.4fr_0.8fr_0.6fr_0.6fr_0.9fr_1fr_1fr_0.8fr_1fr] items-center gap-0 border-t border-border bg-surface px-4 py-3 text-sm" key={row.sku}>
              <img alt="" className="h-14 w-14 rounded-md object-cover" src={row.image} />
              <span className="font-semibold">{row.squareName}</span>
              <span className="text-secondary">{row.sku}</span>
              <span>{row.price}</span>
              <span>{row.stock}</span>
              <span>{row.status}</span>
              <span>{row.departments}</span>
              <span>{row.holidays}</span>
              <span>{row.balloon}</span>
              <span>{row.fulfillment}</span>
            </div>
          ))}
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-md border border-border bg-surface-muted p-5">
            <h2 className="font-display text-xl font-semibold">Bulk actions</h2>
            <div className="mt-3 grid gap-2 text-sm text-secondary sm:grid-cols-2">
              {bulkActions.map((action) => (
                <span key={action}>{action}</span>
              ))}
            </div>
          </section>
          <section className="rounded-md border border-border bg-surface-muted p-5">
            <h2 className="font-display text-xl font-semibold">Suggest-only rules</h2>
            <div className="mt-3 space-y-2 text-sm text-secondary">
              {defaultPlacementRules.map((rule) => (
                <p key={rule.name}>
                  <span className="font-semibold text-primary">{rule.name}:</span> suggest {rule.placementType.toLowerCase()} &gt; {rule.placementTargetSlug}
                </p>
              ))}
            </div>
          </section>
        </div>

        {placementModule ? (
          <section className="mt-8 border-t border-border pt-8" aria-label="Placement publishing controls">
            <AdminModuleEditor module={placementModule} />
          </section>
        ) : null}
      </SectionFrame>
    </main>
  );
}
