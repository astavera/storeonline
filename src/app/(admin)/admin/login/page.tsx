import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { isAdminLoginConfigured } from "@/server/admin/admin-login";

export default async function AdminLoginPage({ searchParams }: { searchParams?: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const returnTo = safeAdminReturnTo(params?.next);

  return (
    <main className="grid min-h-screen place-items-center bg-surface-muted p-5">
      <section className="w-full max-w-md rounded-xl border border-border bg-surface p-7 shadow-sm sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">Modern State</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-primary">Admin login</h1>
        <p className="mb-7 mt-2 text-sm text-secondary">Sign in to manage the website and catalog.</p>
        <AdminLoginForm configured={isAdminLoginConfigured()} returnTo={returnTo} />
      </section>
    </main>
  );
}

function safeAdminReturnTo(value?: string) {
  if (!value || !value.startsWith("/admin") || value.startsWith("/admin/login") || value.startsWith("//")) return "/admin";
  return value;
}
