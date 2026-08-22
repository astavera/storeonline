/** Compatibility redirect for the consolidated Orders and Returns workspace. */

import { redirect } from "next/navigation";

type LegacyReturnsQuery = {
  q?: string;
  status?: string;
  page?: string;
};

export default async function AdminReturnsPage({ searchParams }: { searchParams?: Promise<LegacyReturnsQuery> }) {
  const params = await searchParams;
  const query = new URLSearchParams({ tab: "returns" });

  if (params?.q) query.set("q", params.q);
  if (params?.status) query.set("status", params.status);
  if (params?.page) query.set("page", params.page);

  redirect(`/admin/orders?${query}`);
}
