/*
STORE AREA: Admin
SECTION: Admin Page Shell
SECTION ID: admin.*
CUSTOMER-FACING: No
ADMIN-EDITABLE: Yes
WHAT THIS CONTROLS: Controlled no-code admin editor surface for production modules.
SAFE TO EDIT: Admin module layout, controlled fields, workflow buttons, and operational guardrails.
DO NOT EDIT HERE: Raw Square writes, payment logic, secrets, or password internals.
RELATED FILES: src/config/admin-control-plane.ts, src/config/store-section-registry.ts
BUSINESS LOGIC FILES: src/server/admin/admin-control-plane-service.ts, src/server/admin/admin-audit-service.ts
*/

import { AdminModuleEditor } from "@/components/admin/admin-module-editor";
import { getAdminModuleForPage, type AdminModule } from "@/config/admin-control-plane";
import { SectionFrame } from "../sections/section-frame";

export function AdminPageShell({
  title,
  sectionId,
  description
}: {
  title: string;
  sectionId: string;
  description: string;
}) {
  const module = getAdminModuleForPage(sectionId, title) ?? createFallbackModule({ title, sectionId, description });

  return (
    <main className="p-6">
      <SectionFrame area="Admin" className="surface-card p-6" component="AdminPageShell" sectionId={module.sectionId} variant="admin-control-editor">
        <AdminModuleEditor module={module} />
      </SectionFrame>
    </main>
  );
}

function createFallbackModule({
  title,
  sectionId,
  description
}: {
  title: string;
  sectionId: string;
  description: string;
}): AdminModule {
  return {
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || sectionId,
    href: "/admin",
    title,
    sectionId,
    category: "System",
    purpose: description,
    productionGoal: "Provide a controlled production editor for this admin section.",
    riskLevel: sectionId.includes("fulfillment") || sectionId.includes("slots") ? "critical" : "high",
    ownerRoles: ["Owner", "Manager"],
    connectedModels: ["CmsContentVersion", "AuditLog"],
    editableFields: [
      { name: "title", label: "Title", type: "text", required: true, helpText: "Controlled admin title.", defaultValue: title },
      { name: "summary", label: "Summary", type: "textarea", required: true, helpText: "Operational summary for this module.", defaultValue: description },
      { name: "enabled", label: "Enabled", type: "boolean", helpText: "Enable this module for production workflow.", defaultValue: false },
      { name: "staffNote", label: "Staff note", type: "textarea", helpText: "Internal note for the next publish.", defaultValue: "" }
    ],
    workflowActions: ["save_draft", "preview", "publish", "unpublish"],
    guardrails: ["All changes are validated against declared fields.", "Production persistence uses CmsContentVersion when DATABASE_URL is configured.", "Security-sensitive implementation details stay outside the editor."],
    productionChecklist: ["Owner or manager reviewed", "Validation passed", "Audit event created", "Rollback path available"]
  };
}
