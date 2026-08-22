/** Verifies audit filtering, pagination, actor projection, and secret redaction. */

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  findMany: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  getPrismaClient: () => ({ auditLog: { count: mocks.count, findMany: mocks.findMany } })
}));

import {
  parseAdminAuditLogQuery,
  readAdminAuditLog,
  createAdminAuditLogCsvExport,
  encodeAdminAuditCsvCell,
  sanitizeAuditSnapshot
} from "@/server/admin/admin-audit-log-service";

afterEach(() => {
  vi.clearAllMocks();
});

describe("admin audit log service", () => {
  it("normalizes bounded filters, pagination, and valid calendar dates", () => {
    const query = parseAdminAuditLogQuery(new URLSearchParams({
      page: "3",
      pageSize: "500",
      action: "  storefront.publish  ",
      entityType: "policy",
      actor: "owner@example.com",
      from: "2026-08-01",
      to: "2026-02-31"
    }));

    expect(query).toEqual({
      page: 3,
      pageSize: 100,
      action: "storefront.publish",
      entityType: "policy",
      actor: "owner@example.com",
      from: "2026-08-01",
      to: ""
    });
  });

  it("filters Prisma reads and returns a clamped page with sanitized snapshots", async () => {
    mocks.count.mockResolvedValue(26);
    mocks.findMany.mockResolvedValue([{
      id: "audit-1",
      actorId: "user-1",
      action: "storefront.publish",
      entityType: "policy",
      entityId: "privacy",
      before: { title: "Draft", nested: { apiToken: "do-not-return" } },
      after: { title: "Published", passwordHash: "do-not-return" },
      createdAt: new Date("2026-08-19T14:00:00.000Z"),
      actor: { id: "user-1", email: "owner@example.com", displayName: "Owner" }
    }]);

    const result = await readAdminAuditLog(parseAdminAuditLogQuery({
      page: "10",
      pageSize: "25",
      action: "publish",
      entityType: "policy",
      actor: "owner",
      from: "2026-08-01",
      to: "2026-08-31"
    }));

    expect(mocks.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        action: { contains: "publish", mode: "insensitive" },
        entityType: { contains: "policy", mode: "insensitive" },
        createdAt: {
          gte: new Date("2026-08-01T00:00:00.000Z"),
          lte: new Date("2026-08-31T23:59:59.999Z")
        }
      })
    });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 25, take: 25 }));
    expect(result.pagination).toEqual({ page: 2, pageCount: 2, pageSize: 25, total: 26 });
    expect(result.entries[0]).toMatchObject({
      before: { title: "Draft", nested: { apiToken: "[REDACTED]" } },
      after: { title: "Published", passwordHash: "[REDACTED]" },
      createdAt: "2026-08-19T14:00:00.000Z"
    });
  });

  it("redacts nested credentials without removing ordinary audit data", () => {
    expect(sanitizeAuditSnapshot({
      email: "owner@example.com",
      credentials: { accessToken: "secret" },
      settings: [{ mfaSecret: "secret", enabled: true }]
    })).toEqual({
      email: "[REDACTED]",
      credentials: "[REDACTED]",
      settings: [{ mfaSecret: "[REDACTED]", enabled: true }]
    });
  });

  it("redacts additional session, hashed PII, private key and signed-label fields", () => {
    expect(sanitizeAuditSnapshot({
      sessionId: "session-secret",
      emailHash: "hashed-email",
      privateKey: "private-key",
      privateLabelUrl: "signed-url",
      ordinaryStatus: "ACTIVE"
    })).toEqual({
      sessionId: "[REDACTED]",
      emailHash: "[REDACTED]",
      privateKey: "[REDACTED]",
      privateLabelUrl: "[REDACTED]",
      ordinaryStatus: "ACTIVE"
    });
  });

  it.each(["=2+2", "+SUM(A1:A2)", "-10+20", "@IMPORTXML(A1)", "  =cmd|' /C calc'!A0"])(
    "neutralizes spreadsheet formulas in CSV cells: %s",
    (payload) => {
      expect(encodeAdminAuditCsvCell(payload)).toBe(`"'${payload}"`);
    }
  );

  it("removes null bytes and bounds oversized CSV cells", () => {
    const encoded = encodeAdminAuditCsvCell(`safe\0${"x".repeat(25_000)}`);
    expect(encoded).not.toContain("\0");
    expect(encoded).toContain("[truncated]");
    expect(encoded.length).toBeLessThan(20_100);
  });

  it("streams bounded, redacted CSV batches without actor email or raw secrets", async () => {
    mocks.count.mockResolvedValue(5_001);
    mocks.findMany
      .mockResolvedValueOnce([{
        id: "audit-1",
        actorId: "owner-1",
        action: "=DANGEROUS_ACTION",
        entityType: "CustomerAccount",
        entityId: "customer-1",
        before: { email: "customer@example.com", sessionToken: "secret", status: "OLD" },
        after: { phone: "+12125550100", status: "NEW" },
        createdAt: new Date("2026-08-19T14:00:00.000Z"),
        actor: { displayName: "Owner", email: "must-not-be-selected@example.com" }
      }])
      .mockResolvedValue([]);

    const exported = await createAdminAuditLogCsvExport(parseAdminAuditLogQuery({ action: "publish" }));
    const csv = await new Response(exported.stream).text();

    expect(exported).toMatchObject({ total: 5_001, rowLimit: 5_000, truncated: true });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 250 }));
    expect(csv).toContain("Timestamp UTC");
    expect(csv).toContain("'=DANGEROUS_ACTION");
    expect(csv).toContain("[REDACTED]");
    expect(csv).toContain("NEW");
    expect(csv).not.toContain("customer@example.com");
    expect(csv).not.toContain("+12125550100");
    expect(csv).not.toContain("secret");
    expect(csv).not.toContain("must-not-be-selected@example.com");
  });

  it("streams large exports in keyset-paginated batches", async () => {
    const record = (index: number) => ({
      id: `audit-${index}`,
      actorId: "owner-1",
      action: "READ",
      entityType: "Product",
      entityId: `product-${index}`,
      before: null,
      after: null,
      createdAt: new Date("2026-08-19T14:00:00.000Z"),
      actor: { displayName: "Owner" }
    });
    mocks.count.mockResolvedValue(251);
    mocks.findMany
      .mockResolvedValueOnce(Array.from({ length: 250 }, (_, index) => record(index)))
      .mockResolvedValueOnce([record(250)]);

    const exported = await createAdminAuditLogCsvExport(parseAdminAuditLogQuery({}));
    await new Response(exported.stream).text();

    expect(mocks.findMany).toHaveBeenNthCalledWith(1, expect.not.objectContaining({ cursor: expect.anything() }));
    expect(mocks.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      cursor: { id: "audit-249" },
      skip: 1,
      take: 1
    }));
  });
});
