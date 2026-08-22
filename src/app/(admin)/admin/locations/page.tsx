/** Retires the duplicate location editor in favor of Store settings. */

import { redirect } from "next/navigation";

export default function AdminLocationsPage() {
  redirect("/admin/settings?area=locations");
}
