# OAuth (Google / LinkedIn / Microsoft Entra) with custom Supabase domain

When your Supabase API uses a **custom domain** (e.g. `https://api.tigerhire.io`), OAuth must be configured in each IdP and in Supabase. If any redirect URI is wrong, you get 400 or “provider not configured” and sign-in fails for that provider.

---

## 1. Environment (Vercel)

Set in **Vercel → Project → Settings → Environment Variables**:

| Variable                        | Value                      | Purpose                                                |
| ------------------------------- | -------------------------- | ------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://api.tigerhire.io` | Your Supabase API custom domain                        |
| `NEXT_PUBLIC_APP_URL`           | `https://tigerhire.io`     | App origin; used as base for redirect back to your app |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (your anon key)            | Supabase anon key                                      |
| `SUPABASE_SERVICE_ROLE_KEY`     | (your service role key)    | Server-side Supabase                                   |

**Important:** `NEXT_PUBLIC_APP_URL` must be your **app** URL (e.g. `https://tigerhire.io`), not the API URL. The app uses it to build `https://tigerhire.io/api/auth/callback` for the post-OAuth redirect.

---

## 2. Supabase Dashboard

**Authentication → URL Configuration**

- **Site URL:** `https://tigerhire.io` (your app)
- **Redirect URLs:** add exactly:
  - `https://tigerhire.io/api/auth/callback`
  - `http://localhost:3000/api/auth/callback` (for local dev)

Save. This is where Supabase sends the user **after** it has exchanged the OAuth code for a session.

**Authentication → Providers**

- **Google:** Enable, paste Client ID and Client Secret from Google Cloud Console.
- **LinkedIn:** Enable (LinkedIn OIDC), paste Client ID and Client Secret from LinkedIn Developer.
- **Azure (Microsoft):** Enable. In Supabase this maps to the **`azure`** provider used by the app’s “Microsoft” button (Entra ID / Microsoft account). Paste the Application (client) ID and Client secret from Microsoft Entra (see section 5).

---

## 3. Google Cloud Console (Google OAuth)

1. [Google Cloud Console](https://console.cloud.google.com/) → your project → **APIs & Services → Credentials**.
2. Open your **OAuth 2.0 Client ID** (Web application).
3. Under **Authorized redirect URIs** add the **Supabase** callback (where Google sends the code), **not** your app URL:
   - With custom Supabase domain: **`https://api.tigerhire.io/auth/v1/callback`**
   - Default Supabase: `https://<project-ref>.supabase.co/auth/v1/callback`

Do **not** put `https://tigerhire.io/api/auth/callback` here. Google redirects to Supabase first; Supabase then redirects to your app.

---

## 4. LinkedIn Developer (LinkedIn OIDC)

1. [LinkedIn Developer](https://www.linkedin.com/developers/) → your app → **Auth**.
2. Under **OAuth 2.0 settings → Authorized redirect URLs** add the **Supabase** callback:
   - With custom Supabase domain: **`https://api.tigerhire.io/auth/v1/callback`**
   - Default Supabase: `https://<project-ref>.supabase.co/auth/v1/callback`

Again, this is where **LinkedIn** redirects (to Supabase). Your app’s URL is configured in Supabase (step 2).

---

## 5. Microsoft Entra ID (Azure AD) — Supabase “Azure” provider

TigerHire calls Supabase with `provider: "azure"` (the **Microsoft** button on login, register, and profile linking).

1. [Microsoft Entra admin center](https://entra.microsoft.com/) → **Applications → App registrations** → **New registration**.
2. Name the app (e.g. TigerHire), choose **Accounts in this organizational directory only** (single tenant) or **Multitenant** depending on your customers; note the **Application (client) ID**.
3. **Certificates & secrets** → create a **Client secret**; copy it into Supabase → Authentication → Providers → **Azure** (Client Secret).
4. **Authentication** → **Add a platform** → **Web**. Under **Redirect URIs**, add the **Supabase** callback (same pattern as Google/LinkedIn):
   - Custom Supabase domain: **`https://api.tigerhire.io/auth/v1/callback`**
   - Default project URL: `https://<project-ref>.supabase.co/auth/v1/callback`
5. Paste **Application (client) ID** into Supabase Azure provider as Client ID, and the secret from step 3 as Client Secret. For multitenant apps, Supabase may require the **Directory (tenant) ID** in the provider settings (see [Supabase Azure docs](https://supabase.com/docs/guides/auth/social-login/auth-azure)).

First-time users are **JIT-provisioned** like other OAuth users: `/api/auth/callback` creates a `profiles` row if missing (default role `candidate_free`), same as Google/LinkedIn.

---

## Flow summary

1. User clicks Google, LinkedIn, or Microsoft on `tigerhire.io`.
2. App calls Supabase and gets a URL like `https://api.tigerhire.io/auth/v1/authorize?...`
3. User is sent to the IdP (Google, LinkedIn, or Microsoft).
4. The IdP redirects to **`https://api.tigerhire.io/auth/v1/callback`** (must be registered on the IdP side).
5. Supabase exchanges the code, then redirects to **`https://tigerhire.io/api/auth/callback`** (must be in Supabase Redirect URLs).
6. Your app’s callback route exchanges the code for a session and redirects the user into the app.

---

## Checklist

- [ ] Vercel: `NEXT_PUBLIC_APP_URL` = `https://tigerhire.io`
- [ ] Vercel: `NEXT_PUBLIC_SUPABASE_URL` = `https://api.tigerhire.io`
- [ ] Supabase URL config: Site URL = `https://tigerhire.io`, Redirect URLs include `https://tigerhire.io/api/auth/callback`
- [ ] Supabase: Google, LinkedIn, and (if using enterprise SSO) **Azure** providers enabled with correct Client ID/Secret
- [ ] Google Cloud: Authorized redirect URI = `https://api.tigerhire.io/auth/v1/callback`
- [ ] LinkedIn: Authorized redirect URL = `https://api.tigerhire.io/auth/v1/callback`
- [ ] Microsoft Entra: Web redirect URI = `https://api.tigerhire.io/auth/v1/callback` (or your project’s `...supabase.co/auth/v1/callback`)
- [ ] Redeploy after changing env vars

---

## Regression Guardrails

Keep these callback expectations covered in tests to avoid OAuth regressions:

- Public/candidate OAuth users with public domains (for example `gmail.com`) must not be forced through enterprise-domain denial when they are in the public flow.
- When callback `next` is missing or `/`, do not treat `/` as the preferred target for first-time public users. Redirect to the role dashboard (currently `/candidate`) instead.
- Preserve explicit `next` targets (for example `/refer/join?...`) when they are present and safe.

Suggested test location: `tests/unit/auth-callback-route.test.ts`.

---

## Getting 400 on “authorize?provider=…” (google, linkedin_oidc, azure)?

The 400 is returned by **Supabase’s** authorize endpoint when a redirect URI or provider config is wrong.

1. **Check the exact URLs your app uses**  
   Open in the browser (same host as your app):  
   **`https://tigerhire.io/api/auth/oauth-redirect-url`**  
   You’ll get:
   - **`appRedirectUrl`** — must appear **exactly** in Supabase → Authentication → URL Configuration → **Redirect URLs** (one line per URL, no extra spaces/slashes).
   - **`supabaseCallbackUrl`** — must appear in **Google Cloud**, **LinkedIn**, and **Microsoft Entra** (if using Azure) as the **Authorized redirect URI / URL**.

2. **Supabase**  
   Authentication → URL Configuration → Redirect URLs: add `appRedirectUrl` exactly (e.g. `https://tigerhire.io/api/auth/callback`). No trailing slash unless the response shows one.

3. **LinkedIn**  
   App → Auth → OAuth 2.0 → Authorized redirect URLs: add `supabaseCallbackUrl` exactly (e.g. `https://api.tigerhire.io/auth/v1/callback`). LinkedIn is case-sensitive and must match exactly.

4. **Google**  
   Same as LinkedIn: add `supabaseCallbackUrl` to Authorized redirect URIs.

5. **Microsoft Entra**  
   App registration → Authentication: Web redirect URI must match `supabaseCallbackUrl` exactly. Tenant / multitenant settings must match what you entered in Supabase Azure provider.

6. **LinkedIn provider in Supabase**  
   Authentication → Providers → LinkedIn: ensure it’s enabled and Client ID / Client Secret from LinkedIn are correct (no extra spaces, correct app).
