/** Interactive Store Admin identity management surface. */

"use client";

import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock3,
  Database,
  KeyRound,
  LockKeyhole,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UsersRound,
  WifiOff,
  X
} from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";

export type AdminUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  status: string;
  mfaEnabled: boolean;
  locationScopeMode: "ALL" | "LOCATIONS";
  locations: { id: string; name: string }[];
  operationsRole: string | null;
  operationsLocationIds: string[];
  operationsLocations: { id: string; name: string }[];
  operationsAccessStatus: string;
  operationsLastSyncedAt: string | null;
  operationsSyncError: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

export type AdminIdentityDirectory = {
  available: boolean;
  reason?: "DATABASE_NOT_CONFIGURED" | "DATABASE_UNAVAILABLE";
  users: AdminUser[];
  locations: { id: string; name: string }[];
  roles: readonly string[];
};

type ActionState = {
  kind: "idle" | "working" | "success" | "error";
  message: string;
  activationPath?: string;
};

type DirectoryView = "users" | "roles";

const roleLabels: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  MERCHANDISER: "Merchandiser",
  MARKETING_CONTENT: "Marketing & content",
  CUSTOMER_SUPPORT: "Customer support",
  ANALYST_VIEWER: "Analyst / viewer"
};

const roleDetails: Record<string, { description: string; areas: string[] }> = {
  OWNER: {
    description: "Full administrative control, including identity, security, publishing, and integrations.",
    areas: ["All admin areas", "Users & security", "Publishing"]
  },
  MANAGER: {
    description: "Day-to-day store management across catalog, orders, storefront, and operations.",
    areas: ["Catalog & orders", "Storefront", "Operations"]
  },
  MERCHANDISER: {
    description: "Product merchandising, media management, publishing, and inventory visibility.",
    areas: ["Catalog", "Media", "Inventory"]
  },
  MARKETING_CONTENT: {
    description: "Storefront content, campaigns, promotions, notifications, and performance reporting.",
    areas: ["Content", "Promotions", "Analytics"]
  },
  CUSTOMER_SUPPORT: {
    description: "Customer, order, return, notification, and operational support workflows.",
    areas: ["Customers", "Orders & returns", "Operations"]
  },
  ANALYST_VIEWER: {
    description: "Read-oriented access to operational data, analytics, audit history, and integrations.",
    areas: ["Analytics", "Audit history", "Read-only access"]
  }
};

const operationsRoleLabels: Record<string, string> = {
  OPERATIONS_MANAGER: "Operations manager",
  STORE_STAFF: "Store staff",
  FULFILLMENT: "Fulfillment",
  DELIVERY: "Delivery",
  WAREHOUSE: "Warehouse"
};

export function AdminUsersRolesManager({
  canManageAdmin,
  canManageOperations,
  initialDirectory
}: {
  canManageAdmin: boolean;
  canManageOperations: boolean;
  initialDirectory: AdminIdentityDirectory;
}) {
  const [directory, setDirectory] = useState(initialDirectory);
  const [view, setView] = useState<DirectoryView>("users");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [locationScopeMode, setLocationScopeMode] = useState<"ALL" | "LOCATIONS">("ALL");
  const [actionState, setActionState] = useState<ActionState>({ kind: "idle", message: "" });
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const activeUsers = directory.users.filter((user) => user.status === "ACTIVE");
    const active = activeUsers.length;
    const mfa = activeUsers.filter((user) => user.mfaEnabled).length;
    return {
      active,
      invited: directory.users.filter((user) => user.status === "INVITED").length,
      mfa,
      mfaCoverage: active > 0 ? Math.round((mfa / active) * 100) : 0,
      operations: directory.users.filter((user) => user.operationsAccessStatus === "ACTIVE").length
    };
  }, [directory.users]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return directory.users.filter((user) => {
      const matchesQuery = !normalizedQuery || [user.displayName, user.email, roleLabels[user.role]]
        .some((value) => value?.toLowerCase().includes(normalizedQuery));
      const matchesRole = roleFilter === "ALL" || user.role === roleFilter;
      const matchesStatus = statusFilter === "ALL" || user.status === statusFilter;
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [directory.users, query, roleFilter, statusFilter]);

  const selectedUser = selectedUserId
    ? directory.users.find((user) => user.id === selectedUserId) ?? null
    : null;

  async function refreshDirectory() {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const result = await response.json() as AdminIdentityDirectory & { error?: string };
    if (!response.ok || !result.available) throw new Error(result.error || "Could not refresh users.");
    setDirectory(result);
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionState({ kind: "working", message: "Creating the protected invitation…" });
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "invite",
          email: form.get("email"),
          displayName: form.get("displayName"),
          role: form.get("role"),
          locationScopeMode,
          locationIds: form.getAll("locationIds").map(String)
        })
      });
      const result = await response.json() as { ok?: boolean; error?: string; invitation?: { activationPath: string } };
      if (!response.ok || !result.ok || !result.invitation) throw new Error(result.error || "Invitation failed.");
      await refreshDirectory();
      event.currentTarget.reset();
      setLocationScopeMode("ALL");
      setInviteOpen(false);
      setActionState({
        kind: "success",
        message: "Invitation created. Share this one-time activation link through a secure channel.",
        activationPath: result.invitation.activationPath
      });
    } catch (error) {
      setActionState({ kind: "error", message: error instanceof Error ? error.message : "Invitation failed." });
    }
  }

  async function runAccountAction(userId: string, action: "suspend" | "reactivate" | "revoke_sessions") {
    setBusyUserId(userId);
    setActionState({ kind: "working", message: "Applying the account change…" });
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, userId })
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Account action failed.");
      await refreshDirectory();
      setActionState({ kind: "success", message: "Account access was updated and recorded in the audit log." });
    } catch (error) {
      setActionState({ kind: "error", message: error instanceof Error ? error.message : "Account action failed." });
    } finally {
      setBusyUserId(null);
    }
  }

  async function runOperationsAction(input: { userId: string; action: "assign_operations" | "revoke_operations"; role?: string; locationIds?: string[] }) {
    setBusyUserId(input.userId);
    setActionState({ kind: "working", message: "Synchronizing Operations access…" });
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      const result = await response.json() as { ok?: boolean; error?: string; operationsAccess?: { outcome?: string } };
      if (!response.ok || !result.ok) throw new Error(result.error || "Operations access could not be updated.");
      await refreshDirectory();
      const unavailable = result.operationsAccess?.outcome === "unavailable";
      setActionState({
        kind: unavailable ? "error" : "success",
        message: unavailable
          ? "Operations has no confirmed user-management contract yet. The request is recorded as unavailable, not active."
          : `Operations access returned ${result.operationsAccess?.outcome ?? "a confirmed state"}.`
      });
    } catch (error) {
      setActionState({ kind: "error", message: error instanceof Error ? error.message : "Operations access could not be updated." });
    } finally {
      setBusyUserId(null);
    }
  }

  async function runAdminAccessAction(input: { userId: string; role: string; locationScopeMode: "ALL" | "LOCATIONS"; locationIds: string[] }) {
    setBusyUserId(input.userId);
    setActionState({ kind: "working", message: "Updating Store Admin access…" });
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update_admin_access", ...input })
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Store Admin access could not be updated.");
      await refreshDirectory();
      setActionState({ kind: "success", message: "Store Admin role and location scope were updated. Existing sessions were revoked." });
    } catch (error) {
      setActionState({ kind: "error", message: error instanceof Error ? error.message : "Store Admin access could not be updated." });
    } finally {
      setBusyUserId(null);
    }
  }

  const metrics = [
    {
      icon: <UsersRound aria-hidden="true" size={16} strokeWidth={1.8} />,
      label: "Active users",
      value: directory.available ? counts.active : "—",
      note: directory.available ? `${directory.users.length} total identities` : "Waiting for identity service"
    },
    {
      icon: <Clock3 aria-hidden="true" size={16} strokeWidth={1.8} />,
      label: "Pending invitations",
      value: directory.available ? counts.invited : "—",
      note: directory.available ? "Activation required" : "Invitations unavailable"
    },
    {
      icon: <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.8} />,
      label: "MFA coverage",
      value: directory.available ? `${counts.mfaCoverage}%` : "—",
      note: directory.available ? `${counts.mfa} of ${counts.active} active users` : "Security status unavailable"
    },
    {
      icon: <KeyRound aria-hidden="true" size={16} strokeWidth={1.8} />,
      label: "Operations access",
      value: directory.available ? counts.operations : "—",
      note: directory.available ? "Confirmed by Operations" : "Sync status unavailable"
    }
  ];

  return (
    <main className="admin-page pb-16">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Access &amp; security</p>
          <h1 className="admin-page-title">Users &amp; roles</h1>
          <p className="admin-lede">
            Invite teammates, assign least-privilege roles, scope locations, and review account security from one directory.
          </p>
        </div>
        <div className="admin-page-header-actions items-center">
          <ConnectionBadge available={directory.available} />
          {canManageAdmin ? (
            <button
              className="admin-button"
              disabled={!directory.available}
              onClick={() => setInviteOpen(true)}
              type="button"
            >
              <Plus aria-hidden="true" size={16} />
              Invite user
            </button>
          ) : null}
        </div>
      </header>

      <section aria-label="Identity overview" className="admin-metric-grid">
        {metrics.map((metric) => <Metric key={metric.label} {...metric} />)}
      </section>

      {actionState.kind !== "idle" ? (
        <section
          className={`mt-4 flex items-start justify-between gap-4 border px-4 py-3 text-sm ${
            actionState.kind === "error"
              ? "border-red-200 bg-red-50 text-red-900"
              : actionState.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                : "border-border bg-surface-muted text-secondary"
          }`}
          role="status"
        >
          <div className="min-w-0">
            <p className="font-semibold">{actionState.message}</p>
            {actionState.activationPath ? (
              <code className="mt-2 block break-all rounded bg-white/70 p-2 text-xs">
                {`${windowOrigin()}${actionState.activationPath}`}
              </code>
            ) : null}
          </div>
          {actionState.kind !== "working" ? (
            <button aria-label="Dismiss message" className="shrink-0" onClick={() => setActionState({ kind: "idle", message: "" })} type="button">
              <X aria-hidden="true" size={16} />
            </button>
          ) : null}
        </section>
      ) : null}

      {!directory.available ? (
        <UnavailableDirectory reason={directory.reason} />
      ) : (
        <section className="admin-panel mt-6 overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-border px-5 pt-5 sm:px-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <h2 className="admin-section-heading">Access directory</h2>
                <p className="admin-section-note">Store Admin roles and Operations roles stay separate and auditable.</p>
              </div>
              <span className="text-xs font-medium text-secondary">{directory.users.length} identities · {directory.roles.length} roles</span>
            </div>
            <div aria-label="Directory views" className="flex gap-6" role="tablist">
              <TabButton active={view === "users"} onClick={() => setView("users")}>Users</TabButton>
              <TabButton active={view === "roles"} onClick={() => setView("roles")}>Roles &amp; permissions</TabButton>
            </div>
          </div>

          {view === "users" ? (
            <UsersDirectory
              directory={directory}
              filteredUsers={filteredUsers}
              onManage={setSelectedUserId}
              query={query}
              roleFilter={roleFilter}
              setQuery={setQuery}
              setRoleFilter={setRoleFilter}
              setStatusFilter={setStatusFilter}
              statusFilter={statusFilter}
            />
          ) : (
            <RolesDirectory directory={directory} />
          )}
        </section>
      )}

      {inviteOpen ? (
        <InviteUserDrawer
          actionState={actionState}
          directory={directory}
          locationScopeMode={locationScopeMode}
          onClose={() => setInviteOpen(false)}
          onInvite={invite}
          setLocationScopeMode={setLocationScopeMode}
        />
      ) : null}

      {selectedUser ? (
        <ManageUserDrawer
          canManageAdmin={canManageAdmin}
          canManageOperations={canManageOperations}
          directory={directory}
          disabled={busyUserId === selectedUser.id}
          key={selectedUser.id}
          onAccountAction={runAccountAction}
          onAdminAccessAction={runAdminAccessAction}
          onClose={() => setSelectedUserId(null)}
          onOperationsAction={runOperationsAction}
          user={selectedUser}
        />
      ) : null}
    </main>
  );
}

function ConnectionBadge({ available }: { available: boolean }) {
  return (
    <span className={`inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-xs font-semibold ${
      available ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"
    }`}>
      {available ? <Database aria-hidden="true" size={15} /> : <WifiOff aria-hidden="true" size={15} />}
      {available ? "Identity connected" : "Identity unavailable"}
    </span>
  );
}

function Metric({ icon, label, note, value }: { icon: ReactNode; label: string; note: string; value: string | number }) {
  return (
    <article className="admin-metric-card">
      <p className="admin-metric-label">{icon}{label}</p>
      <strong className="admin-metric-value block">{value}</strong>
      <span className="mt-1 block text-[11px] leading-5 text-secondary">{note}</span>
    </article>
  );
}

function UnavailableDirectory({ reason }: { reason?: AdminIdentityDirectory["reason"] }) {
  const notConfigured = reason === "DATABASE_NOT_CONFIGURED";
  return (
    <section className="admin-panel mt-6 overflow-hidden">
      <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:p-8">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-800">
            <AlertTriangle aria-hidden="true" size={20} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">Protected state</p>
            <h2 className="mt-2 text-xl font-semibold text-primary">Identity workspace unavailable</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-secondary">
              {notConfigured
                ? "The application has no identity database configuration in this environment."
                : "The application could not reach the identity database."} Users, roles, MFA state, and Operations access stay hidden until a verified connection is restored.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button className="admin-button-secondary" onClick={() => window.location.reload()} type="button">
                <RefreshCw aria-hidden="true" size={15} />
                Retry connection
              </button>
            </div>
          </div>
        </div>
        <div className="border border-border bg-surface-muted p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary">To restore access</p>
          <ol className="mt-4 grid gap-4 text-sm text-primary">
            <RecoveryStep index="01">Deploy the Admin identity migration.</RecoveryStep>
            <RecoveryStep index="02">Verify the application database connection.</RecoveryStep>
            <RecoveryStep index="03">Reload this directory and confirm the connected badge.</RecoveryStep>
          </ol>
          <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-secondary">
            No local identities, role assignments, or access confirmations have been simulated.
          </p>
        </div>
      </div>
    </section>
  );
}

function RecoveryStep({ children, index }: { children: ReactNode; index: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="font-mono text-[11px] font-semibold text-secondary">{index}</span>
      <span className="leading-5">{children}</span>
    </li>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      aria-selected={active}
      className={`border-b-2 pb-3 text-sm font-semibold transition-colors ${active ? "border-primary text-primary" : "border-transparent text-secondary hover:text-primary"}`}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {children}
    </button>
  );
}

function UsersDirectory({
  directory,
  filteredUsers,
  onManage,
  query,
  roleFilter,
  setQuery,
  setRoleFilter,
  setStatusFilter,
  statusFilter
}: {
  directory: AdminIdentityDirectory;
  filteredUsers: AdminUser[];
  onManage: (userId: string) => void;
  query: string;
  roleFilter: string;
  setQuery: (value: string) => void;
  setRoleFilter: (value: string) => void;
  setStatusFilter: (value: string) => void;
  statusFilter: string;
}) {
  return (
    <div role="tabpanel">
      <div className="grid gap-3 border-b border-border bg-surface-muted/40 p-4 sm:grid-cols-[minmax(15rem,1fr)_12rem_11rem_auto] sm:items-center sm:px-6">
        <label className="relative block">
          <span className="sr-only">Search users</span>
          <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={16} />
          <input
            className="admin-form-control w-full pl-10 pr-3"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, or role"
            type="search"
            value={query}
          />
        </label>
        <label>
          <span className="sr-only">Filter by role</span>
          <select className="admin-form-control w-full px-3" onChange={(event) => setRoleFilter(event.target.value)} value={roleFilter}>
            <option value="ALL">All roles</option>
            {directory.roles.map((role) => <option key={role} value={role}>{roleLabels[role] ?? role}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by status</span>
          <select className="admin-form-control w-full px-3" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INVITED">Invited</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="DISABLED">Disabled</option>
          </select>
        </label>
        <span className="text-right text-xs font-medium text-secondary">{filteredUsers.length} shown</span>
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="border-b border-border bg-white text-[11px] font-semibold uppercase tracking-[0.08em] text-secondary">
            <tr>
              <th className="px-6 py-3.5">User</th>
              <th className="px-4 py-3.5">Store Admin</th>
              <th className="px-4 py-3.5">Location scope</th>
              <th className="px-4 py-3.5">Operations</th>
              <th className="px-4 py-3.5">Security</th>
              <th className="px-4 py-3.5">Last active</th>
              <th className="px-6 py-3.5 text-right">Access</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredUsers.map((user) => (
              <tr className="transition-colors hover:bg-surface-muted/50" key={user.id}>
                <td className="px-6 py-4"><UserIdentity user={user} /></td>
                <td className="px-4 py-4">
                  <span className="block font-semibold text-primary">{roleLabels[user.role] ?? user.role}</span>
                  <StatusPill value={user.status} />
                </td>
                <td className="max-w-52 px-4 py-4 text-secondary"><LocationScope user={user} /></td>
                <td className="px-4 py-4">
                  <span className="block font-medium text-primary">{user.operationsRole ? operationsRoleLabels[user.operationsRole] ?? user.operationsRole : "No access"}</span>
                  <StatusPill value={user.operationsAccessStatus} />
                </td>
                <td className="px-4 py-4"><SecurityState user={user} /></td>
                <td className="px-4 py-4 text-xs text-secondary">{user.lastLoginAt ? formatDate(user.lastLoginAt) : "Never"}</td>
                <td className="px-6 py-4 text-right">
                  <button className="admin-button-secondary min-h-9 px-3 py-1.5 text-xs" onClick={() => onManage(user.id)} type="button">
                    Manage
                    <ArrowRight aria-hidden="true" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-border lg:hidden">
        {filteredUsers.map((user) => (
          <article className="p-5" key={user.id}>
            <div className="flex items-start justify-between gap-3">
              <UserIdentity user={user} />
              <StatusPill value={user.status} />
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 text-xs">
              <MobileFact label="Store Admin"><span className="font-semibold text-primary">{roleLabels[user.role] ?? user.role}</span></MobileFact>
              <MobileFact label="Security"><SecurityState user={user} /></MobileFact>
              <MobileFact label="Scope"><LocationScope user={user} /></MobileFact>
              <MobileFact label="Operations"><span className="text-primary">{user.operationsRole ? operationsRoleLabels[user.operationsRole] ?? user.operationsRole : "No access"}</span></MobileFact>
            </dl>
            <button className="admin-button-secondary mt-5 w-full" onClick={() => onManage(user.id)} type="button">
              Manage access
              <ArrowRight aria-hidden="true" size={14} />
            </button>
          </article>
        ))}
      </div>

      {filteredUsers.length === 0 ? (
        <div className="grid min-h-64 place-items-center p-8 text-center">
          <div>
            <Search aria-hidden="true" className="mx-auto text-secondary" size={24} strokeWidth={1.5} />
            <h3 className="mt-3 font-semibold text-primary">No matching users</h3>
            <p className="mt-1 text-sm text-secondary">Try another search or clear a filter.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UserIdentity({ user }: { user: AdminUser }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-surface-muted text-xs font-bold text-primary">
        {initialsFor(user)}
      </span>
      <div className="min-w-0">
        <strong className="block truncate text-sm text-primary">{user.displayName || user.email}</strong>
        <span className="mt-0.5 block truncate text-xs text-secondary">{user.email}</span>
      </div>
    </div>
  );
}

function MobileFact({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">{label}</dt>
      <dd className="leading-5 text-secondary">{children}</dd>
    </div>
  );
}

function LocationScope({ user }: { user: AdminUser }) {
  return (
    <span className="inline-flex items-start gap-1.5 text-xs leading-5">
      <MapPin aria-hidden="true" className="mt-0.5 shrink-0" size={13} />
      {user.locationScopeMode === "ALL" ? "All locations" : user.locations.map((location) => location.name).join(", ") || "No location"}
    </span>
  );
}

function SecurityState({ user }: { user: AdminUser }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${user.mfaEnabled ? "text-emerald-800" : "text-amber-800"}`}>
      {user.mfaEnabled ? <Check aria-hidden="true" size={13} /> : <LockKeyhole aria-hidden="true" size={13} />}
      {user.mfaEnabled ? "MFA enabled" : "MFA pending"}
    </span>
  );
}

function RolesDirectory({ directory }: { directory: AdminIdentityDirectory }) {
  return (
    <div className="p-5 sm:p-6" role="tabpanel">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-5 sm:flex-row sm:items-center">
        <div>
          <h3 className="font-semibold text-primary">System roles</h3>
          <p className="mt-1 text-sm text-secondary">Fixed permission bundles keep access predictable and reviewable.</p>
        </div>
        <span className="inline-flex items-center gap-2 text-xs font-medium text-secondary">
          <ShieldCheck aria-hidden="true" size={15} />
          Changes require Owner access
        </span>
      </div>
      <div className="divide-y divide-border">
        {directory.roles.map((role) => {
          const detail = roleDetails[role] ?? { description: "Configured Store Admin permission bundle.", areas: [] };
          const users = directory.users.filter((user) => user.role === role);
          const activeUsers = users.filter((user) => user.status === "ACTIVE").length;
          return (
            <article className="grid gap-4 py-5 md:grid-cols-[minmax(13rem,0.65fr)_minmax(18rem,1fr)_minmax(15rem,0.8fr)_8rem] md:items-center" key={role}>
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-surface-muted text-secondary">
                  {role === "OWNER" ? <KeyRound aria-hidden="true" size={16} /> : <ShieldCheck aria-hidden="true" size={16} />}
                </span>
                <div>
                  <h4 className="font-semibold text-primary">{roleLabels[role] ?? role}</h4>
                  <span className="mt-0.5 block font-mono text-[10px] text-secondary">{role.toLowerCase()}</span>
                </div>
              </div>
              <p className="text-sm leading-6 text-secondary">{detail.description}</p>
              <div className="flex flex-wrap gap-1.5">
                {detail.areas.map((area) => <span className="rounded-full border border-border bg-surface-muted px-2.5 py-1 text-[10px] font-semibold text-secondary" key={area}>{area}</span>)}
              </div>
              <div className="md:text-right">
                <strong className="block text-sm text-primary">{users.length} {users.length === 1 ? "user" : "users"}</strong>
                <span className="mt-0.5 block text-[11px] text-secondary">{activeUsers} active</span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function InviteUserDrawer({
  actionState,
  directory,
  locationScopeMode,
  onClose,
  onInvite,
  setLocationScopeMode
}: {
  actionState: ActionState;
  directory: AdminIdentityDirectory;
  locationScopeMode: "ALL" | "LOCATIONS";
  onClose: () => void;
  onInvite: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  setLocationScopeMode: (value: "ALL" | "LOCATIONS") => void;
}) {
  return (
    <DrawerShell onClose={onClose} title="Invite a user">
      <form className="flex min-h-full flex-col" onSubmit={onInvite}>
        <div className="flex-1 p-6">
          <p className="text-sm leading-6 text-secondary">Create a protected invitation and define access before the teammate signs in.</p>
          <div className="mt-6 grid gap-5">
            <Field label="Name" optional><input className="admin-form-control w-full px-3" maxLength={160} name="displayName" placeholder="Full name" /></Field>
            <Field label="Work email"><input autoComplete="email" className="admin-form-control w-full px-3" maxLength={254} name="email" placeholder="name@example.com" required type="email" /></Field>
            <Field label="Store Admin role">
              <select className="admin-form-control w-full px-3" defaultValue="MANAGER" name="role">
                {directory.roles.map((role) => <option key={role} value={role}>{roleLabels[role] ?? role}</option>)}
              </select>
            </Field>
            <Field label="Location scope">
              <select className="admin-form-control w-full px-3" onChange={(event) => setLocationScopeMode(event.target.value as "ALL" | "LOCATIONS")} value={locationScopeMode}>
                <option value="ALL">All locations</option>
                <option value="LOCATIONS">Selected locations</option>
              </select>
            </Field>
            {locationScopeMode === "LOCATIONS" ? (
              <fieldset className="grid gap-2 border border-border p-4">
                <legend className="px-1 text-xs font-semibold text-secondary">Allowed locations</legend>
                {directory.locations.map((location) => (
                  <label className="flex items-center gap-2 text-sm" key={location.id}>
                    <input className="size-4" name="locationIds" type="checkbox" value={location.id} />
                    {location.name}
                  </label>
                ))}
              </fieldset>
            ) : null}
            <div className="flex items-start gap-3 border border-border bg-surface-muted p-4 text-xs leading-5 text-secondary">
              <LockKeyhole aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
              <p>The invitation expires after 72 hours. MFA enrollment is completed during protected account activation.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-border p-5">
          <button className="admin-button-secondary" onClick={onClose} type="button">Cancel</button>
          <button className="admin-button" disabled={actionState.kind === "working"} type="submit">
            {actionState.kind === "working" ? "Creating invitation…" : "Create invitation"}
          </button>
        </div>
      </form>
    </DrawerShell>
  );
}

function ManageUserDrawer({
  canManageAdmin,
  canManageOperations,
  directory,
  disabled,
  onAccountAction,
  onAdminAccessAction,
  onClose,
  onOperationsAction,
  user
}: {
  canManageAdmin: boolean;
  canManageOperations: boolean;
  directory: AdminIdentityDirectory;
  disabled: boolean;
  onAccountAction: (userId: string, action: "suspend" | "reactivate" | "revoke_sessions") => Promise<void>;
  onAdminAccessAction: (input: { userId: string; role: string; locationScopeMode: "ALL" | "LOCATIONS"; locationIds: string[] }) => Promise<void>;
  onClose: () => void;
  onOperationsAction: (input: { userId: string; action: "assign_operations" | "revoke_operations"; role?: string; locationIds?: string[] }) => Promise<void>;
  user: AdminUser;
}) {
  return (
    <DrawerShell onClose={onClose} title="Manage access">
      <div className="border-b border-border p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full border border-border bg-surface-muted text-sm font-bold text-primary">{initialsFor(user)}</span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold text-primary">{user.displayName || user.email}</h3>
            <p className="truncate text-sm text-secondary">{user.email}</p>
          </div>
          <StatusPill value={user.status} />
        </div>
      </div>
      <div className="divide-y divide-border">
        <DrawerSection description="Role and store-level location boundary." title="Store Admin access">
          {canManageAdmin && user.status !== "INVITED" ? (
            <AdminAccessEditor disabled={disabled} locations={directory.locations} onAction={onAdminAccessAction} roles={directory.roles} user={user} />
          ) : (
            <ReadOnlyAccessRow label={roleLabels[user.role] ?? user.role} note={user.status === "INVITED" ? "Re-invite this user to change pending access." : "Owner access is required to edit this role."} />
          )}
        </DrawerSection>

        <DrawerSection description="Separately confirmed access to operation.modernstate.com." title="Operations access">
          {canManageOperations ? (
            <OperationsAccessEditor disabled={disabled} locations={directory.locations} onAction={onOperationsAction} user={user} />
          ) : (
            <ReadOnlyAccessRow label={user.operationsRole ? operationsRoleLabels[user.operationsRole] ?? user.operationsRole : "No Operations role"} note="Operations assignment permission is required to edit this access." />
          )}
        </DrawerSection>

        <DrawerSection description="Authentication posture and current sessions." title="Security & sessions">
          <div className="grid gap-3 sm:grid-cols-2">
            <SecurityFact icon={<ShieldCheck aria-hidden="true" size={16} />} label="Multi-factor authentication" value={user.mfaEnabled ? "Enabled" : "Pending"} />
            <SecurityFact icon={<Clock3 aria-hidden="true" size={16} />} label="Last active" value={user.lastLoginAt ? formatDate(user.lastLoginAt) : "Never signed in"} />
          </div>
          {user.status !== "INVITED" ? (
            <button className="admin-button-secondary mt-4 w-full" disabled={disabled} onClick={() => onAccountAction(user.id, "revoke_sessions")} type="button">
              <KeyRound aria-hidden="true" size={15} />
              Revoke all sessions
            </button>
          ) : null}
        </DrawerSection>

        {canManageAdmin && user.status !== "INVITED" ? (
          <DrawerSection description="Changes take effect immediately and are written to the audit log." title="Account status">
            {user.status === "ACTIVE" ? (
              <button className="w-full border border-red-200 px-4 py-3 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50" disabled={disabled} onClick={() => onAccountAction(user.id, "suspend")} type="button">Suspend account</button>
            ) : user.status === "SUSPENDED" ? (
              <button className="admin-button w-full" disabled={disabled} onClick={() => onAccountAction(user.id, "reactivate")} type="button">Reactivate account</button>
            ) : null}
          </DrawerSection>
        ) : null}
      </div>
    </DrawerShell>
  );
}

function DrawerShell({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return (
    <div aria-modal="true" className="fixed inset-0 z-[90] flex justify-end" role="dialog">
      <button aria-label={`Close ${title}`} className="absolute inset-0 bg-slate-950/25" onClick={onClose} type="button" />
      <section className="relative flex h-full w-full max-w-[34rem] flex-col overflow-y-auto bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white px-6 py-4">
          <h2 className="text-lg font-semibold text-primary">{title}</h2>
          <button aria-label={`Close ${title}`} className="admin-icon-button" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button>
        </header>
        <div className="flex-1">{children}</div>
      </section>
    </div>
  );
}

function DrawerSection({ children, description, title }: { children: ReactNode; description: string; title: string }) {
  return (
    <section className="p-6">
      <h3 className="font-semibold text-primary">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-secondary">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ReadOnlyAccessRow({ label, note }: { label: string; note: string }) {
  return (
    <div className="border border-border bg-surface-muted p-4">
      <strong className="text-sm text-primary">{label}</strong>
      <p className="mt-1 text-xs leading-5 text-secondary">{note}</p>
    </div>
  );
}

function SecurityFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="border border-border p-4">
      <span className="text-secondary">{icon}</span>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">{label}</p>
      <strong className="mt-1 block text-xs leading-5 text-primary">{value}</strong>
    </div>
  );
}

function Field({ children, label, optional = false }: { children: ReactNode; label: string; optional?: boolean }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-primary">
      <span className="flex items-center justify-between">
        {label}
        {optional ? <small className="text-[10px] font-medium uppercase tracking-[0.08em] text-secondary">Optional</small> : null}
      </span>
      {children}
    </label>
  );
}

function StatusPill({ value }: { value: string }) {
  const positive = value === "ACTIVE";
  const caution = value === "INVITED" || value === "PENDING" || value === "REVOKING" || value === "UNAVAILABLE";
  const danger = value === "SUSPENDED" || value === "DISABLED" || value === "ERROR";
  return (
    <span className={`mt-1.5 inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.05em] ${
      positive
        ? "bg-emerald-50 text-emerald-800"
        : caution
          ? "bg-amber-50 text-amber-900"
          : danger
            ? "bg-red-50 text-red-800"
            : "bg-slate-100 text-slate-700"
    }`}>
      <span aria-hidden="true" className="size-1 rounded-full bg-current" />
      {value.toLowerCase().replaceAll("_", " ")}
    </span>
  );
}

function OperationsAccessEditor({ disabled, locations, onAction, user }: {
  disabled: boolean;
  locations: AdminIdentityDirectory["locations"];
  onAction: (input: { userId: string; action: "assign_operations" | "revoke_operations"; role?: string; locationIds?: string[] }) => Promise<void>;
  user: AdminUser;
}) {
  const [role, setRole] = useState(user.operationsRole || "STORE_STAFF");
  const [locationIds, setLocationIds] = useState<string[]>(user.operationsLocationIds);
  return (
    <div className="grid gap-4">
      <Field label="Operations role">
        <select className="admin-form-control w-full px-3" onChange={(event) => setRole(event.target.value)} value={role}>
          {Object.entries(operationsRoleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </Field>
      <Field label="Operations locations">
        <select className="admin-form-control min-h-28 w-full px-3 py-2" multiple onChange={(event) => setLocationIds(Array.from(event.target.selectedOptions, (option) => option.value))} value={locationIds}>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
      </Field>
      <button className="admin-button w-full" disabled={disabled || locationIds.length === 0} onClick={() => onAction({ userId: user.id, action: "assign_operations", role, locationIds })} type="button">Synchronize access</button>
      {user.operationsAccessStatus !== "NONE" ? (
        <button className="admin-button-secondary w-full" disabled={disabled} onClick={() => onAction({ userId: user.id, action: "revoke_operations" })} type="button">Revoke Operations access</button>
      ) : null}
    </div>
  );
}

function AdminAccessEditor({ disabled, locations, onAction, roles, user }: {
  disabled: boolean;
  locations: AdminIdentityDirectory["locations"];
  onAction: (input: { userId: string; role: string; locationScopeMode: "ALL" | "LOCATIONS"; locationIds: string[] }) => Promise<void>;
  roles: readonly string[];
  user: AdminUser;
}) {
  const [role, setRole] = useState(user.role);
  const [scopeMode, setScopeMode] = useState<"ALL" | "LOCATIONS">(user.locationScopeMode);
  const [locationIds, setLocationIds] = useState(user.locations.map((location) => location.id));
  return (
    <div className="grid gap-4">
      <Field label="Store Admin role">
        <select className="admin-form-control w-full px-3" onChange={(event) => setRole(event.target.value)} value={role}>
          {roles.map((value) => <option key={value} value={value}>{roleLabels[value] ?? value}</option>)}
        </select>
      </Field>
      <Field label="Location scope">
        <select className="admin-form-control w-full px-3" onChange={(event) => setScopeMode(event.target.value as "ALL" | "LOCATIONS")} value={scopeMode}>
          <option value="ALL">All locations</option>
          <option value="LOCATIONS">Selected locations</option>
        </select>
      </Field>
      {scopeMode === "LOCATIONS" ? (
        <Field label="Allowed locations">
          <select className="admin-form-control min-h-28 w-full px-3 py-2" multiple onChange={(event) => setLocationIds(Array.from(event.target.selectedOptions, (option) => option.value))} value={locationIds}>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </Field>
      ) : null}
      <button className="admin-button w-full" disabled={disabled || (scopeMode === "LOCATIONS" && locationIds.length === 0)} onClick={() => onAction({ userId: user.id, role, locationScopeMode: scopeMode, locationIds: scopeMode === "ALL" ? [] : locationIds })} type="button">Save Store Admin access</button>
    </div>
  );
}

function initialsFor(user: AdminUser) {
  const source = user.displayName?.trim() || user.email.split("@")[0] || "?";
  return source.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function windowOrigin() {
  return typeof window === "undefined" ? "" : window.location.origin;
}
