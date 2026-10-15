# Supabase Auth: Password Security (Leaked Password Protection)

The Supabase linter may report: **Leaked Password Protection Disabled** (auth_leaked_password_protection). Supabase Auth can check new passwords against [HaveIBeenPwned.org](https://haveibeenpwned.com/) and reject known compromised passwords.

## Enable in Dashboard

This is a **project setting**, not something you configure in code or migrations.

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication** → **Settings** (or **Project Settings** → **Auth**).
2. Find **Password Security** (or **Security**).
3. Enable **“Prevent the use of leaked passwords”** (or similar wording).

**Docs:** [Password strength and leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

**Note:** Leaked password protection is typically available on **Pro plan and above**. On free tier the option may be absent or limited.

## Optional: Minimum length and character rules

In the same Auth / Password Security section you can configure:

- Minimum password length (e.g. 8+)
- Required character types (digits, upper/lowercase, symbols)

Users who choose a weak or leaked password will see a `WeakPasswordError` from Supabase Auth.
