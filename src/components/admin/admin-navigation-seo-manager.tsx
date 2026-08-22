/** Provides controlled navigation editing plus read-only SEO health. */

"use client";

import { ArrowDown, ArrowUp, ExternalLink, Plus, Save, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import type { HeaderNavigationConfig, HeaderNavigationLink } from "@/config/header-navigation.config";
import type { AdminNavigationSeoWorkspace, SeoHealthPage } from "@/server/admin/admin-navigation-seo-service";

type SaveResponse = {
  ok: boolean;
  message?: string;
  errors?: string[];
  result?: {
    versionNumber: number;
    status: string;
    createdAt: string;
    publishedAt: string | null;
    navigation: HeaderNavigationConfig;
  };
};

const protectedPrimaryIds = new Set(["about-us"]);
const protectedUtilityIds = new Set(["search", "account", "wishlist", "cart"]);

export function AdminNavigationSeoManager({
  canPublish = false,
  canWrite = false,
  embedded = false,
  error,
  initialWorkspace
}: {
  canPublish?: boolean;
  canWrite?: boolean;
  embedded?: boolean;
  error?: string;
  initialWorkspace?: AdminNavigationSeoWorkspace;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [navigation, setNavigation] = useState(initialWorkspace?.editableNavigation);
  const [changeSummary, setChangeSummary] = useState("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState<"save_draft" | "publish" | null>(null);

  if (!workspace || !navigation) {
    const WorkspaceRoot = embedded ? "div" : "main";
    return (
      <WorkspaceRoot className={embedded ? "grid gap-4" : "admin-page"} data-store-component="AdminNavigationSeoManager">
        <section className="admin-panel admin-error-state" role="alert"><div><p className="text-sm font-bold">Navigation &amp; SEO unavailable</p><p className="mt-1 text-xs">{error || "The workspace could not be loaded."}</p></div></section>
      </WorkspaceRoot>
    );
  }

  const writeEnabled = canWrite && workspace.publication.databaseWritesEnabled;
  const availableDepartments = workspace.departmentOptions.filter((department) =>
    !navigation.primary.some((link) => navigationLinkMatchesDepartment(link, department))
  );

  function addDepartment() {
    const department = workspace?.departmentOptions.find((option) => option.id === selectedDepartmentId);
    if (!department || !navigation || navigation.primary.length >= 12) return;
    setNavigation(addDepartmentLink(navigation, department));
    setSelectedDepartmentId("");
    setFeedback(`${department.label} was added to the draft. Publish the navigation to show it in the storefront navbar.`);
  }

  async function submit(operation: "save_draft" | "publish") {
    if (!navigation || saving) return;
    setSaving(operation);
    setFeedback("");
    try {
      const response = await fetch("/api/admin/navigation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation,
          navigation,
          changeSummary,
          expectedVersion: workspace!.publication.currentVersion
        })
      });
      const payload = await response.json() as SaveResponse;
      if (!response.ok || !payload.ok || !payload.result) throw new Error(payload.errors?.join(" ") || payload.message || "Navigation could not be saved.");
      const result = payload.result;
      setNavigation(result.navigation);
      setWorkspace((current) => current ? {
        ...current,
        editableNavigation: result.navigation,
        publishedNavigation: operation === "publish" ? result.navigation : current.publishedNavigation,
        publication: {
          ...current.publication,
          status: result.status,
          currentVersion: result.versionNumber,
          updatedAt: result.createdAt,
          lastPublishedAt: result.publishedAt || current.publication.lastPublishedAt,
          hasUnpublishedChanges: operation !== "publish" && JSON.stringify(result.navigation) !== JSON.stringify(current.publishedNavigation)
        }
      } : current);
      setChangeSummary("");
      setFeedback(operation === "publish" ? `Published version ${result.versionNumber}.` : `Saved draft version ${result.versionNumber}.`);
    } catch (requestError) {
      setFeedback(requestError instanceof Error ? requestError.message : "Navigation could not be saved.");
    } finally {
      setSaving(null);
    }
  }

  const WorkspaceRoot = embedded ? "div" : "main";

  return (
    <WorkspaceRoot className={embedded ? "grid gap-4" : "admin-page"} data-store-component="AdminNavigationSeoManager">
      <header className="admin-page-header admin-page-header--actions-only">
        <div className="admin-page-header-actions">
          <span className="admin-status-badge admin-status-badge--neutral">{workspace.publication.status}</span>
          <span className={workspace.publication.hasUnpublishedChanges ? "admin-status-badge admin-status-badge--warning" : "admin-status-badge admin-status-badge--good"}>
            {workspace.publication.hasUnpublishedChanges ? "Draft differs from public" : "Matches public navigation"}
          </span>
        </div>
      </header>

      <section className="admin-panel p-5" aria-labelledby="navigation-preview-heading">
        <div className="admin-panel-header">
          <div><h2 className="admin-section-heading" id="navigation-preview-heading">Storefront navigation preview</h2><p className="admin-section-note">Visible primary links in their current draft order.</p></div>
          <span className="text-xs font-semibold text-secondary">Version {workspace.publication.currentVersion || "default"}</span>
        </div>
        <nav aria-label="Draft storefront navigation" className="mt-5 flex min-h-16 flex-wrap items-center gap-2 rounded-lg bg-[#111827] px-4 py-3 text-white">
          {navigation.primary.filter((link) => link.visible).map((link) => <span className="rounded-md px-3 py-2 text-sm font-semibold" key={link.id}>{link.label}</span>)}
          <span className="ml-auto rounded-md bg-white px-3 py-2 text-sm font-bold text-[#111827]">{navigation.mobileCta.label}</span>
        </nav>
        {workspace.navigationIssues.length ? <p className="mt-3 text-xs font-semibold text-red-700">{workspace.navigationIssues.join(" ")}</p> : null}
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.5fr)]">
        <section className="admin-panel p-5" aria-labelledby="navigation-editor-heading">
          <div className="admin-panel-header">
            <div><h2 className="admin-section-heading" id="navigation-editor-heading">Controlled links</h2><p className="admin-section-note">Plain labels and internal paths or credential-free HTTPS URLs only.</p></div>
            <button className="admin-button-secondary" disabled={!writeEnabled || navigation.primary.length >= 12} onClick={() => setNavigation(addPrimaryLink(navigation))} type="button"><Plus size={15} />Add primary link</button>
          </div>

          <div className="mt-5 rounded-md border border-border bg-surface-muted p-4">
            <div>
              <h3 className="text-sm font-bold text-primary">Add a department to the navbar</h3>
              <p className="mt-1 text-xs text-secondary">Choose a visible top-level website department. It will be added to this draft before Holidays; publish the navigation when it is ready.</p>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="grid min-w-0 flex-1 gap-1.5 text-xs font-semibold text-secondary">
                Department
                <select
                  className="min-h-10 rounded-md border border-border bg-surface px-3 text-sm text-primary"
                  disabled={!writeEnabled || availableDepartments.length === 0 || navigation.primary.length >= 12}
                  onChange={(event) => setSelectedDepartmentId(event.target.value)}
                  value={selectedDepartmentId}
                >
                  <option value="">{availableDepartments.length ? "Choose a department" : "All departments are already in the navbar"}</option>
                  {availableDepartments.map((department) => <option key={department.id} value={department.id}>{department.label}</option>)}
                </select>
              </label>
              <button className="admin-button-secondary shrink-0" disabled={!writeEnabled || !selectedDepartmentId || navigation.primary.length >= 12} onClick={addDepartment} type="button"><Plus size={15} />Add department</button>
            </div>
            <a className="mt-3 inline-flex text-xs font-semibold text-blue hover:text-navy" href="/admin/products?tab=publishing#structure-categories">Manage website departments</a>
          </div>

          <NavigationList
            canEdit={writeEnabled}
            links={navigation.primary}
            onChange={(primary) => setNavigation({ ...navigation, primary })}
            protectedIds={protectedPrimaryIds}
            title="Primary navigation"
          />
          <NavigationList
            canEdit={writeEnabled}
            links={navigation.utility}
            onChange={(utility) => setNavigation({ ...navigation, utility })}
            protectedHrefs
            protectedIds={protectedUtilityIds}
            title="Utility navigation"
          />

          <div className="mt-6 border-t border-border pt-5">
            <h3 className="text-sm font-bold text-primary">Mobile call to action</h3>
            <LinkEditor canEdit={writeEnabled} link={navigation.mobileCta} onChange={(mobileCta) => setNavigation({ ...navigation, mobileCta })} />
          </div>

          <label className="mt-6 grid gap-2 text-xs font-semibold text-secondary">
            Change summary
            <input className="min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-primary" disabled={!writeEnabled} maxLength={200} onChange={(event) => setChangeSummary(event.target.value)} placeholder="Why is this navigation changing?" value={changeSummary} />
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="admin-button-secondary" disabled={!writeEnabled || Boolean(saving) || changeSummary.trim().length < 3} onClick={() => void submit("save_draft")} type="button"><Save size={15} />{saving === "save_draft" ? "Saving…" : "Save draft"}</button>
            <button className="admin-button" disabled={!writeEnabled || !canPublish || Boolean(saving) || changeSummary.trim().length < 3} onClick={() => void submit("publish")} type="button"><Send size={15} />{saving === "publish" ? "Publishing…" : "Publish"}</button>
            {!workspace.publication.databaseWritesEnabled ? <span className="text-xs font-semibold text-amber-800">Database persistence is not configured; editing is read-only.</span> : null}
            {feedback ? <span aria-live="polite" className="text-xs font-semibold text-secondary">{feedback}</span> : null}
          </div>
        </section>

        <PublicationPanel workspace={workspace} />
      </div>

      <SeoHealthPanel seo={workspace.seo} />
    </WorkspaceRoot>
  );
}

function NavigationList({ canEdit, links, onChange, protectedHrefs = false, protectedIds, title }: { canEdit: boolean; links: HeaderNavigationLink[]; onChange: (links: HeaderNavigationLink[]) => void; protectedHrefs?: boolean; protectedIds: Set<string>; title: string }) {
  return (
    <div className="mt-6 border-t border-border pt-5">
      <h3 className="text-sm font-bold text-primary">{title}</h3>
      <div className="mt-3 grid gap-3">
        {links.map((link, index) => (
          <div className="rounded-md border border-border bg-surface-muted p-3" key={link.id}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1"><LinkEditor canEdit={canEdit} hrefLocked={protectedHrefs && protectedIds.has(link.id)} link={link} onChange={(next) => onChange(replaceAt(links, index, next))} /></div>
              <div className="flex shrink-0 gap-1">
                <IconButton disabled={!canEdit || index === 0} label={`Move ${link.label} up`} onClick={() => onChange(move(links, index, index - 1))}><ArrowUp size={14} /></IconButton>
                <IconButton disabled={!canEdit || index === links.length - 1} label={`Move ${link.label} down`} onClick={() => onChange(move(links, index, index + 1))}><ArrowDown size={14} /></IconButton>
                <IconButton disabled={!canEdit || protectedIds.has(link.id)} label={`Remove ${link.label}`} onClick={() => onChange(links.filter((_, current) => current !== index))}><Trash2 size={14} /></IconButton>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LinkEditor({ canEdit, hrefLocked = false, link, onChange }: { canEdit: boolean; hrefLocked?: boolean; link: HeaderNavigationLink; onChange: (link: HeaderNavigationLink) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(130px,0.7fr)_minmax(180px,1.3fr)_auto] md:items-end">
      <label className="grid gap-1.5 text-xs font-semibold text-secondary">Label<input className="min-h-10 rounded-md border border-border bg-surface px-3 text-sm text-primary" disabled={!canEdit} maxLength={40} onChange={(event) => onChange({ ...link, label: event.target.value })} value={link.label} /></label>
      <label className="grid gap-1.5 text-xs font-semibold text-secondary">Link<input className="min-h-10 rounded-md border border-border bg-surface px-3 text-sm text-primary" disabled={!canEdit || hrefLocked} maxLength={300} onChange={(event) => onChange({ ...link, href: event.target.value })} value={link.href} /></label>
      <label className="flex min-h-10 items-center gap-2 text-xs font-semibold text-secondary"><input checked={link.visible} disabled={!canEdit} onChange={(event) => onChange({ ...link, visible: event.target.checked })} type="checkbox" />Visible</label>
    </div>
  );
}

function PublicationPanel({ workspace }: { workspace: AdminNavigationSeoWorkspace }) {
  return (
    <aside className="admin-panel p-5">
      <h2 className="admin-section-heading">Publication state</h2>
      <dl className="mt-5 grid gap-4 text-sm">
        <PublicationRow label="Workspace status" value={workspace.publication.status} />
        <PublicationRow label="Current version" value={String(workspace.publication.currentVersion || "Default config")} />
        <PublicationRow label="Updated" value={formatDate(workspace.publication.updatedAt)} />
        <PublicationRow label="Last published" value={workspace.publication.lastPublishedAt ? formatDate(workspace.publication.lastPublishedAt) : "No persisted publication"} />
        <PublicationRow label="Public comparison" value={workspace.publication.hasUnpublishedChanges ? "Draft differs" : "In sync"} />
      </dl>
      <a className="admin-button-secondary mt-6" href="/" rel="noreferrer" target="_blank">Open storefront<ExternalLink size={14} /></a>
    </aside>
  );
}

function PublicationRow({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-border pb-3"><dt className="text-xs font-semibold text-secondary">{label}</dt><dd className="mt-1 font-semibold text-primary">{value}</dd></div>;
}

function SeoHealthPanel({ seo }: { seo: AdminNavigationSeoWorkspace["seo"] }) {
  return (
    <section className="admin-panel mt-4 overflow-hidden" aria-labelledby="seo-health-heading">
      <div className="admin-panel-header p-5">
        <div><h2 className="admin-section-heading" id="seo-health-heading">SEO health</h2><p className="admin-section-note">Read-only checks from published CMS metadata, route configs, Square catalog, robots, and the generated sitemap.</p></div>
        <span className={seo.summary.errors ? "admin-status-badge admin-status-badge--danger" : seo.summary.warnings ? "admin-status-badge admin-status-badge--warning" : "admin-status-badge admin-status-badge--good"}>{seo.summary.errors} errors · {seo.summary.warnings} warnings</span>
      </div>
      <div className="grid gap-3 border-t border-border bg-surface-muted p-5 sm:grid-cols-3">
        <SeoMetric label="Routes checked" value={seo.summary.total} />
        <SeoMetric label="Robots" value={seo.robots.indexingEnabled ? "Indexing enabled" : "Disallow all"} />
        <SeoMetric label="Sitemap routes" value={seo.sitemap.routeCount} />
      </div>
      {seo.unavailableSources.length ? <p className="border-t border-border bg-amber-50 px-5 py-3 text-xs font-semibold text-amber-900">Unavailable source: {seo.unavailableSources.join(", ")}. Catalog SEO coverage is partial.</p> : null}
      <div className="admin-products-table-wrap">
        <table className="admin-products-table">
          <thead><tr><th>Route</th><th>Source</th><th>Title & description</th><th>Canonical</th><th>Sitemap</th><th>Health</th></tr></thead>
          <tbody>{seo.pages.map((page) => <SeoHealthRow key={page.path} page={page} />)}</tbody>
        </table>
      </div>
    </section>
  );
}

function SeoHealthRow({ page }: { page: SeoHealthPage }) {
  return (
    <tr>
      <td className="align-top font-semibold text-primary">{page.path}</td>
      <td className="align-top text-xs text-secondary">{page.source}</td>
      <td className="max-w-sm align-top"><p className="truncate font-semibold text-primary" title={page.title}>{page.title || "Missing title"}</p><p className="mt-1 line-clamp-2 text-xs text-secondary">{page.description || "Missing description"}</p></td>
      <td className="max-w-56 truncate align-top text-xs text-secondary" title={page.canonical || undefined}>{page.canonical || "Missing canonical"}</td>
      <td className="align-top text-xs font-semibold">{page.inSitemap ? "Included" : "Missing"}</td>
      <td className="min-w-52 align-top"><span className={page.status === "healthy" ? "admin-status-badge admin-status-badge--good" : page.status === "warning" ? "admin-status-badge admin-status-badge--warning" : "admin-status-badge admin-status-badge--danger"}>{page.status}</span>{page.issues.length ? <ul className="mt-2 grid gap-1 text-xs text-secondary">{page.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}</td>
    </tr>
  );
}

function SeoMetric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-md border border-border bg-surface p-4"><p className="text-xs font-semibold text-secondary">{label}</p><p className="mt-1 text-lg font-bold text-primary">{value}</p></div>;
}

function IconButton({ children, disabled, label, onClick }: { children: React.ReactNode; disabled: boolean; label: string; onClick: () => void }) {
  return <button aria-label={label} className="grid size-9 place-items-center rounded-md border border-border bg-surface text-secondary disabled:cursor-not-allowed disabled:opacity-35" disabled={disabled} onClick={onClick} type="button">{children}</button>;
}

function addPrimaryLink(navigation: HeaderNavigationConfig): HeaderNavigationConfig {
  return { ...navigation, primary: [...navigation.primary, { id: `custom-${Date.now()}`, label: "New link", href: "/shop", visible: true }] };
}

function addDepartmentLink(
  navigation: HeaderNavigationConfig,
  department: AdminNavigationSeoWorkspace["departmentOptions"][number]
): HeaderNavigationConfig {
  if (
    navigation.primary.length >= 12 ||
    navigation.primary.some((link) => navigationLinkMatchesDepartment(link, department))
  ) {
    return navigation;
  }

  const link: HeaderNavigationLink = {
    id: department.id,
    label: department.label,
    href: department.href,
    visible: true
  };
  const holidaysIndex = navigation.primary.findIndex((candidate) => candidate.id === "holidays");
  const insertAt = holidaysIndex >= 0 ? holidaysIndex : navigation.primary.length;

  return {
    ...navigation,
    primary: [
      ...navigation.primary.slice(0, insertAt),
      link,
      ...navigation.primary.slice(insertAt)
    ]
  };
}

function navigationLinkMatchesDepartment(
  link: HeaderNavigationLink,
  department: AdminNavigationSeoWorkspace["departmentOptions"][number]
) {
  return link.id === department.id || normalizeNavigationPath(link.href) === normalizeNavigationPath(department.href);
}

function normalizeNavigationPath(href: string) {
  return href.split(/[?#]/, 1)[0]?.replace(/\/+$/, "") || "/";
}

function replaceAt<T>(values: T[], index: number, value: T) {
  return values.map((current, currentIndex) => currentIndex === index ? value : current);
}

function move<T>(values: T[], from: number, to: number) {
  const next = [...values];
  const [value] = next.splice(from, 1);
  if (value !== undefined) next.splice(to, 0, value);
  return next;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(date);
}
