# TigerHire — Test Setup Guide

> Read this before running tests. Takes ~10 minutes to set up once.

---

## File locations

```
tests/
  unit/
    settings/
      integrations.repository.test.ts   ← Repository + secrets logic
  component/
    settings/
      IntegrationRow.test.tsx            ← UI component behaviour
  functional/
    settings/
      api.test.ts                        ← API route handlers (no real DB)
e2e/
  settings-to-interview.spec.ts          ← Full flow end-to-end
```

---

## Run commands

```bash
# All unit + component + functional tests
npx vitest run

# Watch mode during development
npx vitest

# Specific test file
npx vitest run tests/unit/settings/integrations.repository.test.ts

# E2E tests (app must be running)
npx playwright test e2e/settings-to-interview.spec.ts

# E2E headed (see browser)
npx playwright test e2e/settings-to-interview.spec.ts --headed

# E2E single suite
npx playwright test e2e/settings-to-interview.spec.ts -g "Admin configures Zoom"
```

---

## Environment variables for E2E

Add to `.env.test` (never commit this file):

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000
E2E_ADMIN_EMAIL=admin@test-acme.com
E2E_ADMIN_PASSWORD=test-password-123
E2E_RECRUITER_EMAIL=recruiter@test-acme.com
E2E_RECRUITER_PASSWORD=test-password-456
```

---

## Supabase test seed

Before running E2E, seed your test Supabase project with:

```sql
-- 1. Test organization
insert into public.organizations (id, name, slug)
values ('org-e2e-001', 'Test Acme Corp', 'test-acme')
on conflict do nothing;

-- 2. Admin user (create via Supabase Auth dashboard or CLI first, then link)
insert into public.organization_members (organization_id, user_id, role)
values (
  'org-e2e-001',
  '<admin-user-uuid-from-auth>',
  'admin'
) on conflict do nothing;

-- 3. Recruiter user
insert into public.organization_members (organization_id, user_id, role)
values (
  'org-e2e-001',
  '<recruiter-user-uuid-from-auth>',
  'recruiter'
) on conflict do nothing;

-- 4. Default privacy settings
insert into public.privacy_settings (organization_id, consent_message, recording_retention_days)
values (
  'org-e2e-001',
  'This interview will be recorded and transcribed by TigerHire. By clicking Continue, you consent.',
  90
) on conflict do nothing;

-- 5. A test candidate (adjust to your schema)
insert into public.candidates (id, organization_id, full_name, email, status)
values (
  'candidate-e2e-001',
  'org-e2e-001',
  'Jane Test Candidate',
  'jane@candidate.test',
  'active'
) on conflict do nothing;
```

Create test users via Supabase CLI:

```bash
npx supabase auth admin create-user \
  --email admin@test-acme.com \
  --password test-password-123 \
  --project-ref <your-test-project-ref>
```

---

## What each test layer covers

| Layer               | Mocks                            | Tests                                                                                        |
| ------------------- | -------------------------------- | -------------------------------------------------------------------------------------------- |
| Unit (Vitest)       | Supabase + secrets               | Repository logic, key masking, audit writes, Zod validation                                  |
| Component (Vitest)  | Next router                      | UI states (connected/disconnected/error), show/hide toggle, form validation, onSave callback |
| Functional (Vitest) | Supabase + secrets + repository  | API route 200/400/401/403 responses, payload validation, security headers                    |
| E2E (Playwright)    | API routes only (via page.route) | Real browser, real navigation, consent gate, full admin→recruiter→candidate flow             |

---

## Key things the tests verify

### Security

- Raw API keys never appear in any network response
- `secret_ref` never exposed in API responses
- Non-admin users get 403 on all settings routes
- Unauthenticated users redirected to login

### Consent gate

- Video room is NOT visible before consent is given
- Consent banner text matches what admin configured in privacy settings
- Consent is recorded before room loads

### Audit log

- Every key save writes an audit entry
- Every disconnect writes an audit entry
- Audit entries include actor email and timestamp

### Validation

- API keys under minimum length rejected (400)
- Invalid provider names rejected (400)
- Consent message under 20 chars rejected (400)
- Retention period out of range rejected (400)

---

## Adding tests for new integrations

When you add a new provider (e.g. Deepgram), you need to add:

1. `tests/unit/` — add provider to `upsertIntegration` test cases
2. `tests/component/` — add `IntegrationRow` render test for new provider
3. `tests/functional/` — add POST test with new provider name
4. `e2e/` — add to "Admin configures" suite

The Zod `providerEnum` in `src/lib/validations/integrations.ts` is the source of truth — if it's not in the enum, all tests will catch it automatically.
