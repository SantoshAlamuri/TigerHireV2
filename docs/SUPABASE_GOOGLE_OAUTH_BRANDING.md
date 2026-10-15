# Show "TigerHire" on Google Sign-In Screen

When users click **Sign in with Google**, the consent screen can show `htdyomyhkvhcwoeodwas.supabase.co` instead of **TigerHire**. To show TigerHire clearly, do both steps below.

---

## 1. Brand the OAuth consent screen in Google Cloud

The **app name and logo** on the Google sign-in dialog come from your **OAuth consent screen** in Google Cloud, not from Supabase.

1. Open **[Google Cloud Console](https://console.cloud.google.com/)** and select the project that holds your Google OAuth credentials (the same Client ID you use in Supabase for the Google provider).

2. Go to **APIs & Services** → **[OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)**.

3. Under **OAuth consent screen**:
   - **App name:** set to **TigerHire**.
   - **User support email:** your support email (e.g. `support@tigerhire.io`).
   - **App logo:** upload your TigerHire logo (optional but recommended).
   - **Application home page:** `https://tigerhire.io` (or your production URL).
   - **Application privacy policy** and **Application terms of service:** add your policy and terms URLs if you have them.

4. Save. If the consent screen was already in use, existing users may still see the old name until they revoke access or you publish changes; new users will see **TigerHire**.

5. (Optional) **[Verification](https://console.cloud.google.com/apis/credentials/consent)** — if you need a verified badge or to show the app to all Google users, submit for verification; this can take several business days.

After this, Google can show **TigerHire** (and your logo) as the app name on the consent screen. The line _“You’re signing in to …”_ may still show a **domain** (see step 2).

---

## 2. Use your domain in the browser (so the URL is tigerhire.io, not supabase.co)

If the consent screen still shows **htdyomyhkvhcwoeodwas.supabase.co**, that’s because the **authorize** URL the user hits is on the Supabase domain. To keep the flow on your domain:

1. **Proxy Supabase behind your app** so the browser only sees `tigerhire.io`:
   - In production (e.g. Vercel), set:
     - `NEXT_PUBLIC_SUPABASE_URL` = `https://tigerhire.io`
     - `SUPABASE_INTERNAL_URL` = `https://htdyomyhkvhcwoeodwas.supabase.co`
   - Your Next.js rewrites (if already set up) will send `/auth/*` (and related) to Supabase internally.

2. **Supabase Dashboard** → **Authentication** → **URL Configuration**:
   - **Site URL:** `https://tigerhire.io`
   - **Redirect URLs:** include `https://tigerhire.io/api/auth/callback` (and `http://localhost:3000/api/auth/callback` for local dev).

3. Redeploy so the new env vars and rewrites are used.

Then the **address bar** will show `https://tigerhire.io/...` during sign-in. The exact text _“You’re signing in to …”_ on the Google dialog can still reflect the **redirect/callback domain** that Google has for your OAuth client. To have that sentence show **tigerhire.io** (or a custom auth subdomain), you’d need a **Supabase custom domain** (e.g. `auth.tigerhire.io`) for the project — that’s a paid Supabase feature. For most users, **step 1 (TigerHire name + logo)** plus **step 2 (your domain in the browser)** is enough to make it clearly TigerHire.

---

## Quick checklist

| Goal                                              | Action                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **“TigerHire” and logo on Google consent screen** | Google Cloud → OAuth consent screen → App name **TigerHire**, add logo, save.                                                   |
| **Browser URL = tigerhire.io during sign-in**     | Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_INTERNAL_URL` (proxy), configure Site URL and Redirect URLs in Supabase, redeploy. |
| **“Signing in to” line shows your domain**        | Requires Supabase custom domain (e.g. `auth.tigerhire.io`) — optional.                                                          |

For email branding (sender name, templates), see **`SUPABASE_AUTH_EMAIL_BRANDING.md`**.
