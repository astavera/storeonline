import { ArrowRight, Database, ShieldCheck, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { SectionFrame } from "@/components/sections/section-frame";
import { adminModules, getAdminModulesByCategory } from "@/config/admin-control-plane";
import { getAdminControlReadiness } from "@/server/admin/admin-control-plane-service";

export function AdminDashboard() {
  const groups = getAdminModulesByCategory();
  const readiness = getAdminControlReadiness();
  const activeModules = adminModules.filter((module) => module.id !== "admin-control-plane");

  return (
    <main className="p-6">
      <SectionFrame area="Admin" className="surface-card p-6" component="AdminDashboard" sectionId="admin.control-plane" variant="control-plane">
        <div className="flex flex-col justify-between gap-4 border-b border-border pb-6 lg:flex-row lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-secondary">Production control</p>
            <h1 className="mt-2 font-display text-3xl font-semibold">Admin Control Plane</h1>
            <p className="mt-3 max-w-3xl text-secondary">
              Operate storefront content, catalog merchandising, fulfillment, users, roles, media, and publishing workflow from controlled admin modules.
            </p>
          </div>
          <ButtonLink className="gap-2" href="/admin/homepage" variant="primary">
            <SlidersHorizontal aria-hidden="true" size={16} />
            Start editing
          </ButtonLink>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Metric icon={<SlidersHorizontal aria-hidden="true" size={18} />} label="Operable modules" value={String(activeModules.length)} />
          <Metric icon={<ShieldCheck aria-hidden="true" size={18} />} label="Editable fields" value={String(readiness.editableFieldCount)} />
          <Metric icon={<Database aria-hidden="true" size={18} />} label="Storage" value={readiness.productionStorage ? "Database" : "Validated"} />
        </div>

        <div className="mt-8 grid gap-8">
          {Object.entries(groups).map(([category, modules]) =>
            modules.length > 0 ? (
              <section className="border-t border-border pt-6" key={category}>
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                  <div>
                    <h2 className="font-display text-xl font-semibold">{category}</h2>
                    <p className="mt-1 text-sm text-secondary">{modules.length} production modules</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  {modules.map((module) => (
                    <a className="group rounded-md border border-border bg-surface-muted p-4 transition hover:border-primary" href={module.href} key={module.id}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold">{module.title}</h3>
                          <p className="mt-2 text-sm text-secondary">{module.purpose}</p>
                        </div>
                        <ArrowRight aria-hidden="true" className="mt-1 shrink-0 transition group-hover:translate-x-1" size={18} />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-secondary">
                        <span className="rounded-md border border-border bg-surface px-2 py-1">{module.riskLevel}</span>
                        <span className="rounded-md border border-border bg-surface px-2 py-1">{module.editableFields.length} fields</span>
                        <span className="rounded-md border border-border bg-surface px-2 py-1">{module.workflowActions.length} actions</span>
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            ) : null
          )}
        </div>
      </SectionFrame>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-muted p-4">
      <div className="flex items-center gap-2 text-secondary">
        {icon}
        <p className="text-sm font-semibold uppercase tracking-[0.08em]">{label}</p>
      </div>
      <p className="mt-3 font-display text-2xl font-semibold">{value}</p>
    </div>
  );
}
