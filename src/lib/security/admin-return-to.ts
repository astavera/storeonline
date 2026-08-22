/**
 * Provides shared admin return to types and utilities for the application.
 */

const fallbackAdminPath = "/admin";
const validationOrigin = "https://admin-redirect.invalid";
const maximumDecodePasses = 2;

export function getSafeInternalRedirect(value?: string, fallback = fallbackAdminPath) {
  if (!isSafeAdminPath(fallback)) return fallbackAdminPath;
  if (!value || value !== value.trim()) return fallback;

  let candidate = value;
  for (let pass = 0; pass <= maximumDecodePasses; pass += 1) {
    if (!isSafeAdminPath(candidate)) return fallback;

    let decoded: string;
    try {
      decoded = decodeURIComponent(candidate);
    } catch {
      return fallback;
    }
    if (decoded === candidate) return value;
    candidate = decoded;
  }

  return isSafeAdminPath(candidate) ? value : fallback;
}

export function safeAdminReturnTo(value?: string) {
  return getSafeInternalRedirect(value);
}

function isSafeAdminPath(value: string) {
  if (
    !value.startsWith("/")
    || value.startsWith("//")
    || /[\\\u0000-\u001F\u007F]/u.test(value)
    || !/^\/admin(?:[/?#]|$)/u.test(value)
    || /^\/admin\/login(?:[/?#]|$)/u.test(value)
  ) {
    return false;
  }

  try {
    const parsed = new URL(value, validationOrigin);
    return parsed.origin === validationOrigin
      && /^\/admin(?:\/|$)/u.test(parsed.pathname)
      && !/^\/admin\/login(?:\/|$)/u.test(parsed.pathname);
  } catch {
    return false;
  }
}
