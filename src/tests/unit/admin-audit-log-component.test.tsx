/** Verifies that only audit exporters receive the CSV download control. */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminAuditLog } from "@/components/admin/admin-audit-log";

const query = {
  page: 1,
  pageSize: 25,
  action: "publish",
  entityType: "policy",
  actor: "",
  from: "2026-08-01",
  to: "2026-08-31"
};
const result = { entries: [], pagination: { page: 1, pageSize: 25, pageCount: 1, total: 0 } };

describe("Admin Audit Log export control", () => {
  it("hides CSV export from read-only audit users", () => {
    const html = renderToStaticMarkup(<AdminAuditLog canExport={false} query={query} result={result} />);
    expect(html).not.toContain("Export CSV");
    expect(html).not.toContain("format=csv");
  });

  it("preserves active filters in the authorized CSV export link", () => {
    const html = renderToStaticMarkup(<AdminAuditLog canExport query={query} result={result} />);
    expect(html).toContain("Export CSV");
    expect(html).toContain("action=publish");
    expect(html).toContain("entityType=policy");
    expect(html).toContain("from=2026-08-01");
    expect(html).toContain("format=csv");
  });
});
