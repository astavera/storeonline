/**
 * Renders the admin dashboard interface and its user interactions.
 */

import { ArrowRight, EyeOff, ShieldCheck, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { SectionFrame } from "@/components/sections/section-frame";
import { adminModules } from "@/config/admin-control-plane";

const activeModuleIds = new Set(["homepage", "product-placement"]);

export function AdminDashboard() {
  const activeModules = adminModules.filter((module) => activeModuleIds.has(module.id));

  return (
    <main className="p-6">
      <SectionFrame area="Admin" className="surface-card p-6" component="AdminDashboard" sectionId="admin.control-plane" variant="control-plane">
        <div className="flex flex-col justify-between gap-4 border-b border-border pb-6 lg:flex-row lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-secondary">Phase 1 workspace</p>
            <h1 className="mt-2 font-display text-3xl font-semibold">Current admin work</h1>
            <p className="mt-3 max-w-3xl text-secondary">
              Only the tools that are useful right now are visible. Future catalog, operations, and system modules will return when their phase begins.
            </p>
          </div>
          <ButtonLink className="gap-2" href="/admin/product-placement" variant="primary">
            <SlidersHorizontal aria-hidden="true" size={16} />
            Open catalog publishing
          </ButtonLink>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Metric icon={<SlidersHorizontal aria-hidden="true" size={18} />} label="Active tools" value={String(activeModules.length)} />
          <Metric icon={<EyeOff aria-hidden="true" size={18} />} label="Square default" value="Hidden" />
          <Metric icon={<ShieldCheck aria-hidden="true" size={18} />} label="Square access" value="Read only" />
        </div>

        <section className="mt-8 border-t border-border pt-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h2 className="font-display text-xl font-semibold">Working tools</h2>
              <p className="mt-1 text-sm text-secondary">The two production workflows currently under development.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            {activeModules.map((module) => (
              <a className="group rounded-md border border-border bg-surface-muted p-5 transition hover:border-primary" href={module.href} key={module.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-blue">{module.id === "homepage" ? "Website" : "Catalog"}</p>
                    <h3 className="mt-2 font-display text-xl font-semibold">{module.id === "homepage" ? "Website Editor" : "Catalog Publishing"}</h3>
                    <p className="mt-2 text-sm text-secondary">{module.purpose}</p>
                  </div>
                  <ArrowRight aria-hidden="true" className="mt-1 shrink-0 transition group-hover:translate-x-1" size={18} />
                </div>
              </a>
            ))}
          </div>
        </section>
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
