import { createBrowserClient } from "@supabase/ssr";

let cachedClient: ReturnType<typeof createBrowserClient> | null = null;

const SUPABASE_URL_HINT =
  "Set NEXT_PUBLIC_SUPABASE_URL to your project URL (e.g. https://xxxx.supabase.co), not localhost. Restart the dev server after changing .env.local. If the project is paused, resume it in the Supabase dashboard.";

/** Custom fetch in dev: surface clear errors when Supabase requests fail (e.g. token refresh). */
function devFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  return fetch(input, init).catch((err: unknown) => {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const isTokenRefresh =
      typeof url === "string" &&
      (url.includes("/token?grant_type=refresh") || url.includes("/auth/v1/token"));
    const hint = isTokenRefresh
      ? `Token refresh failed. ${SUPABASE_URL_HINT}`
      : `Request failed (${rawMessage}). ${SUPABASE_URL_HINT}`;
    const actionable = new Error(`[Supabase] ${hint}`, {
      cause: err instanceof Error ? err : new Error(String(err)),
    });
    console.warn(actionable.message, { url });
    throw actionable;
  });
}

/** Browser client must use HTTPS and not localhost (custom Supabase API domains like https://api.tigerhire.io are allowed). */
function validateSupabaseUrl(url: string): void {
  const u = url.trim().toLowerCase();
  if (u.startsWith("http://localhost") || u.startsWith("http://127.0.0.1")) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL must be your Supabase API URL (HTTPS), not localhost. The browser talks to Supabase directly. ${SUPABASE_URL_HINT}`,
    );
  }
  if (!u.startsWith("https://")) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL must be HTTPS (e.g. https://YOUR_REF.supabase.co or your custom API URL like https://api.tigerhire.io). Got: ${url.slice(0, 50)}...`,
    );
  }
}

export function createSupabaseBrowserClient() {
  if (cachedClient) return cachedClient;

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const url = rawUrl?.trim();
  const key = rawKey?.trim();
  if (!url || !key) {
    throw new Error(
      "Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) are required when using auth.",
    );
  }
  validateSupabaseUrl(url);
  // In dev, use custom fetch so "Failed to fetch" shows an actionable message.
  // Set NEXT_PUBLIC_SUPABASE_SKIP_DEV_FETCH=1 to use default fetch (error will point at Supabase internals).
  const useDevFetch =
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_SUPABASE_SKIP_DEV_FETCH !== "1";
  cachedClient = createBrowserClient(url, key, {
    global: useDevFetch ? { fetch: devFetch } : undefined,
    auth: {
      // No-op lock in dev: prevents Navigator LockManager timeout during HMR.
      // In production, omit `lock` so auth-js uses the default navigatorLock.
      ...(process.env.NODE_ENV === "development"
        ? {
            lock: async <R>(
              _name: string,
              _acquireTimeout: number,
              fn: () => Promise<R>,
            ): Promise<R> => fn(),
          }
        : {}),
    },
  });
  return cachedClient;
}

export function isSupabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
