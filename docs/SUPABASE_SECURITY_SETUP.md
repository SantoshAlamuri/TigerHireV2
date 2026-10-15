# Supabase Security Configuration

**See also:** [SUPABASE_AUTH_EMAIL_BRANDING.md](./SUPABASE_AUTH_EMAIL_BRANDING.md) — how to send login/signup/password-reset emails from **TigerHire** (custom SMTP + templates).

## P1-1: Enable Leaked Password Protection (~15 min)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) > Project > Authentication > Providers
2. Under **Email** provider settings, enable **"Leaked Password Protection"**
3. This checks passwords against the HaveIBeenPwned database during signup/password change
4. No code changes required

## P1-8: Enable MFA for Admin/Recruiter Roles (~1 week)

### Phase 1: Enable TOTP MFA in Supabase

1. Go to Supabase Dashboard > Authentication > Multi-Factor Authentication
2. Enable **TOTP** (Time-based One-Time Password)
3. This allows users to enroll MFA factors via the Supabase Auth API

### Phase 2: Frontend Enrollment Flow

Add MFA enrollment UI to `/profile` or `/settings`:

```typescript
// Enroll MFA factor
const { data, error } = await supabase.auth.mfa.enroll({
  factorType: "totp",
  friendlyName: "Authenticator App",
});
// data.totp.qr_code contains the QR code to scan
// data.totp.uri contains the TOTP URI

// Verify enrollment with a code from the authenticator app
await supabase.auth.mfa.challengeAndVerify({
  factorId: data.id,
  code: userEnteredCode,
});
```

### Phase 3: Enforce MFA for Privileged Roles

Add a middleware check or RLS policy that requires AAL2 (authenticated with MFA) for admin and recruiter roles:

```sql
-- Example RLS policy requiring MFA for admin operations
CREATE POLICY "Admin ops require MFA"
  ON sensitive_table FOR ALL
  USING (
    auth.jwt() ->> 'aal' = 'aal2'
    OR public.auth_role() NOT IN ('super_admin', 'company_admin', 'recruiter')
  );
```

### Phase 4: Enforcement Rollout

1. Week 1: MFA available but optional (enrollment UI live)
2. Week 2: Prompt admins/recruiters to enable MFA on login
3. Week 3: Require MFA for admin/recruiter roles (block access without it)
