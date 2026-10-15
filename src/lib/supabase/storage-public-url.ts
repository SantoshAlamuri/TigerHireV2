import { env } from "@/lib/config/env";

/** True when next.config rewrites `/storage/*` (and auth/rest) to the real Supabase project. */
export function isSupabaseStorageProxyConfigured(): boolean {
  return Boolean(process.env.SUPABASE_INTERNAL_URL?.trim());
}

/**
 * Origin recruiters/candidates should see for proxied storage links.
 * Returns null when no proxy is configured — callers must keep the raw Supabase URL.
 */
export function getBrowserStorageOrigin(): string | null {
  if (!isSupabaseStorageProxyConfigured()) return null;

  const publicSupabase = env.supabaseUrl.replace(/\/$/, "");
  try {
    const host = new URL(publicSupabase).hostname;
    if (!host.endsWith(".supabase.co")) {
      return new URL(publicSupabase).origin;
    }
  } catch {
    /* fall through */
  }
  return env.baseUrl;
}

/**
 * Rewrite a Supabase Storage URL (public or signed) to the browser-facing origin.
 * Only rewrites when `SUPABASE_INTERNAL_URL` is set so next.config can proxy `/storage/*`.
 * Without the proxy, rewriting to tigerhire.io would 404 — keep the working Supabase URL.
 * Server-side fetches should keep using SUPABASE_INTERNAL_URL; only use this for client links.
 */
export function toBrowserFacingStorageUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;

  const browserOrigin = getBrowserStorageOrigin();
  if (!browserOrigin) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (!parsed.pathname.includes("/storage/")) return trimmed;

    const internalRaw = process.env.SUPABASE_INTERNAL_URL?.trim().replace(/\/$/, "");
    const internalOrigin = internalRaw ? new URL(internalRaw).origin : null;
    const isInternalSupabaseHost =
      parsed.hostname.endsWith(".supabase.co") ||
      (internalOrigin != null && parsed.origin === internalOrigin);

    if (!isInternalSupabaseHost) return trimmed;

    return `${browserOrigin}${parsed.pathname}${parsed.search}`;
  } catch {
    return trimmed;
  }
}
