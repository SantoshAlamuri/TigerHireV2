# Supabase Auth & Login Issues (India / Regional Connectivity)

If **Google (or other SSO) login** fails with a **Cloudflare “SSL handshake failed” (Error 1049)** or similar when redirecting to `*.supabase.co`, the cause is often **regional connectivity**, not your app code.

## Supabase status

Check current incidents: **[https://status.supabase.com/](https://status.supabase.com/)**

As of early 2026, Supabase has reported:

- **Users Experiencing Network Connectivity Problems (India Region)**
  - Some ISPs in India do not serve correct DNS / routing for Supabase.
  - Requests to `https://<project>.supabase.co` can fail (e.g. SSL handshake between Cloudflare and origin).
  - Supabase infrastructure is operational; the issue is regional (India) access.

## Workarounds (from Supabase)

1. **Alternative DNS**
   - [Cloudflare DNS (1.1.1.1)](https://1.1.1.1)
   - [Google Public DNS](https://developers.google.com/speed/public-dns)
   - [Quad9](https://quad9.net/)

2. **VPN**  
   Use a VPN so traffic is not routed through the affected ISP.

3. **Custom domain (if available)**  
   If your Supabase project uses a custom domain, switching that domain’s DNS to an alternative provider and enabling proxying may restore connectivity ([Supabase update Feb 26, 2026](https://status.supabase.com/)).

## What to tell users

- The failure happens **when the browser loads the Supabase auth URL** (`*.supabase.co`), not on your app’s login page.
- Ask affected users (especially in India) to try: different DNS (e.g. 1.1.1.1), another network, or a VPN.
- Keep an eye on [status.supabase.com](https://status.supabase.com/) for resolution and further workarounds.

## App-side checks (already in place)

- SSO and callback routes use `NEXT_PUBLIC_SUPABASE_URL` and redirect to `${origin}/api/auth/callback`.
- If you see the SSL error **after** clicking “Google” and being sent to Supabase, the app is behaving correctly; the failure is between the user’s network/Cloudflare and Supabase.

---

## Use only your domain (tigerhire.io) — no Supabase URL in the browser

By default, “Sign in with Google” sends the user to `https://<project>.supabase.co/auth/v1/authorize?...`, so the address bar shows a Supabase URL. To keep **only your domain** (e.g. `https://tigerhire.io`) in the bar and avoid exposing Supabase (and work around regional blocks), you can proxy Supabase behind your app.

### How it works

1. **Rewrites** in Next.js send requests for `/auth/*`, `/rest/*`, `/realtime`, `/storage/*`, `/functions/v1/*` on your origin to your real Supabase project.
2. You set **`NEXT_PUBLIC_SUPABASE_URL`** to your app origin (e.g. `https://tigerhire.io`). The Supabase client then builds URLs like `https://tigerhire.io/auth/v1/authorize?...` and the browser only talks to your domain.
3. You set **`SUPABASE_INTERNAL_URL`** to the real Supabase URL (e.g. `https://your-project.supabase.co`). The server uses this only for the rewrite destination; it is not exposed to the client.

### Setup

**Production (e.g. Vercel):**

- `NEXT_PUBLIC_SUPABASE_URL` = your app URL, e.g. `https://tigerhire.io` (no trailing slash).
- `SUPABASE_INTERNAL_URL` = your real Supabase project URL, e.g. `https://htdyomyhkvhcwoeodwas.supabase.co` (no trailing slash).
- Keep `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` unchanged.

**Local dev (optional):**

- To test the same behaviour locally:  
  `NEXT_PUBLIC_SUPABASE_URL=http://localhost:3000`,  
  `SUPABASE_INTERNAL_URL=https://your-project.supabase.co`.
- Or keep using the Supabase URL directly:  
  `NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co` and leave `SUPABASE_INTERNAL_URL` unset (no proxy).

**Supabase Dashboard:**

- In [Authentication → URL Configuration](https://supabase.com/dashboard/project/_/auth/url-configuration), set **Site URL** to your app URL (e.g. `https://tigerhire.io`).
- Add your **Redirect URLs**, e.g. `https://tigerhire.io/api/auth/callback` and `http://localhost:3000/api/auth/callback` for dev.

After this, the OAuth flow will show only your domain (e.g. `https://tigerhire.io/auth/v1/authorize?...`) and redirects stay on your site.
