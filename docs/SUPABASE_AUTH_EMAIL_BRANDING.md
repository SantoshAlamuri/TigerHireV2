# Supabase Auth Email Branding (TigerHire)

Login, signup confirmation, password reset, and invite emails are sent by **Supabase Auth**, not by your app’s Resend integration. To show **TigerHire** as the sender and use consistent copy, configure **Custom SMTP** and **Email Templates**.

**Google sign-in screen:** To show "TigerHire" on the **Google OAuth consent screen** instead of the Supabase URL, see **`SUPABASE_GOOGLE_OAUTH_BRANDING.md`**.

**Can the Supabase MCP do this?** No. The Supabase MCP in this project exposes database (SQL, migrations, `list_tables`), edge functions, branches, logs, and `search_docs`. It does **not** expose a tool for project auth config or email templates. Use one of the options below.

---

## Option A: Apply templates via script (Management API)

From the repo you can apply all TigerHire email templates in one go using the Supabase **Management API**:

1. Create a [personal access token](https://supabase.com/dashboard/account/tokens) (PAT) and add it (and optionally project ref) to `.env.local`:
   ```
   SUPABASE_ACCESS_TOKEN=your_token_here
   # optional if you already have Next app env:
   # NEXT_PUBLIC_SUPABASE_URL=https://your_ref.supabase.co
   # or: SUPABASE_PROJECT_REF=your_ref
   ```
2. Run:
   ```bash
   npm run apply:auth-templates
   ```
   The script loads `.env.local` so you don’t need to export vars in the shell.

The script patches only the auth email template fields (subjects and bodies for confirm signup, magic link, recovery, invite, email change, reauthentication). It does **not** set Custom SMTP; do that once in the Dashboard (see Option B below).

---

## Option B: Dashboard (SMTP + templates by hand)

### 1. Custom SMTP (sender = TigerHire)

So the “From” name and address are TigerHire (e.g. `TigerHire <noreply@tigerhire.io>`):

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Project Settings** (gear) → **Auth**.
2. Under **SMTP Settings**, enable **Custom SMTP**.
3. Use the same provider as your app (e.g. Resend):
   - **Host:** `smtp.resend.com`
   - **Port:** `465` (SSL) or `587` (TLS)
   - **Username:** `resend` (for Resend)
   - **Password:** your `RESEND_API_KEY`
   - **Sender email:** `noreply@app.tigerhire.io` (must match a verified domain in Resend — currently `app.tigerhire.io`)
   - **Sender name:** `TigerHire`

> **Note:** The verified Resend domain is `app.tigerhire.io`, not the root `tigerhire.io`.

After saving, all auth emails will appear from **TigerHire** &lt;noreply@app.tigerhire.io&gt;.

### 2. Email templates (TigerHire copy)

Edit each auth template so the subject and body mention TigerHire.

**Where:** Dashboard → **Authentication** → **Email Templates**.

### Confirm signup

**Subject:** `Confirm your TigerHire account`

**Body (HTML):**

```html
<h2>Confirm your email</h2>
<p>Thanks for signing up for TigerHire. Click the link below to activate your account.</p>
<p><a href="{{ .ConfirmationURL }}">Confirm your email</a></p>
<p>If you didn’t create an account with TigerHire, you can ignore this email.</p>
<p>— The TigerHire team</p>
```

### Magic link

**Subject:** `Your TigerHire login link`

**Body (HTML):**

```html
<h2>Sign in to TigerHire</h2>
<p>Use the link below to sign in. It expires soon.</p>
<p><a href="{{ .ConfirmationURL }}">Sign in to TigerHire</a></p>
<p>If you didn’t request this, you can ignore this email.</p>
<p>— The TigerHire team</p>
```

### Reset password

**Subject:** `Reset your TigerHire password`

**Body (HTML):**

```html
<h2>Reset your password</h2>
<p>
  We received a request to reset the password for your TigerHire account. Click the link below to
  set a new password.
</p>
<p><a href="{{ .ConfirmationURL }}">Reset password</a></p>
<p>If you didn’t request this, you can ignore this email. Your password will stay the same.</p>
<p>— The TigerHire team</p>
```

### Invite user

**Subject:** `You’re invited to TigerHire`

**Body (HTML):**

```html
<h2>You’re invited to TigerHire</h2>
<p>
  You’ve been invited to join TigerHire. Click the link below to accept and create your account.
</p>
<p><a href="{{ .ConfirmationURL }}">Accept invite</a></p>
<p>— The TigerHire team</p>
```

### Change email address

**Subject:** `Confirm your new email for TigerHire`

**Body (HTML):**

```html
<h2>Confirm your new email</h2>
<p>
  You requested to change the email for your TigerHire account. Click the link below to confirm.
</p>
<p><a href="{{ .ConfirmationURL }}">Confirm new email</a></p>
<p>— The TigerHire team</p>
```

### 3. Optional: Reauthentication (OTP)

**Subject:** `Your TigerHire verification code`

**Body (HTML):**

```html
<h2>Verification code</h2>
<p>Your code to continue: <strong>{{ .Token }}</strong></p>
<p>If you didn’t request this, you can ignore this email.</p>
<p>— The TigerHire team</p>
```

### 4. Template variables (reference)

Supabase uses [Go templates](https://supabase.com/docs/guides/auth/auth-email-templates). Useful variables:

| Variable                 | Description                           |
| ------------------------ | ------------------------------------- |
| `{{ .ConfirmationURL }}` | Full link to confirm (use in buttons) |
| `{{ .Token }}`           | 6-digit OTP (for reauth / OTP flows)  |
| `{{ .SiteURL }}`         | Your app Site URL from Auth settings  |
| `{{ .Email }}`           | User’s email                          |
| `{{ .RedirectTo }}`      | Redirect URL passed from your app     |

Keep **Site URL** and **Redirect URLs** correct under **Authentication** → **URL Configuration** so links in these emails land on your app.

### 5. Summary

| Step | Action                                                                                                                                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Enable **Custom SMTP** in Project Settings → Auth; set sender to `TigerHire <noreply@app.tigerhire.io>` via Resend.                                                                       |
| 2    | In **Authentication** → **Email Templates**, paste the TigerHire subject and body for Confirm signup, Magic link, Reset password, Invite (and optionally Change email, Reauthentication). |
| 3    | Ensure **URL Configuration** (Site URL, Redirect URLs) matches your app so confirmation links work.                                                                                       |

After this, users will receive login and auth emails from **TigerHire** &lt;noreply@app.tigerhire.io&gt; with consistent branding and copy.
