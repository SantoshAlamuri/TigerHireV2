# Referral Integration Spec

> **Status (2026-05-12): SUPERSEDED.** Onboarding is now consolidated through
> the candidate `/register` flow. The standalone referrer signup pages
> (`/refer`, `/refer/join`) are 302 redirects to
> `/register?referral_intent=true&...preserved-params`. After registration the
> candidate dashboard exposes a "Refer & earn" CTA that routes to
> `/dashboard/referrer`, which detects `needs_setup` and runs the existing
> WhatsApp-OTP setup inline (same `/api/refer/join` + `/api/refer/otp/*`
> endpoints described below — only the entry surface changed).
>
> The legacy `/refer/join?parent=<referrer_id>` invite-link shape is preserved:
> the deprecated page forwards `parent` and other query params to `/register`,
> which stashes them in `sessionStorage` so the inline setup form on
> `/dashboard/referrer` can post `parent_referrer_id` to `/api/refer/join` and
> keep invite-chain attribution intact.
>
> Sections below describe the prior plan and remain useful as a reference for
> the underlying data model, API surface, and migration history. Do not use
> this document as the source of truth for the current onboarding UX.

## Scope

This document defines the integration plan to merge the standalone referral subsystem into the primary TigerHire product flow with one auth model, one dashboard experience, and one operational referral data model.

No code changes are included in this document.

---

## 1) Current State - Two Parallel Systems

### A. Referral System Files (standalone/public + referral-specific backend)

#### Public Pages

- `src/app/(public)/refer/page.tsx`
- `src/app/(public)/refer/login/page.tsx`
- `src/app/(public)/refer/auth/page.tsx`
- `src/app/(public)/refer/join/page.tsx`
- `src/app/(public)/refer/join/layout.tsx`
- `src/app/(public)/refer/dashboard/page.tsx`
- `src/app/(public)/refer/dashboard/layout.tsx`
- `src/app/(dashboard)/dashboard/referrer/page.tsx`
- `src/app/(dashboard)/dashboard/referrer/join/page.tsx`

#### Referral API Routes

- `src/app/api/refer/join/route.ts`
- `src/app/api/refer/otp/send/route.ts`
- `src/app/api/refer/otp/verify/route.ts`
- `src/app/api/refer/otp/verify-public/route.ts`
- `src/app/api/refer/links/generate/route.ts`
- `src/app/api/refer/links/route.ts`
- `src/app/api/refer/jobs/open/route.ts`
- `src/app/api/refer/open-jobs/route.ts`
- `src/app/api/refer/dashboard/profile/route.ts`
- `src/app/api/refer/session/bootstrap/route.ts`
- `src/app/api/refer/magic-link/send/route.ts`
- `src/app/api/refer/magic-link/consume/route.ts`
- `src/app/api/referrer/profile/route.ts` (legacy/overlapping API surface)

#### Referral Services / Helpers

- `src/lib/referrers/session.ts`
- `src/lib/referrers/normalize-whatsapp.ts`
- `src/lib/referrers/referral-link-mint.ts`
- `src/lib/services/referrer-otp.ts`
- `src/lib/services/referrer-magic-link.ts`

#### Referral DB Tables / Views / Referral Columns

- `referrers`
- `referral_links`
- `referrer_otp`
- `referrer_magic_links`
- `job_referral_config`
- `payout_ledger`
- `payout_export` (view)
- `applications.referral_link_id`
- `applications.direct_referrer_id`
- `applications.parent_referrer_id`
- `applications.source` (includes referral attribution source tags)
- `organisations.email_domain` (for employee/org verification)

#### Referral-Focused Migrations

- `supabase/migrations/20260326140000_referral_identity_layer.sql`
- `supabase/migrations/20260326150000_payout_ledger.sql`
- `supabase/migrations/20260326160000_job_referral_config.sql`
- `supabase/migrations/20260326170000_referrer_whatsapp_referral_link_job_unique.sql`
- `supabase/migrations/20260326180000_referrer_portal_schema.sql`
- `supabase/migrations/20260326190000_referrers_city.sql`
- `supabase/migrations/20260326201000_referrer_portal_v2.sql`
- `supabase/migrations/20260326210000_unified_identity.sql`
- `supabase/migrations/20260326220000_verified_referrer.sql`
- `supabase/migrations/20260318100000_applications_source.sql`

### B. Main App Files That Touch Referrals

- `src/app/(dashboard)/candidate/profile/page.tsx` (referrer details embedded in candidate profile)
- `src/app/(dashboard)/candidate/jobs/page.tsx` (candidate generates referral links from jobs feed)
- `src/app/api/profiles/route.ts` + `src/lib/services/ProfileService.ts` (reads/writes referrer data from unified profile)
- `src/lib/validations/candidates.ts` (`profilePatchSchema` contains referral fields)
- `src/components/dashboard/Sidebar.tsx` (candidate nav includes Refer & earn entry)
- `src/components/dashboard/DashboardShell.tsx` (route-role policy includes `/dashboard/referrer`)
- `src/app/api/jobs/[id]/referral-config/route.ts` + `src/lib/validations/job-referral-config.ts` (per-job referral bonus config)
- `src/components/dashboard/JobReferralBonusFormFields.tsx` (job config UI)
- `src/app/api/my-pipeline/route.ts` (adds referrer metadata to recruiter pipeline cards)
- `src/app/(dashboard)/recruit/pipeline/components/RecruitPipelineCard.tsx` (renders referral badges/verified org badge)
- `src/app/api/jobs/[id]/pipeline/candidates/[pcId]/route.ts` + `src/lib/agents/payout-trigger.ts` (milestone payout trigger)
- `src/app/api/public/leaderboard/route.ts` + `src/app/(public)/refer/page.tsx` + `src/components/marketing/PayoutTicker.tsx` (public referral leaderboard/ticker)
- `src/lib/agents/public-apply.ts` + `src/app/api/apply/route.ts` + `src/app/(public)/apply/[slug]/page.tsx` (referral token attribution at apply time)
- `src/app/api/admin/export/payouts/route.ts` + `src/app/api/admin/export/referrers/route.ts` (admin exports)
- `src/app/api/employees/refer/route.ts`, `src/app/api/employees/my-referrals/route.ts`, `src/lib/services/EmployeeService.ts` (legacy employee referral flow)
- `src/proxy.ts` (public API bypass currently allows `/api/refer/*` and `/api/candidate/*`)

### C. Session / Cookie Types Currently in Use

- `Supabase Auth cookies` (primary app session, read via `createSupabaseServerClient` and middleware)
- `referrer_session` (httpOnly cookie, standalone referral dashboard session)
  - Defined in `src/lib/referrers/session.ts`
  - Used by `/api/refer/dashboard/profile`, `/api/refer/links/generate`, `/api/refer/join`, `/api/refer/session/bootstrap`, magic-link consume flow
- `candidate_session` (httpOnly cookie, standalone candidate OTP session)
  - Defined in `src/lib/candidates/session.ts`
  - Used by `/api/candidate/otp/verify`, `/api/candidate/profile`, `/api/candidate/upload-resume`

---

## 2) Target State - One Unified App

- One auth model: all authenticated users (candidate, recruiter, company admin, external referrer) use Supabase Auth session only.
- WhatsApp is used for number verification only; it is not used for passwordless login/magic-link auth.
- Referral product UX is inside the authenticated dashboard shell (primary path: `/dashboard/referrer` and candidate surfaces).
- External referrers follow: `/register` -> authenticated session -> `/refer/join` (onboarding) -> `/dashboard/referrer`.
- Referral attribution, payouts, and recruiter visibility remain in existing shared data model (`applications`, `referral_links`, `payout_ledger`), but session/auth handling is unified.

---

## 3) Merge Table - Every Referral-System File

| File                                                   | Action     | Target                                     | Notes                                                                                         |
| ------------------------------------------------------ | ---------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `src/app/(public)/refer/page.tsx`                      | KEEP       | same path                                  | Keep as marketing top-of-funnel page; CTA routes to `/register` and authenticated onboarding. |
| `src/app/(public)/refer/login/page.tsx`                | REDIRECT   | `/register` (temp) then `/login`           | WhatsApp login removed; page becomes obsolete.                                                |
| `src/app/(public)/refer/auth/page.tsx`                 | DELETE     | n/a                                        | Magic-link token exchange page no longer needed.                                              |
| `src/app/(public)/refer/join/page.tsx`                 | MERGE INTO | same path (auth-gated)                     | Keep onboarding UI, but require Supabase session; remove anonymous branch.                    |
| `src/app/(public)/refer/join/layout.tsx`               | KEEP       | same path                                  | Metadata/layout remains valid.                                                                |
| `src/app/(public)/refer/dashboard/page.tsx`            | REDIRECT   | `/dashboard/referrer`                      | Public dashboard replaced by authenticated dashboard shell route.                             |
| `src/app/(public)/refer/dashboard/layout.tsx`          | DELETE     | n/a                                        | Not needed once page redirects.                                                               |
| `src/app/(dashboard)/dashboard/referrer/page.tsx`      | KEEP       | same path                                  | Becomes canonical referrer dashboard UI.                                                      |
| `src/app/(dashboard)/dashboard/referrer/join/page.tsx` | REDIRECT   | `/refer/join`                              | Keep short-term for backward compatibility.                                                   |
| `src/app/api/refer/join/route.ts`                      | MERGE INTO | same path                                  | Convert from cookie/public hybrid to Supabase-auth-first onboarding endpoint.                 |
| `src/app/api/refer/otp/send/route.ts`                  | KEEP       | same path                                  | Keep OTP send for verification only.                                                          |
| `src/app/api/refer/otp/verify/route.ts`                | KEEP       | same path                                  | Keep authenticated verify endpoint; this is the canonical verification endpoint.              |
| `src/app/api/refer/otp/verify-public/route.ts`         | DELETE     | use `/api/refer/otp/verify`                | Public verification path removed.                                                             |
| `src/app/api/refer/links/generate/route.ts`            | MERGE INTO | same path                                  | Replace `referrer_session` check with auth-context referrer resolution.                       |
| `src/app/api/refer/links/route.ts`                     | DELETE     | use `/api/refer/links/generate`            | Duplicate/legacy endpoint with slug + body referrer id.                                       |
| `src/app/api/refer/jobs/open/route.ts`                 | KEEP       | same path                                  | Keep as open jobs source for referral onboarding/dashboard.                                   |
| `src/app/api/refer/open-jobs/route.ts`                 | DELETE     | use `/api/refer/jobs/open`                 | Duplicate legacy API.                                                                         |
| `src/app/api/refer/dashboard/profile/route.ts`         | MERGE INTO | same path or `/api/referrer/profile`       | Must resolve referrer by authenticated user, not by cookie.                                   |
| `src/app/api/refer/session/bootstrap/route.ts`         | DELETE     | n/a                                        | Only exists to bridge Supabase session to referrer cookie.                                    |
| `src/app/api/refer/magic-link/send/route.ts`           | DELETE     | n/a                                        | WhatsApp magic-link login removed.                                                            |
| `src/app/api/refer/magic-link/consume/route.ts`        | DELETE     | n/a                                        | Magic-link token consume removed.                                                             |
| `src/app/api/referrer/profile/route.ts`                | DELETE     | use unified `/api/refer/dashboard/profile` | Overlapping legacy endpoint; remove to avoid dual API contracts.                              |
| `src/lib/referrers/session.ts`                         | DELETE     | n/a                                        | `referrer_session` cookie helper removed.                                                     |
| `src/lib/referrers/normalize-whatsapp.ts`              | KEEP       | same path                                  | Shared normalizer is still needed.                                                            |
| `src/lib/referrers/referral-link-mint.ts`              | KEEP       | same path                                  | Token/origin utility still used for link generation.                                          |
| `src/lib/services/referrer-otp.ts`                     | KEEP       | same path                                  | Keep OTP issue/consume/verify logic (verification-only semantics).                            |
| `src/lib/services/referrer-magic-link.ts`              | DELETE     | n/a                                        | Magic-link flow retired.                                                                      |

---

## 4) Build List - New Work Required

### Must Build

1. Candidate profile WhatsApp verification UX in `/candidate/profile`

- Add explicit `Send OTP` + `Verify OTP` actions tied to `referrerWhatsapp`.
- Prevent link generation from candidate job cards until `whatsapp_verified = true`.
- Persist verification state refresh from `/api/profiles`.

2. Company email domain settings in `/company/settings`

- Add editable `email_domain` field UI under company settings.
- Extend backend schema validation and PATCH handling:
  - `src/lib/validations/organisations.ts` (`updateOrganisationSchema`)
  - `src/app/api/organisations/route.ts` (PATCH write path)
- Validate domain format and normalize lowercase.

### High-Value Gaps to Close

3. Referrer dashboard data endpoint auth unification

- Update `/api/refer/dashboard/profile` to resolve referrer via `getAuthContext()` and linked user/candidate.
- Remove dependency on `referrer_session`.

4. Candidate cookie-session cleanup

- Replace `candidate_session` checks in:
  - `/api/candidate/profile`
  - `/api/candidate/upload-resume`
  - `/api/candidate/otp/verify`
- Use Supabase Auth context and candidate lookup by `user_id`.

5. External referrer registration path

- Ensure `/register` supports non-candidate referrer entry (individual/agency).
- On successful register, route to `/refer/join` onboarding.

6. Optional but recommended

- Add idempotent data migration to backfill `referrers.user_id` from existing candidate/user links where null.

---

## 5) Delete List - Files to Remove

### Public Pages / UX

- `src/app/(public)/refer/auth/page.tsx`
- `src/app/(public)/refer/dashboard/layout.tsx` (after dashboard page is redirect-only)

### Duplicate / Legacy API Routes

- `src/app/api/refer/otp/verify-public/route.ts`
- `src/app/api/refer/links/route.ts`
- `src/app/api/refer/open-jobs/route.ts`
- `src/app/api/refer/session/bootstrap/route.ts`
- `src/app/api/refer/magic-link/send/route.ts`
- `src/app/api/refer/magic-link/consume/route.ts`
- `src/app/api/referrer/profile/route.ts`

### Session / Magic-Link Helpers

- `src/lib/referrers/session.ts`
- `src/lib/services/referrer-magic-link.ts`

### Candidate Cookie Helpers (post-auth unification)

- `src/lib/candidates/session.ts`

### DB Objects to Drop After Migration

- `referrer_magic_links` table (drop after route/service removal and cooldown period)

---

## 6) Redirect List - URL Migrations

| Old URL                       | New URL                        | Type                                                                                |
| ----------------------------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| `/refer/login`                | `/register`                    | Temporary (302) during rollout; later 301 to `/login` if register-first is complete |
| `/refer/auth`                 | `/login`                       | Permanent (301)                                                                     |
| `/refer/dashboard`            | `/dashboard/referrer`          | Permanent (301)                                                                     |
| `/dashboard/referrer/join`    | `/refer/join`                  | Permanent (301)                                                                     |
| `/api/refer/open-jobs?slug=*` | `/api/refer/jobs/open`         | Temporary (307) while clients migrate                                               |
| `/api/refer/links`            | `/api/refer/links/generate`    | Temporary (307) while clients migrate                                               |
| `/api/referrer/profile`       | `/api/refer/dashboard/profile` | Temporary (307) then remove                                                         |

Notes:

- API redirects should be short-lived and replaced by client updates quickly.
- Page redirects can be long-lived for SEO and user bookmarks.

---

## 7) DB Changes Required

### New / Altered

1. Enforce unified identity on `referrers`

- Target: `referrers.user_id` required for active referrers.
- Add migration sequence:
  - Backfill `user_id` where derivable.
  - Add constraint for future rows (`status = 'active'` implies `user_id IS NOT NULL`), then full `NOT NULL` when safe.

2. Keep and actively use `organisations.email_domain`

- No new column needed (already exists).
- Required: product settings UI + server update path.

3. Preserve current attribution and payout columns

- Keep:
  - `applications.referral_link_id`
  - `applications.direct_referrer_id`
  - `applications.parent_referrer_id`
  - `applications.source`
  - `job_referral_config.*`
  - `payout_ledger.*`

### Drop / Decommission

4. Drop `referrer_magic_links` table after endpoint removal and grace period.

### Constraint / Index Checks

5. Keep uniqueness constraints:

- `idx_referrers_whatsapp_unique`
- `idx_referral_links_referrer_job`
- `idx_referrers_user_id_unique`

6. Verify `referrers.type` enum/check currently aligned with target (`individual | agency | candidate`) and update if required by business rule changes.

---

## 8) Auth Changes - Exact Layer Changes

### Cookie Checks to Remove

- Remove all usage of `referrer_session`:
  - `src/app/api/refer/dashboard/profile/route.ts`
  - `src/app/api/refer/links/generate/route.ts`
  - `src/app/api/refer/join/route.ts`
  - `src/app/api/refer/session/bootstrap/route.ts` (delete)
  - magic-link consume flow (delete)

- Remove all usage of `candidate_session`:
  - `src/app/api/candidate/profile/route.ts`
  - `src/app/api/candidate/upload-resume/route.ts`
  - `src/app/api/candidate/otp/verify/route.ts`

### Routes That Must Use `getAuthContext()`

- `/api/refer/dashboard/profile`
- `/api/refer/links/generate`
- `/api/refer/join` (for authenticated profile ownership updates)
- `/api/candidate/profile`
- `/api/candidate/upload-resume`
- `/api/candidate/otp/verify` (or retire route if candidate OTP is fully replaced)

### Proxy / Middleware Rules to Change

In `src/proxy.ts`:

- Remove broad public bypass for:
  - `/api/refer/`
  - `/api/candidate/`

- Replace with explicit public allowlist only for endpoints that remain anonymous:
  - `/api/public/leaderboard`
  - (optional) `/api/refer/jobs/open` if onboarding pre-auth needs open job browsing
  - `/api/refer/otp/send` only if pre-auth OTP request remains supported

Everything else should require Supabase session via middleware + route auth checks.

---

## 9) WhatsApp Changes - Verification Only

### Templates/Flows to Keep

- Keep OTP template `th_referrer_otp`.
- Keep fallback WhatsApp text send path for OTP delivery failures.

### Flows to Change

- Referral WhatsApp usage:
  - stays for verification (`send OTP` / `verify OTP`)
  - stays for referral sharing UX links (`wa.me` share)
  - remove as authentication transport.

- Candidate OTP currently reuses `referrer_otp` table:
  - keep short-term for compatibility
  - medium-term: move to role-agnostic OTP verification table/service to avoid semantic coupling.

### Flows to Remove

- Magic-link login via WhatsApp:
  - remove `th_referrer_magic_link` template usage
  - remove `referrer_magic_links` token lifecycle
  - remove `/refer/login` + `/refer/auth` + `/api/refer/magic-link/*` flow

---

## 10) Testing Checklist - End-to-End Post-Merge

### Core Product Flows

- [ ] Candidate registers (Supabase Auth) -> lands in dashboard -> browses jobs -> applies -> tracks application status.
- [ ] Candidate opens `/candidate/profile` -> adds WhatsApp -> requests OTP -> verifies OTP -> becomes verified referrer.
- [ ] Verified candidate generates referral links from:
  - `/candidate/jobs` quick actions
  - `/dashboard/referrer` link manager
- [ ] Referred applicant applies with `?ref=` token -> attribution persists in `applications` columns.

### Recruiter/Pipeline/Payout Flows

- [ ] Recruiter pipeline card shows referrer badge/type and verified-org badge when applicable.
- [ ] Status transition to shortlisted/hired triggers payout logic through `triggerPayoutIfEligible`.
- [ ] `payout_ledger` rows generated idempotently (no duplicates on repeated status updates).
- [ ] Admin payout/referrer exports still include expected referral and payout data.

### External Referrer Flow

- [ ] External freelancer/agency user registers via `/register`.
- [ ] After auth, user completes `/refer/join`.
- [ ] User verifies WhatsApp via OTP.
- [ ] User generates links and shares.
- [ ] Dashboard is only `/dashboard/referrer` (no dependency on `referrer_session`).

### Auth/Session Hardening

- [ ] No route in referral journey depends on `referrer_session`.
- [ ] No route in candidate journey depends on `candidate_session`.
- [ ] Middleware/proxy blocks protected referral/candidate endpoints when unauthenticated.
- [ ] Public allowlist includes only intentional anonymous endpoints.

### Redirect/Legacy Compatibility

- [ ] `/refer/login` redirects as defined.
- [ ] `/refer/auth` redirects as defined.
- [ ] `/refer/dashboard` redirects to `/dashboard/referrer`.
- [ ] API legacy redirects function during rollout window, then clients are migrated off.

---

## Execution Order (Recommended)

1. Auth layer + proxy tightening (remove cookie dependency in code paths, keep feature behavior unchanged).
2. Dashboard/API consolidation (`/dashboard/referrer` + `/api/refer/dashboard/profile` canonical).
3. WhatsApp auth deprecation (remove magic-link routes/pages/services/templates).
4. Company email domain settings build and org verification completion.
5. Redirect rollout + cleanup deletions.
6. DB cleanup migration (`referrer_magic_links` drop, final identity constraints).

This document is the source of truth for the referral-system merge implementation.
