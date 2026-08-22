import { ExternalLink, FileText, Home, Image as ImageIcon, Menu, Pencil } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AdminMediaLibrary } from "@/components/admin/admin-media-library";
import { AdminNavigationSeoManager } from "@/components/admin/admin-navigation-seo-manager";
import {
  storefrontEditablePagesByGroup,
  type StorefrontEditablePageGroup
} from "@/config/storefront-pages.config";
import { readAdminMediaLibrary } from "@/server/admin/admin-media-library-service";
import {
  readAdminNavigationSeoWorkspace,
  type AdminNavigationSeoWorkspace
} from "@/server/admin/admin-navigation-seo-service";
import { requireAdminSession } from "@/server/admin/admin-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WebsiteEditorTab = "pages" | "navigation" | "media";

const groupOrder: StorefrontEditablePageGroup[] = [
  "Commerce",
  "Departments",
  "Balloons",
  "Holidays",
  "Content",
  "Policies",
  "Locations",
  "Products"
];

export default async function AdminStorefrontPagesPage({
  searchParams
}: {
  searchParams?: Promise<{ page?: string; q?: string; tab?: string }>;
}) {
  const session = await requireAdminSession({ capability: "storefront:read", returnTo: "/admin/storefront-pages" });
  const params = await searchParams;
  const canReadMedia = hasCapability(session.capabilities, "media:read");
  const requestedTab = normalizeTab(params?.tab);
  const activeTab = requestedTab === "media" && !canReadMedia ? "pages" : requestedTab;

  let navigationWorkspace: AdminNavigationSeoWorkspace | undefined;
  let navigationError: string | undefined;
  if (activeTab === "navigation") {
    try {
      navigationWorkspace = await readAdminNavigationSeoWorkspace();
    } catch {
      navigationError = "Navigation & SEO health is temporarily unavailable.";
    }
  }

  const mediaLibrary = activeTab === "media"
    ? await readAdminMediaLibrary({ q: params?.q, page: Number(params?.page || 1) })
    : undefined;

  return (
    <main className="admin-page" data-store-component="AdminWebsiteEditorHub">
      <header className="flex justify-end">
        <Link className="admin-button" href="/admin/homepage"><Home size={15} />Open homepage studio</Link>
      </header>

      <nav aria-label="Website editor sections" className="flex flex-wrap gap-2 border-b border-border">
        <EditorTab active={activeTab === "pages"} href="/admin/storefront-pages" icon={<FileText size={15} />} label="Pages & homepage" />
        <EditorTab active={activeTab === "navigation"} href="/admin/storefront-pages?tab=navigation" icon={<Menu size={15} />} label="Navigation & SEO" />
        {canReadMedia ? <EditorTab active={activeTab === "media"} href="/admin/storefront-pages?tab=media" icon={<ImageIcon size={15} />} label="Media" /> : null}
      </nav>

      {activeTab === "pages" ? <PagesWorkspace /> : null}
      {activeTab === "navigation" ? (
        <AdminNavigationSeoManager
          canPublish={hasCapability(session.capabilities, "storefront:publish")}
          canWrite={hasCapability(session.capabilities, "storefront:write")}
          embedded
          error={navigationError}
          initialWorkspace={navigationWorkspace}
        />
      ) : null}
      {activeTab === "media" && mediaLibrary ? (
        <MediaWorkspace
          canWrite={hasCapability(session.capabilities, "media:write")}
          library={mediaLibrary}
          q={params?.q}
        />
      ) : null}
    </main>
  );
}

function PagesWorkspace() {
  const groups = storefrontEditablePagesByGroup();

  return (
    <div className="grid gap-5">
      <section className="admin-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="admin-section-heading">Homepage</h2>
          <p className="admin-section-note">Edit the main landing page in the visual studio and preview it before publishing.</p>
        </div>
        <Link className="admin-button-secondary shrink-0" href="/admin/homepage"><Pencil size={15} />Edit homepage</Link>
      </section>

      {groupOrder.map((group) => {
        const pages = groups[group];
        if (!pages.length) return null;
        return (
          <section className="admin-panel overflow-hidden" key={group}>
            <div className="admin-panel-header p-5">
              <div><h2 className="admin-section-heading">{group}</h2><p className="admin-section-note">{pages.length} editable {pages.length === 1 ? "page" : "pages"}</p></div>
            </div>
            <div className="divide-y divide-border border-t border-border">
              {pages.map((page) => {
                const delegatedHref = page.group === "Policies"
                  ? "/admin/settings?area=policies"
                  : page.group === "Locations"
                    ? "/admin/settings?area=locations"
                    : null;
                return (
                  <div className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center" key={`${page.scope}:${page.entityId}`}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-primary">{page.title}</h3><code className="text-xs text-secondary">{page.route}</code></div>
                      <p className="mt-1 max-w-4xl text-sm text-secondary">{page.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link className="admin-button-secondary" href={delegatedHref ?? editorHref(page.scope, page.entityId)}>{delegatedHref ? "Open canonical settings" : "Edit page"}</Link>
                      <a className="admin-button-secondary" href={page.route} rel="noreferrer" target="_blank">Preview<ExternalLink size={14} /></a>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function MediaWorkspace({ canWrite, library, q }: { canWrite: boolean; library: Awaited<ReturnType<typeof readAdminMediaLibrary>>; q?: string }) {
  return (
    <div className="grid gap-5">
      <section className="admin-panel p-5">
        <h2 className="admin-section-heading">Media library</h2>
        <p className="admin-section-note">Upload storefront images, maintain alt text, and control website visibility. Files are never deleted here.</p>
        <form className="mt-4 flex gap-3" method="get">
          <input name="tab" type="hidden" value="media" />
          <input className="admin-form-control flex-1" defaultValue={q} maxLength={100} name="q" placeholder="Search alt text or file name" />
          <button className="admin-button-secondary" type="submit">Search</button>
        </form>
      </section>
      {!library.available ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">The media index is unavailable. Existing files are not being inferred from disk.</p> : null}
      <AdminMediaLibrary assets={library.assets} canWrite={canWrite} />
      <footer className="flex items-center justify-between text-sm">
        <span className="text-secondary">{library.total} assets · Page {library.page} of {library.pageCount}</span>
        <div className="flex gap-2">
          {library.page > 1 ? <Link className="admin-button-secondary" href={mediaPageHref(q, library.page - 1)}>Previous</Link> : null}
          {library.page < library.pageCount ? <Link className="admin-button-secondary" href={mediaPageHref(q, library.page + 1)}>Next</Link> : null}
        </div>
      </footer>
    </div>
  );
}

function EditorTab({ active, href, icon, label }: { active: boolean; href: string; icon: ReactNode; label: string }) {
  return <Link aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold ${active ? "border-primary text-primary" : "border-transparent text-secondary hover:text-primary"}`} href={href}>{icon}{label}</Link>;
}

function normalizeTab(tab?: string): WebsiteEditorTab {
  return tab === "navigation" || tab === "media" ? tab : "pages";
}

function editorHref(scope: string, entityId: string) {
  const query = new URLSearchParams({ scope, id: entityId });
  return `/admin/homepage?${query.toString()}`;
}

function mediaPageHref(q: string | undefined, page: number) {
  const query = new URLSearchParams({ tab: "media", page: String(page) });
  if (q) query.set("q", q);
  return `/admin/storefront-pages?${query.toString()}`;
}

function hasCapability(capabilities: string[], permission: string) {
  return capabilities.includes("admin:*") || capabilities.includes(permission);
}
