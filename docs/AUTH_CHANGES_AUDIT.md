# Auth-related changes audit

This doc lists **every change made in this conversation** that touches authentication, and whether it can cause login/session to fail.

---

## 1. `src/lib/supabase/client.ts`

| Change                                                                                                                                   | Could break auth?                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL validation no longer requires `"supabase"` in the URL; only rejects localhost and requires HTTPS (allows `https://api.tigerhire.io`) | **No** – allows your real config.                                                                                                                                                                                                                                                                                                                  |
| `validateSupabaseUrl()` only runs when `typeof window !== "undefined"` (skipped during static prerender/build)                           | **Unclear.** Session is created on the server (login route). Browser client is used for `getSession()` and token refresh. If the browser client is never created (e.g. app crashes before AuthProvider runs), you’d never get session in the UI. If env is wrong only at build time, build could pass but runtime could still fail in the browser. |

**Revert test:** Remove the `if (typeof window !== "undefined")` guard so validation always runs. If the URL is correct (`https://api.tigerhire.io`), behavior is the same. If something is wrong with the URL in the browser, you’ll get a clear throw instead of silent failure.

---

## 2. `src/app/api/auth/sso/route.ts`

| Change                                             | Could break auth?      |
| -------------------------------------------------- | ---------------------- |
| Clearer error message when `signInWithOAuth` fails | **No** – message only. |
| Logging `redirectTo` on failure                    | **No** – logging only. |
| Comment about `NEXT_PUBLIC_APP_URL`                | **No** – comment only. |

**Verdict:** No impact on email login or session.

---

## 3. `src/app/api/auth/oauth-redirect-url/route.ts`

| Change                                                                | Could break auth?                    |
| --------------------------------------------------------------------- | ------------------------------------ |
| New GET endpoint returning `appRedirectUrl` and `supabaseCallbackUrl` | **No** – read-only, no side effects. |

---

## 4. `src/lib/auth/AuthProvider.tsx`

| Change                                                                       | Could break auth?                       |
| ---------------------------------------------------------------------------- | --------------------------------------- |
| Try/catch around `createSupabaseBrowserClient()` was added then **reverted** | **No** – current code matches original. |

---

## 5. Files we did **not** change

- `src/app/api/auth/login/route.ts` – unchanged.
- `src/lib/supabase/server.ts` – unchanged.
- `src/lib/supabase/cookie-options.ts` – unchanged.
- `src/lib/supabase/middleware.ts` (used by proxy) – unchanged.
- `src/proxy.ts` – unchanged.
- `src/lib/security/csrf.ts` – unchanged.

So **email login flow and server-side session/cookie handling are unchanged in code.**

---

## What can still break auth (without code changes)

1. **403 on POST /api/auth/login**  
   `validateOrigin()` in production blocks requests whose `Origin` (or `Referer`) is not allowed.
   - Set **`NEXT_PUBLIC_APP_URL`** in Vercel to `https://tigerhire.io` (no trailing slash).
   - Users must hit the same host they log in from (e.g. `https://tigerhire.io`, not a different domain or old preview URL).

2. **Session not persisting after login**  
   Login route uses `createSupabaseServerClient()` and `signInWithPassword()`. Supabase SSR calls `setAll()` on the cookie store; Next.js should merge those cookies into the route response.
   - In DevTools → Application → Cookies, after a successful login you should see `sb-*` cookies for your domain.
   - If they’re missing, the issue is cookie domain/path or how the response is sent (e.g. proxy/headers), not the login route logic itself.

3. **Wrong or missing env at build/runtime**
   - **Build:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are inlined at build time. They must be set in Vercel for the Production environment so the built app has the correct values.
   - **Runtime:** Same vars (and `NEXT_PUBLIC_APP_URL` for redirects) must be available in the environment that serves the app.

---

## Recommended checks (in order)

1. **Vercel env (Production)**
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://api.tigerhire.io`
   - `NEXT_PUBLIC_APP_URL` = `https://tigerhire.io`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` set.  
     Redeploy after changing env.

2. **403 on login**  
   If POST /api/auth/login returns 403, add or fix `NEXT_PUBLIC_APP_URL` and ensure users open the app at that URL (e.g. `https://tigerhire.io`).

3. **Cookies after login**  
   After a successful login, check DevTools → Application → Cookies for your domain. If `sb-*` cookies are missing, the problem is cookie setting/domain/response, not the login handler code.

4. **Optional: always run URL validation in client**  
   In `src/lib/supabase/client.ts`, remove the `if (typeof window !== "undefined")` guard so `validateSupabaseUrl(url)` always runs. With the correct URL this doesn’t change behavior; if the URL is wrong you get an explicit error instead of odd failures.
