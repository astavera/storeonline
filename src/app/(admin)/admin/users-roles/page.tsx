/** Real Store Admin identity, role, MFA, scope, and Operations access surface. */

import { AdminUsersRolesManager } from "@/components/admin/admin-users-roles-manager";
import { requireAdminSession } from "@/server/admin/admin-session";
import { readAdminIdentityDirectory } from "@/server/admin/identity/admin-user-service";

export default async function AdminUsersRolesPage() {
  const session = await requireAdminSession({ capability: "users:read", returnTo: "/admin/users-roles" });
  const directory = await readAdminIdentityDirectory();

  const wildcard = session.capabilities.includes("admin:*");
  return (
    <AdminUsersRolesManager
      canManageAdmin={wildcard || session.capabilities.includes("users:admin-role.assign")}
      canManageOperations={wildcard || session.capabilities.includes("operations-access:assign")}
      initialDirectory={directory}
    />
  );
}
