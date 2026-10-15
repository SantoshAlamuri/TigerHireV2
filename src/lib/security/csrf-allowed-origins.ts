/**
 * Shared CSRF origin allowlist helpers (middleware + API routes).
 * Keeps www / non-www and host:port variants in sync across checks.
 */
export function addOriginVariants(allowed: Set<string>, rawOrigin: string): void {
  allowed.add(rawOrigin);
  try {
    const parsed = new URL(rawOrigin);
    const { protocol, hostname, port } = parsed;
    const hostWithPort = port ? `${hostname}:${port}` : hostname;
    const withWwwHost = hostname.startsWith("www.") ? hostname.slice(4) : `www.${hostname}`;
    const withWwwHostAndPort = port ? `${withWwwHost}:${port}` : withWwwHost;

    allowed.add(`${protocol}//${hostWithPort}`);
    allowed.add(`${protocol}//${withWwwHostAndPort}`);
  } catch {
    // Ignore malformed origins and keep default origin only.
  }
}
