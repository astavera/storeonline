import { redirect } from "next/navigation";

export default function AdminMediaPage() {
  redirect("/admin/storefront-pages?tab=media");
}
