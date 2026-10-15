# Auth setup checklist — what you need to do

Use this list so Google (and other SSO) login uses **only tigerhire.io** in the browser and works reliably (including from India).

---

## 1. Set environment variables (production / Vercel)

In **Vercel** (or your production env), set:

| Variable                        | Value                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://tigerhire.io` (no trailing slash)                                                  |
| `SUPABASE_INTERNAL_URL`         | Your real Supabase URL, e.g. `https://htdyomyhkvhcwoeodwas.supabase.co` (no trailing slash) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same as now (do not change)                                                                 |
| `SUPABASE_SERVICE_ROLE_KEY`     | Same as now (do not change)                                                                 |

This makes the app use your domain for all Supabase calls (auth, API). The server rewrites those requests to the real Supabase URL internally.

---

## 2. Configure Supabase Dashboard

1. Open **[Supabase Dashboard → your project → Authentication → URL Configuration](https://supabase.com/dashboard/project/_/auth/url-configuration)**.
2. Set **Site URL** to: `https://tigerhire.io`
3. Under **Redirect URLs**, add:
   - `https://tigerhire.io/api/auth/callback`
   - `http://localhost:3000/api/auth/callback` (if you test locally with the same project)

Save.

---

## 3. Redeploy

Redeploy the app (e.g. push to main or trigger a new Vercel deployment) so the new env vars and rewrites are used.

---

## 4. (Optional) Local development

- **Option A — same as production (proxy):**  
  In `.env.local`:  
  `NEXT_PUBLIC_SUPABASE_URL=http://localhost:3000`  
  `SUPABASE_INTERNAL_URL=https://your-project.supabase.co`
- **Option B — direct Supabase:**  
  Leave `NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co` and do **not** set `SUPABASE_INTERNAL_URL`.

---

## 5. If users still see SSL / “can’t access” (e.g. in India)

- Ask them to try **another DNS** (e.g. [Cloudflare 1.1.1.1](https://1.1.1.1) or [Google DNS](https://developers.google.com/speed/public-dns)) or a **VPN**.
- Check **[status.supabase.com](https://status.supabase.com/)** for incidents (e.g. “Users Experiencing Network Connectivity Problems (India Region)”).

---

## 6. Disable automatic cleanup of unverified users (CRITICAL)

Supabase can silently delete users who never confirmed their email. This will remove real users and demo accounts without warning.

1. Open **Supabase Dashboard → Authentication → Users**.
2. Look for a toggle or setting about **"Automatically remove unverified users"** (may also appear under **Email** in the Notifications section or **Attack Protection**).
3. **Turn it OFF** (or set a very long retention period like 30 days).
4. Save.

> **Why:** Demo users created via `seed-demo-users` use `email_confirm: true` so they are safe. But any user who registers via the normal flow and doesn't confirm their email will be deleted by Supabase if this is ON. This caused users to disappear without any code changes.

---

## Quick reference

| Goal                                             | Action                                                                                                                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser shows only tigerhire.io (no supabase.co) | Do steps 1–3 above.                                                                                                                                                                |
| Site URL / redirects                             | Step 2 (Supabase Dashboard).                                                                                                                                                       |
| Login still fails (e.g. India)                   | Step 5 + status.supabase.com.                                                                                                                                                      |
| Microsoft / Entra ID SSO                         | Enable **Azure** in Supabase Providers and register redirect URI in Entra; see `docs/AUTH_OAUTH_CUSTOM_DOMAIN.md` §5.                                                              |
| MCP for this project                             | Copy `mcp/cursor-supabase.example.json` into `.cursor/mcp.json`, set `SUPABASE_ACCESS_TOKEN` (or use env). See `mcp/README.md`. Restart Cursor and log in to Supabase if prompted. |
