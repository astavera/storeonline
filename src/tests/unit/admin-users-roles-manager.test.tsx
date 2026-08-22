/** Verifies the Users & Roles directory states and primary navigation. */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AdminUsersRolesManager,
  type AdminIdentityDirectory
} from "@/components/admin/admin-users-roles-manager";

const connectedDirectory: AdminIdentityDirectory = {
  available: true,
  locations: [{ id: "main", name: "Main store" }],
  roles: ["OWNER", "MANAGER"],
  users: [
    {
      id: "owner",
      email: "owner@example.com",
      displayName: "Avery Morgan",
      role: "OWNER",
      status: "ACTIVE",
      mfaEnabled: true,
      locationScopeMode: "ALL",
      locations: [],
      operationsRole: "OPERATIONS_MANAGER",
      operationsLocationIds: ["main"],
      operationsLocations: [{ id: "main", name: "Main store" }],
      operationsAccessStatus: "ACTIVE",
      operationsLastSyncedAt: "2026-08-20T12:00:00.000Z",
      operationsSyncError: null,
      lastLoginAt: "2026-08-20T12:00:00.000Z",
      createdAt: "2026-08-01T12:00:00.000Z"
    },
    {
      id: "manager",
      email: "manager@example.com",
      displayName: "Jordan Lee",
      role: "MANAGER",
      status: "INVITED",
      mfaEnabled: false,
      locationScopeMode: "LOCATIONS",
      locations: [{ id: "main", name: "Main store" }],
      operationsRole: null,
      operationsLocationIds: [],
      operationsLocations: [],
      operationsAccessStatus: "NONE",
      operationsLastSyncedAt: null,
      operationsSyncError: null,
      lastLoginAt: null,
      createdAt: "2026-08-19T12:00:00.000Z"
    }
  ]
};

describe("AdminUsersRolesManager", () => {
  it("shows a truthful protected state when identity storage is unavailable", () => {
    render(
      <AdminUsersRolesManager
        canManageAdmin
        canManageOperations
        initialDirectory={{ available: false, reason: "DATABASE_NOT_CONFIGURED", locations: [], roles: ["OWNER"], users: [] }}
      />
    );

    expect(screen.getByRole("heading", { name: "Identity workspace unavailable" })).toBeTruthy();
    expect(screen.getByText("No local identities, role assignments, or access confirmations have been simulated.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Invite user" })).toHaveProperty("disabled", true);
  });

  it("filters users, opens role guidance, and exposes a focused access drawer", () => {
    render(
      <AdminUsersRolesManager
        canManageAdmin
        canManageOperations
        initialDirectory={connectedDirectory}
      />
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search users" }), { target: { value: "Avery" } });
    expect(screen.getAllByText("Avery Morgan").length).toBeGreaterThan(0);
    expect(screen.queryByText("Jordan Lee")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Roles & permissions" }));
    expect(screen.getByRole("heading", { name: "System roles" })).toBeTruthy();
    expect(screen.getByText("Fixed permission bundles keep access predictable and reviewable.")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Users" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Manage" })[0]);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Store Admin access" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revoke all sessions" })).toBeTruthy();
  });
});
