export function safeAdminReturnTo(value?: string) {
  if (!value || !value.startsWith("/admin") || value.startsWith("/admin/login") || value.startsWith("//")) {
    return "/admin";
  }

  return value;
}
