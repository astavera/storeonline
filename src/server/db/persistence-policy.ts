export class PersistenceUnavailableError extends Error {
  readonly code = "PERSISTENCE_UNAVAILABLE";
  readonly domain: string;

  constructor(domain: string, options?: { cause?: unknown }) {
    super(`${domain} persistence is unavailable. The operation was not saved.`, options);
    this.name = "PersistenceUnavailableError";
    this.domain = domain;
  }
}

export function isDevelopmentLocalPersistenceEnabled() {
  return process.env.NODE_ENV === "development" && process.env.ALLOW_LOCAL_PERSISTENCE_FALLBACK === "true";
}

export function requireDatabaseOrDevelopmentFallback(domain: string) {
  if (process.env.DATABASE_URL) return "database" as const;
  if (isDevelopmentLocalPersistenceEnabled()) return "development-local" as const;
  throw new PersistenceUnavailableError(domain);
}
