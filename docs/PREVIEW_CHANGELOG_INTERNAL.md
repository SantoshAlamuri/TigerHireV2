# Preview Changelog (Internal: Eng + Founder Thread)

**Date:** 2026-04-21 | **Preview target:** 2026-04-25

## TL;DR

- Three hardening blocks shipped in four days: reliability (no more cron dogpile, graceful AI outages), security (brute-force + spam-reset + upload + rate-limit), and observability (we can see what's happening in prod).
- The demo centerpiece is live: candidates now show **why** they scored what they did - rubric, evidence, provenance hash.
- SAML / SCIM / Naukri remain deferred by design; substitutes in place (OAuth hardening, JIT provisioning, multi-source intake on roadmap).
- Four items left on the queue; two ship before preview, two defer.

## Reliability

- Added a DB-backed cron lease mutex for `score-batch` so overlapping cron runners now safely skip instead of double-processing the queue (`src/lib/security/cron-lease.ts`, `src/app/api/cron/score-batch/route.ts`, `supabase/migrations/20260420123000_cron_job_leases.sql`).
- Wrapped Anthropic score-time calls in a resilient circuit-breaker path with retries/timeouts so transient model-provider failures degrade gracefully (`src/lib/services/anthropic.ts`, `src/lib/services/anthropic-circuit.ts`, `src/lib/utils/retry.ts`).
- Added deferred scoring fallback states so candidate scoring can complete asynchronously when upstream provider pressure or timeout conditions are detected (`src/lib/services/FitScoreService.ts`, `src/lib/fitscore/hybrid/persist.ts`, `supabase/migrations/20260420140500_fit_scores_scoring_status.sql`).

## Security

- Implemented login lockout with cooldown windows to reduce brute-force risk while preserving normal user recovery flow (`src/lib/security/auth-throttle.ts`, `src/app/api/auth/login/route.ts`, `supabase/migrations/20260420131500_auth_lockout_and_reset_cooldown.sql`).
- Added password-reset cooldown enforcement to block reset-spam/flood loops on repeated forgot-password attempts (`src/app/api/auth/forgot-password/route.ts`, `src/lib/security/auth-throttle.ts`).
- Normalized high-impact mutation rate limiting toward scoped keys to reduce cross-tenant/noisy-neighbor contention (`src/lib/security/rate-limit.ts`, `src/app/api/candidates/upload-resume/route.ts`, `src/app/api/jobs/upload-jd/route.ts`, `src/app/api/fit-score/route.ts`, `src/app/api/fitscore/score/route.ts`, `src/app/api/fitscore/batch/route.ts`).
- Added an OAuth domain whitelist regression test so verified-domain enforcement remains protected across auth-flow changes (`tests/unit/auth-callback-route.test.ts`).
- Hardened resume upload validation with byte-level content sniffing so declared MIME type must match actual file signature (`src/app/api/candidates/upload-resume/route.ts`, `tests/unit/candidates-upload-resume-route.test.ts`).
- Tightened Zod bounds across auth/profile/contact/org validation paths to cap untrusted payload size and shape (`src/lib/validations/auth.ts`, `src/lib/validations/candidates.ts`, `src/lib/validations/contact.ts`, `src/lib/validations/organisations.ts`).

## Observability

- Added incident-oriented production breadcrumbs in monitoring error reporting so scoring/auth failures are easier to reconstruct during triage (`src/lib/observability/report-error.ts`, `src/lib/observability/sentry.ts`, `sentry.server.config.ts`).
- Added persistent LLM telemetry logging for score-generation calls to support replay, auditability, and postmortem analysis (`src/lib/observability/llm-call-log.ts`, `supabase/migrations/20260420145500_llm_call_logs.sql`).
- Expanded request latency instrumentation on key API surfaces so slow-path detection is visible before preview incidents escalate (`src/proxy.ts`, `src/app/api/fit-score/route.ts`, `src/app/api/fitscore/score/route.ts`, `src/app/api/fitscore/batch/route.ts`).
- Added saved preview SQL query references for fast operational checks during demos and incident response (`docs/OBSERVABILITY_PREVIEW_QUERIES.md`).

## Preview UX

- Shipped a FitScore Reasoning Panel that exposes rubric/evidence context directly on candidate detail for faster recruiter trust checks (`src/components/dashboard/FitScoreReasoningPanel.tsx`, `src/components/dashboard/FitScoreHero.tsx`, `src/app/(dashboard)/recruit/candidates/[id]/page.tsx`).
- Added pipeline hover-card score context so recruiters can inspect fit rationale without leaving list flow (`src/components/dashboard/FitScoreHoverCard.tsx`, `src/app/(dashboard)/recruit/pipeline/components/RecruitPipelineCard.tsx`).
- Added explicit deferred-state handling in score presentation so in-progress scoring is visible and non-blocking rather than silently missing (`src/lib/services/FitScoreService.ts`, `src/lib/fitscore/hybrid/persist.ts`).
- Added parse-quality warning behavior to surface low-confidence extraction outcomes before recruiters act on weak document signal (`src/components/dashboard/FitScoreReasoningPanel.tsx`, `src/types/index.ts`).

## What's still on the queue before preview

**Status: on track.** ~2 engineer-days of work remaining across these four items; two ship before preview (loading states, JD bias v0), two defer post-preview (bulk/CSV, boolean search only if time).

- **Loading states on money pages**: ship now as the lowest-effort/highest-perceived-speed win, with route-level loading boundaries already started in this branch (`src/app/(dashboard)/recruit/loading.tsx`, `src/app/(dashboard)/recruit/jobs/[id]/loading.tsx`, `src/app/(dashboard)/recruit/candidates/[id]/loading.tsx`).
- **JD bias detector v0**: ship before preview as a small, high-leverage trust narrative addition that fits the remaining timeline.
- **Boolean search**: keep as conditional/maybe and only ship if Reasoning Panel polish and score-state QA are already complete.
- **Bulk actions + CSV export**: defer to post-preview week since it is useful but not demo-critical for explainability-led conversations.
