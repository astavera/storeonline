/** Campaign overview sourced from the storefront CMS; financial discounts remain in Square. */

import Link from "next/link";

import { requireAdminSession } from "@/server/admin/admin-session";
import { readAdminPromotionWorkspace } from "@/server/admin/admin-promotion-workspace";

export default async function AdminPromotionsPage() {
  await requireAdminSession({ capability: "promotions:read", returnTo: "/admin/promotions" });
  const workspace = await readAdminPromotionWorkspace();

  return (
    <main className="grid gap-6 p-5 sm:p-7">
      <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Marketing</p>
        <div className="mt-2 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <h2 className="text-2xl font-semibold">Promotions</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-secondary">Published, scheduled, and draft promotional sections detected in the real storefront CMS. Edit their copy, media, timing, and placement in Website Editor.</p>
          </div>
          <Link className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white" href="/admin/homepage">Open Website Editor</Link>
        </div>
        <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">{workspace.boundary}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Campaign sections" value={workspace.campaigns.length} />
          <Metric label="Published" value={workspace.statusCounts.PUBLISHED ?? 0} />
          <Metric label="Scheduled" value={workspace.statusCounts.SCHEDULED ?? 0} />
          <Metric label="Draft" value={workspace.statusCounts.DRAFT ?? 0} />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-white shadow-sm">
        {!workspace.available ? <p className="m-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">CMS campaign data is unavailable. No promotion state is being inferred.</p> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-surface-muted text-xs uppercase tracking-[0.08em] text-secondary"><tr><th className="px-5 py-3">Campaign section</th><th className="px-4 py-3">Page</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Timing</th><th className="px-5 py-3">Edit</th></tr></thead>
            <tbody className="divide-y divide-border">
              {workspace.campaigns.map((campaign) => <tr key={campaign.id}><td className="px-5 py-4"><strong className="block">{campaign.name}</strong><span className="text-xs text-secondary">{campaign.sectionType} · v{campaign.versionNumber}</span></td><td className="px-4 py-4">{campaign.entityType} / {campaign.entityId}</td><td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{campaign.status}</span></td><td className="px-4 py-4 text-xs text-secondary">{timing(campaign)}</td><td className="px-5 py-4"><Link className="font-semibold underline underline-offset-4" href={campaign.editorHref}>Open editor</Link></td></tr>)}
              {workspace.available && workspace.campaigns.length === 0 ? <tr><td className="px-5 py-8 text-center text-secondary" colSpan={5}>No promotional sections were found in the latest CMS versions.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-border bg-surface-muted p-3"><strong className="block text-xl">{value}</strong><span className="text-xs text-secondary">{label}</span></div>;
}

function timing(campaign: { publishedAt: string | null; scheduledPublishAt: string | null; scheduledUnpublishAt: string | null }) {
  const value = campaign.scheduledPublishAt ?? campaign.publishedAt;
  if (!value) return "No publication time";
  const prefix = campaign.scheduledPublishAt ? "Starts" : "Published";
  const end = campaign.scheduledUnpublishAt ? ` · Ends ${formatDate(campaign.scheduledUnpublishAt)}` : "";
  return `${prefix} ${formatDate(value)}${end}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(value));
}
