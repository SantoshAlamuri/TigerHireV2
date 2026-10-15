/**
 * Password-reset links arrive in Supabase's implicit flow: the session travels
 * in the URL hash fragment (`#access_token=…&refresh_token=…&type=recovery`),
 * never as a `?code=` the server could exchange. The browser keeps the
 * fragment across the callback redirect, so the reset page reads it here and
 * establishes the session itself with `setSession`.
 *
 * The SSR browser client is PKCE-only and refuses implicit fragments
 * ("Not a valid PKCE flow url"), which is why this is done by hand.
 */
export type RecoveryHash =
  | { kind: "tokens"; accessToken: string; refreshToken: string; type: string | null }
  | { kind: "error"; code: string | null; description: string | null }
  | { kind: "none" };

export function parseRecoveryHash(rawHash: string): RecoveryHash {
  const hash = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
  if (!hash) return { kind: "none" };
  const params = new URLSearchParams(hash);

  const error = params.get("error") ?? params.get("error_code");
  const description = params.get("error_description");
  if (error || description) {
    return { kind: "error", code: params.get("error_code") ?? error, description };
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) {
    return { kind: "tokens", accessToken, refreshToken, type: params.get("type") };
  }
  return { kind: "none" };
}

/** Drop the fragment so tokens do not linger in history, the address bar, or a copied URL. */
export function clearLocationHash(): void {
  if (typeof window === "undefined" || !window.location.hash) return;
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
}
