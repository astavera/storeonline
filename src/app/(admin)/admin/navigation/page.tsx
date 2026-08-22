import { redirect } from "next/navigation";

export default function AdminNavigationPage() {
  redirect("/admin/storefront-pages?tab=navigation");
}
