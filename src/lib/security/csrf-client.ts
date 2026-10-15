import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/security/csrf-constants";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const encoded = encodeURIComponent(name);
  const parts = document.cookie.split(";");
  for (const part of parts) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === encoded || rawKey === name) {
      return decodeURIComponent(rest.join("=") || "");
    }
  }
  return null;
}

/**
 * Fetches/refreshes CSRF token cookie and returns header payload for double-submit.
 */
export async function buildCsrfHeaders(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};

  await fetch("/api/auth/csrf-token", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  }).catch(() => null);

  const token = readCookie(CSRF_COOKIE_NAME);
  if (!token) return {};
  return { [CSRF_HEADER_NAME]: token };
}
