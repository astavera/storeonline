import { AdminNotificationsManager } from "@/components/admin/admin-notifications-manager";
import { requireAdminSession } from "@/server/admin/admin-session";
import { readAdminNotificationWorkspace } from "@/server/admin/admin-notification-service";

export default async function AdminNotificationsPage() {
  const session = await requireAdminSession({ capability: "notifications:read", returnTo: "/admin/notifications" });
  const initial = await readAdminNotificationWorkspace();
  return <AdminNotificationsManager canTest={session.capabilities.includes("admin:*") || session.capabilities.includes("notifications:test-send")} initial={initial} />;
}
