/**
 * Single place for Supabase auth cookie options.
 * Used by middleware, server client, and proxy so cookies are set consistently
 * (no strict or ambiguous options that can break auth in some environments).
 */
const isProduction = process.env.NODE_ENV === "production";

/** Default maxAge (7 days) so cookies are persistent when fallbacks are used (e.g. proxy copy without getSetCookie). */
const DEFAULT_MAX_AGE = 60 * 60 * 24 * 7;

export const SUPABASE_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  secure: isProduction,
  // httpOnly must be false — Supabase SSR's browser client reads auth cookies
  // via document.cookie for getSession() and onAuthStateChange(). Setting
  // httpOnly: true breaks client-side session detection and token refresh.
  //
  // Residual risk (PII-006): a non-HttpOnly cookie means XSS could read the
  // session token. The compensating control is the strict production CSP
  // (nonce-based script-src, no 'unsafe-inline') built in src/proxy.ts and
  // asserted by tests/unit/proxy-csp.test.ts. Keep that CSP strict.
  httpOnly: false,
  maxAge: DEFAULT_MAX_AGE,
};
