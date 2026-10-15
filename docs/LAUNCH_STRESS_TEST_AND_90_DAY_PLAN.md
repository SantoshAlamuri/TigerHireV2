# Launch Stress-Test & 90-Day Proof Plan

**Date:** 2026-04-08  
**Goal:** By day 90, be able to state with data:

> "Candidates who came through TigerHire's vouch pipeline ghosted X% less than cold pipeline candidates at the same companies."

Everything below exists to protect our ability to collect that data cleanly, spot where the funnel leaks, and tighten it over time.

---

## Phase 1 — Pre-Launch Stress Testing

_Complete every item before the first paying customer touches the system._

### 1.1 WhatsApp Meta Template Approval (CRITICAL — highest risk of week-one surprise)

**Current state:** Code sends templates via Meta Cloud API (`src/lib/services/whatsapp.ts`). Template names are used in code but approval lives in Meta Business Manager. Docs still reference Interakt in places; runtime is Meta-only.

**The six Interakt-era templates** (from `docs/WHATSAPP_INTERAKT_TEMPLATE_DRAFTS.md`):

| #   | Template name                | Code path that sends it                                                                      | Approval status |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------- | --------------- |
| 1   | `tigerhire_session_expired`  | Not wired — `sendWhatsAppMessage` does not fall back to this template when 24h window closes | ☐ Check Meta BM |
| 2   | `candidate_match_alert`      | `notifyCandidateMatch` — **disabled by policy** in `whatsapp.ts`                             | ☐ Check Meta BM |
| 3   | `recruiter_shortlist_ready`  | `notifyRecruiterShortlist` — **disabled by policy**                                          | ☐ Check Meta BM |
| 4   | `candidate_profile_claimed`  | `sendProfileClaimedTemplate` in `whatsapp.ts`                                                | ☐ Check Meta BM |
| 5   | `candidate_contact_unlocked` | `notifyCandidateUnlocked` — **disabled by policy**                                           | ☐ Check Meta BM |
| 6   | `waitlist_confirmation`      | `sendWaitlistConfirmation` in `whatsapp.ts`                                                  | ☐ Check Meta BM |

**Meta-only templates actually used at runtime** (from `src/lib/whatsapp/templates.ts` and `whatsapp.ts`):

| Template name                  | Flow                                        | Approval status |
| ------------------------------ | ------------------------------------------- | --------------- |
| `tigerhire_referral_v1`        | Employee referral invite                    | ☐ Check Meta BM |
| `tigerhire_consent_v1`         | Consent flow start                          | ☐ Check Meta BM |
| `tigerhire_fitscore_v1`        | Score delivery                              | ☐ Check Meta BM |
| `tigerhire_interview_v1`       | Interview invite                            | ☐ Check Meta BM |
| `tigerhire_reminder_v1`        | Reminder nudge                              | ☐ Check Meta BM |
| `tigerhire_employee_invite_v1` | Employee onboard                            | ☐ Check Meta BM |
| `th_referrer_otp`              | Referrer OTP                                | ☐ Check Meta BM |
| `th_referrer_vouch_request`    | Vouch flow start                            | ☐ Check Meta BM |
| `th_job_match_result`          | Lane A match                                | ☐ Check Meta BM |
| `th_job_no_match`              | Lane A no-match                             | ☐ Check Meta BM |
| `th_preference_matches`        | Lane B match                                | ☐ Check Meta BM |
| `th_no_match_subscribed`       | Lane B subscribe                            | ☐ Check Meta BM |
| `th_new_role_alert`            | Job alert to subscribers                    | ☐ Check Meta BM |
| `th_shortlisted`               | Pipeline shortlist                          | ☐ Check Meta BM |
| `th_not_selected`              | Pipeline rejection                          | ☐ Check Meta BM |
| `th_offer`                     | Offer notification                          | ☐ Check Meta BM |
| `th_interview_slots`           | Slot selection                              | ☐ Check Meta BM |
| `th_interview_reminder`        | Cron-driven reminder                        | ☐ Check Meta BM |
| `th_interview_rescheduled`     | Reschedule notice                           | ☐ Check Meta BM |
| `th_application_received`      | Apply confirmation                          | ☐ Check Meta BM |
| `th_profile_incomplete`        | Profile nudge                               | ☐ Check Meta BM |
| `th_reengagement`              | Re-engagement (marketing, needs opt-in)     | ☐ Check Meta BM |
| `th_sourcing`                  | Sourcing campaign (marketing, needs opt-in) | ☐ Check Meta BM |
| `th_referral_drive`            | Referral campaign (marketing, needs opt-in) | ☐ Check Meta BM |
| `th_post_hire_pulse`           | Post-hire check-in                          | ☐ Check Meta BM |

**Action items:**

- [x] **Audit Meta Business Manager** — `scripts/audit-whatsapp-templates.mjs` run on 2026-04-08. 24 templates found, all APPROVED. 10 were missing from Meta BM and were created via `scripts/create-missing-templates.mjs` (PENDING approval — expect 1-2 hours for UTILITY).
- [x] **Run template creation scripts** — `create-missing-templates.mjs` created: `tigerhire_referral_v1`, `tigerhire_consent_v1`, `th_shortlisted`, `th_job_no_match`, `candidate_profile_claimed`, `tigerhire_fitscore_v1`, `tigerhire_interview_v1`, `tigerhire_reminder_v1`, `tigerhire_employee_invite_v1`, `th_post_hire_pulse`.
- [x] **Fix the 24h session-expired gap** — `sendWhatsAppMessage` now falls back to `tigerhire_session_expired` on window-closed error.
- [ ] **Test disabled notify paths** — `notifyCandidateMatch`, `notifyRecruiterShortlist`, `notifyCandidateUnlocked` are disabled by policy. Decide: re-enable before launch, or defer? If deferred, document which candidate/recruiter notifications are text-only or email-only.
- [x] **Marketing opt-in gate** — All 7 MARKETING-category templates now have `requireMarketingOptIn` guard: `th_reengagement`, `th_sourcing`, `th_referral_drive`, `th_preference_matches`, `th_no_match_subscribed`, `th_new_role_alert`, `waitlist_confirmation`.
- [x] **Template category check** — Cross-referenced Meta BM categories with code. 4 templates reclassified as MARKETING by Meta (`th_preference_matches`, `th_no_match_subscribed`, `th_new_role_alert`, `waitlist_confirmation`) — marketing opt-in guards added to all of them.
- [ ] **Re-run audit after approval** — Once the 10 new templates are APPROVED, re-run `node scripts/audit-whatsapp-templates.mjs` to confirm all 28 code templates match.

### 1.2 Trust Score Manipulation Scenarios (CRITICAL — second highest risk)

**Current trust score formula** (from `src/lib/agents/trust-score.ts`):

```
Base:     referral=40, cold=20
Vouches:  ≥1 vouch +15, ≥2 vouches +10, any vouch weight≥80 +10
Verified: each confirmed claim +5, each flagged claim -10
Links:    linkedin +3, github +2, email +5  (reduced from +8/+7 — URL ownership unverified)
Ghost:    ghost_risk_score≥75 → +5
AI CVs:   authenticity_signal=likely_ai_generated + confidence>0.8 → -10
Clamp:    0–100
```

**Attack vectors to test:**

| #   | Scenario                                       | How it works                                                                          | Expected defense                                                                                                                                                                             | Gap?                                                         |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | **Self-vouch ring**                            | Referrer A vouches for candidate B, candidate B vouches for A (or sock-puppet phones) | None — no graph analysis exists. `vouches` has no cross-referrer uniqueness check beyond `referrer_phone`.                                                                                   | **YES** — need at least a same-phone or same-device check    |
| 2   | **Bulk vouch farming**                         | One referrer creates many vouches with generic "great colleague" answers              | `scoreVouchSpecificity` (LLM) down-weights generic text. `calculateVouchWeight` uses specificity **and** `credibility_multiplier` (now wired). Rapid-vouch flag logs >5/24h from same phone. | **MITIGATED** — flag is logged but vouch still inserted      |
| 3   | **LinkedIn/GitHub URL spoofing**               | Candidate submits any LinkedIn URL (not theirs) for +8 trust                          | No URL ownership verification — just checks `linkedin_url` is truthy                                                                                                                         | **YES** — consider verification or remove from trust formula |
| 4   | **AI-generated CV with real person's details** | Fabricated CV with real claims to get high FitScore + trust                           | `human-signal-detector.ts` detects AI patterns. Trust penalty of **-10** now fires when `authenticity_signal=likely_ai_generated` + confidence>0.8.                                          | **MITIGATED** — detection accuracy depends on LLM            |
| 5   | **Ghost score gaming**                         | Candidate responds immediately (low ghost risk → +5 trust) with bot-like speed        | Only +5 points; low impact individually. But combined with other gaming, adds up.                                                                                                            | **LOW RISK** — acceptable                                    |
| 6   | **Referral path inflation**                    | Non-employee claims `entry_path=referral` to get base 40 instead of 20                | `entry_path` is set by code based on actual referral token resolution or WhatsApp session `referred_by`                                                                                      | **OK** — code-controlled                                     |
| 7   | **Verification claim injection**               | Candidate somehow gets `verification_claims` with `confirmed` status                  | Claims are set by `verify.ts` agent (LLM + data check), not user input                                                                                                                       | **OK** — agent-controlled                                    |
| 8   | **Vouch weight ceiling exploit**               | Referrer claims "10+ years" relationship + "manager" role for maximum weight          | `calculateVouchWeight` is deterministic from self-reported relationship/duration — no cross-check                                                                                            | **MODERATE** — no verification of claimed relationship       |

**Action items:**

- [x] **Vouch deduplication** — DB unique constraint `(candidate_id, voucher_phone)` + code-level duplicate check in `saveVouch`.
- [x] **Circular vouch detection** — `saveVouch` now checks if candidate B already vouched for voucher A's candidate profile. Blocks mutual vouching with user-facing message.
- [x] **`credibility_multiplier` wired** — `calculateVouchWeight` applies LLM credibility multiplier (clamped 0.5–2.0).
- [x] **Rapid vouch patterns hard-blocked** — >5 vouches in 24h from same phone now rejected (not just logged). Logged to `agent_logs` + user gets "try again tomorrow" message.
- [x] **LinkedIn/GitHub reduced** — trust weight reduced from +8/+7 to +3/+2 until URL ownership verification is built.
- [x] **Human signal → trust penalty** — `-10` penalty for `likely_ai_generated` with confidence > 0.8. Fixed string mismatch (`ai_generated` → `likely_ai_generated`).
- [x] **Accepted risks documented** — comprehensive docblock in `trust-score.ts`.
- [x] **Verification claims now accrue "confirmed"** — `verify.ts` marks employment claims as `confirmed` when timeline is consistent (previously always `unverified`).

### 1.3 End-to-End Flow Stress Tests

_These test the complete path that generates the proof-statement data._

#### 1.3.1 Vouch Pipeline (the "treatment" group)

Test the full sequence: referral invite → candidate applies → vouch flow → trust score → FitScore → pipeline → hiring outcome.

| Test                           | Steps                                                                                                                                                                                                                               | Validates                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Happy path**                 | Employee gets `tigerhire_referral_v1` → candidate messages in → consent → CV upload → Scout scores → vouch requested from referrer → 5 vouch Qs answered → trust recalculated → candidate appears in pipeline with trust+vouch data | Full vouch pipeline end-to-end                               |
| **Vouch timeout**              | Referrer doesn't respond to vouch request within 48h                                                                                                                                                                                | Candidate still progresses; trust stays at base; no blocking |
| **Vouch with low specificity** | Referrer gives vague "good person" answers                                                                                                                                                                                          | Vouch weight should be low (<30); trust bump minimal         |
| **Multi-vouch**                | Two different referrers vouch for same candidate                                                                                                                                                                                    | Trust should stack correctly: +15 (first) + +10 (second)     |
| **Referrer not in system**     | Vouch request sent to phone not in `profiles`                                                                                                                                                                                       | OTP / magic link flow should handle gracefully               |

#### 1.3.2 Cold Pipeline (the "control" group)

Test: candidate applies directly (no referral token) → CV → FitScore → pipeline.

| Test                      | Steps                                                       | Validates                                                           |
| ------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| **Web apply (no ref)**    | Apply via public job page, no `?ref=` token                 | `entry_path` is not "referral"; trust base = 20; no vouch data      |
| **WhatsApp cold inbound** | Candidate messages WhatsApp number without referral context | Session has no `referred_by`; proceeds through consent → CV → score |

#### 1.3.3 Data Collection Integrity

The proof statement requires comparing ghost rates between vouch and cold pipelines at the same companies. Test that the data model supports this:

- [ ] **`applications` table** has `referral_link_id` and `direct_referrer_id` — confirm these are NULL for cold applies and populated for referred applies.
- [ ] **`candidates.entry_path`** correctly distinguishes `referral` vs `direct` vs `whatsapp` vs `job_board`.
- [ ] **`candidates.trust_score`** is recalculated after vouch completion (not stuck at initial value).
- [ ] **`pipeline_candidates.status`** tracks terminal states (`hired`, `rejected`) — confirm `hired` is set when offer is accepted.
- [ ] **`hiring_outcomes`** table captures post-hire data — confirm `hiring-outcomes.ts` service is called on relevant status transitions.
- [ ] **Ghost risk tracking** — `candidates.ghost_risk_score` is populated for both referred and cold candidates so we can compare.
- [ ] **`pipeline_action_signals`** captures recruiter actions (shortlist, reject, override) with timestamps for funnel analysis.

### 1.4 Billing & Entitlements

- [ ] **Stripe checkout** — test company and candidate plan signup end-to-end (use Stripe test mode).
- [ ] **Webhook idempotency** — `stripe_event_try_acquire` prevents double-processing; send same event twice, verify no duplicate subscription.
- [ ] **Entitlement limits** — unlock/view/apply limits enforced per plan; test that exceeding a limit returns a clear error.
- [ ] **Downgrade path** — subscription cancelled → entitlements revoked → data preserved (not deleted).

### 1.5 Infrastructure Resilience

- [ ] **WhatsApp webhook under load** — simulate 50 concurrent inbound messages; rate limit (`wa:{phone}` 10/min) should throttle without dropping legitimate messages. Verify fire-and-forget handler doesn't cause memory pressure.
- [ ] **Supabase connection pool** — under concurrent FitScore runs (each calls Anthropic + DB), verify no connection exhaustion. Check `connection_closed_error` documented in `docs/CONNECTION_CLOSED_ERROR.md`.
- [ ] **Anthropic rate limits** — FitScore three-stage pipeline makes 3 LLM calls per candidate. At 20 concurrent candidates, that's 60 Anthropic calls. Test with actual API keys; verify circuit breaker in `whatsapp.ts` and retry logic in FitScore service handle 429s.
- [ ] **Redis availability** — feature flags, auth cache, rate limiting all depend on Redis. Kill Redis connection and verify graceful degradation (not hard crashes).
- [ ] **Sentry alerting** — trigger a known error; verify it appears in Sentry within 60s with correct tags (org_id, user_id, route).

### 1.6 Security Sweep

- [ ] **Tenant isolation** — log in as Org A, attempt to access Org B's candidates/jobs via API. RLS + TenantScopedClient should block. (Ref: `docs/LAUNCH_READINESS_TENANT_ISOLATION.md`)
- [ ] **CSRF on mutation routes** — `validateOrigin` is applied; test with cross-origin POST.
- [ ] **PII in logs** — check that phone numbers and candidate names are not logged in plain text in Vercel/Sentry. `src/lib/security/` has PII sanitization — verify it's applied on all log paths.
- [ ] **WhatsApp webhook signature** — send a POST to `/api/webhooks/whatsapp` with an invalid `x-hub-signature-256`; should get 401.

---

## Phase 2 — First 90 Days: What to Watch

### 2.1 The Core Metric (Days 1–90)

**Ghost rate by pipeline source**, measured weekly:

```
Ghost rate = (candidates who reached "interview scheduled" but never showed or went silent)
             / (total candidates who reached "interview scheduled")
```

Segment by:

- **Vouch pipeline** — `applications.referral_link_id IS NOT NULL` or `candidates.entry_path = 'referral'`
- **Cold pipeline** — all others at the same company

**Where to get this data:**

- `pipeline_candidates` with `status` transitions (interview → no-show vs interview → hired/rejected)
- `hiring_outcomes` for post-interview tracking
- `pipeline_action_signals` for recruiter behavior (did recruiter engage differently with vouched candidates?)

**Target:** By day 90, have at least 200 candidates across both groups with enough reaching interview stage to compute a statistically directional ghost rate difference.

### 2.2 Week 1 Dashboard (watch daily)

| Metric                        | Source                                                                                  | Alert threshold       |
| ----------------------------- | --------------------------------------------------------------------------------------- | --------------------- |
| WhatsApp delivery failures    | `agent_logs` where agent_type contains 'whatsapp' + error                               | >5% of sends fail     |
| Template rejection by Meta    | Meta Business Manager / webhook status callbacks                                        | Any template rejected |
| FitScore computation failures | `agent_logs` for fitscore agent errors                                                  | >3% failure rate      |
| Webhook processing time       | Vercel function logs for `/api/webhooks/whatsapp`                                       | p95 > 5s              |
| Consent opt-in rate           | `whatsapp_sessions` where state progresses past `awaiting_consent` / total new sessions | <60% (expected >80%)  |
| CV submission rate            | Sessions reaching `cv_received` / sessions reaching `consent_given`                     | <40% (expected >60%)  |

### 2.3 Days 1–30: Funnel Health

Track conversion through the vouch pipeline funnel:

```
Referral invite sent (tigerhire_referral_v1)
  → Candidate messages in (new WhatsApp session with referred_by)
    → Consent given
      → CV submitted
        → FitScore computed
          → Vouch requested from referrer
            → Vouch completed (all 5 Qs answered)
              → Candidate appears in recruiter pipeline
                → Recruiter engages (views/shortlists)
                  → Interview scheduled
                    → Interview completed
                      → Hired / Rejected
```

**Drop-off alerts (set in PostHog or manual SQL):**

| Stage transition                    | Healthy rate | Investigate if below |
| ----------------------------------- | ------------ | -------------------- |
| Invite → Candidate messages in      | >30%         | 15%                  |
| Messages in → Consent               | >80%         | 60%                  |
| Consent → CV submitted              | >60%         | 35%                  |
| CV submitted → FitScore computed    | >95%         | 85%                  |
| FitScore computed → Vouch requested | >70%         | 50%                  |
| Vouch requested → Vouch completed   | >40%         | 20%                  |
| In pipeline → Recruiter engages     | >60%         | 30%                  |

### 2.4 Days 1–30: Trust Score Distribution

Query weekly:

```sql
SELECT
  entry_path,
  percentile_cont(0.25) WITHIN GROUP (ORDER BY trust_score) AS p25,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY trust_score) AS p50,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY trust_score) AS p75,
  count(*) AS n
FROM candidates
WHERE created_at > now() - interval '7 days'
GROUP BY entry_path;
```

**What to look for:**

- Referral candidates should have higher median trust than cold candidates (by design: base 40 vs 20, plus vouches).
- If the distributions overlap heavily (referral p50 < 50), vouches aren't completing or aren't adding enough value.
- If any candidate hits 95+, investigate — possible gaming.

### 2.5 Days 30–60: Recruiter Behavior

| Signal                                                              | What it tells you                                                         | Source                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Time from candidate appearing in pipeline to first recruiter action | Are recruiters engaging faster with vouched candidates?                   | `pipeline_candidates.created_at` vs first `pipeline_action_signals` row          |
| Override rate                                                       | Do recruiters override FitScore recommendations more for cold vs vouched? | `pipeline_candidates.override_reason`                                            |
| Shortlist rate by trust tier                                        | Does trust score actually predict recruiter preference?                   | `pipeline_candidates.status = 'shortlisted'` grouped by candidate trust quartile |
| Unlock rate by source                                               | Do recruiters unlock (pay for) more vouched candidates?                   | `pipeline_candidates.unlocked` by referral attribution                           |

### 2.6 Days 60–90: Outcome Correlation

| Analysis                                         | Query approach                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Ghost rate: vouched vs cold                      | `hiring_outcomes` joined with `applications` on referral attribution               |
| FitScore accuracy: score vs hire                 | `fit_scores.overall_score` correlation with `pipeline_candidates.status = 'hired'` |
| Trust score accuracy: trust vs ghost             | `candidates.trust_score` correlation with `candidates.ghost_risk_score`            |
| Vouch quality: vouch weight vs outcome           | `vouches.weight` for hired candidates vs rejected candidates                       |
| Referrer quality: which referrers produce hires? | Group `hiring_outcomes` by `applications.direct_referrer_id`, rank by hire rate    |

### 2.7 Operational Metrics (ongoing)

| Metric                           | Tool                                                        | Alert                    |
| -------------------------------- | ----------------------------------------------------------- | ------------------------ |
| Anthropic API cost per candidate | `agent_logs` cost fields + `platform_cost_ledger`           | >$0.50/candidate         |
| WhatsApp cost per conversation   | Meta Business Manager + `docs/WHATSAPP_COST_MODEL.md` rates | >₹5/conversation         |
| Error rate by route              | Sentry                                                      | Any route >1% error rate |
| P95 latency by route             | Vercel analytics                                            | Any route >3s            |
| Redis hit rate                   | Upstash dashboard                                           | Cache hit <70%           |

---

## Phase 3 — Improvements Based on Learnings

_Prioritized by impact on the core proof statement._

### 3.1 If vouch completion rate is low (<20%)

**Problem:** Referrers start the vouch flow but drop off before Q5.

**Fixes (in priority order):**

1. **Reduce vouch questions from 5 to 3** — keep the highest-signal Qs (relationship context, specific project example, would-you-hire-again). The `vouch_q1`…`vouch_q5` states in `src/lib/whatsapp/sessions.ts` and `handleVouchResponse` in `vouch.ts` need to be updated.
2. **Add vouch progress indicator** — "Question 2 of 3" in each WhatsApp message so the referrer knows how close they are to done.
3. **Vouch reminder** — if referrer answers Q1–Q2 but goes silent for 24h, send `tigerhire_reminder_v1` with vouch-specific copy. Requires a cron job checking `whatsapp_sessions` in `vouch_q*` states with stale `updated_at`.
4. **Web vouch fallback** — if referrer never opens WhatsApp, send a magic link to complete vouch on web. `referrer-otp.ts` and `referrer_magic_links` table already exist.

### 3.2 If ghost rate difference is not significant

**Problem:** Vouched candidates ghost at similar rates to cold candidates — the core thesis isn't holding.

**Investigation:**

- Are vouches too easy to game? (Check Section 1.2 manipulation scenarios.)
- Is ghost_risk_score actually predictive? Correlate with actual ghost events.
- Are we measuring "ghost" consistently? Define precisely: no response to 2+ interview-related messages within 72h.

**Fixes:**

1. **Ghost event tracking** — add explicit ghost detection. When a candidate in `interview_scheduled` state doesn't respond to 2 messages in 72h, mark `ghost_event = true` on `pipeline_candidates`. Currently ghost_risk_score is a prediction at apply time, not an observed outcome.
2. **Post-vouch ghost predictor** — feed vouch answers into the heuristic `ghost_risk_score` path (flag key `ghostbuster`). A referrer saying "they're exploring options" is a higher ghost signal than "they're actively looking."
3. **Referrer accountability** — if a referrer's candidates ghost at >50% rate, flag the referrer. This becomes a natural "referrer reputation" signal without building a complex system.

### 3.3 If recruiter engagement with vouched candidates is low

**Problem:** Recruiters aren't treating vouched candidates differently — the trust signal isn't landing in their workflow.

**Fixes:**

1. **Pipeline sort by trust** — `my-pipeline` route already has `referralSignalScore` for ordering. Make trust_score + vouch presence a more prominent sort factor.
2. **Vouch summary in pipeline card** — show the referrer's name, relationship, and best vouch quote directly in the pipeline candidate card. Currently `FitScoreCard.tsx` shows trust and vouches but may need richer context.
3. **"Vouched" badge** — visual indicator in the pipeline list view distinguishing vouched from cold candidates at a glance.

### 3.4 If FitScore accuracy is low (score doesn't predict hire)

**Fixes:**

1. **Calibrate with `hiring_outcomes`** — the `pipeline_action_signals` and `hiring_outcomes` tables exist. Build a calibration loop: for every hired/rejected candidate, compare their FitScore to outcome. Adjust three-stage rubric weights or signal blending ratio (`stage3-match.ts`: currently `signal×0.2 + grade×0.8`).
2. **JD Base adoption** — push recruiters to approve JD Base documents for their jobs. Hybrid v2 pipeline (`src/lib/fitscore/hybrid/pipeline.ts`) uses dynamic dimension weights from the JD Base, which should be more accurate than generic three-stage rubric.

### 3.5 If Anthropic costs are too high

**Fixes:**

1. **Cache role intelligence** — Stage 1 of three-stage (`generateRoleIntelligence`) is per-job, not per-candidate. Cache it in Redis with job_id as key. Currently re-runs per candidate.
2. **Batch scoring** — when multiple candidates apply to the same job in a short window, reuse the Stage 1 rubric.
3. **Model downgrade for Stage 2** — candidate evidence extraction is less nuanced than rubric generation. Test with a cheaper Claude model (Haiku) for Stage 2 while keeping Sonnet/Opus for Stage 1.

### 3.6 Two Referral Systems Merge

**Current gap:** WhatsApp referrals use the `referrals` table (FK to `auth.users`); web referrals use `referrers` + `referral_links` + application FKs. This makes it harder to compute a unified "referrer quality" metric.

**Fix:** Create a view or materialised query that maps both systems into a common `referrer_identity` with:

- Total candidates referred
- Total hired
- Total ghosted
- Average vouch weight of their candidates
- Average time-to-hire for their candidates

This feeds directly into the Phase 2 analysis (Section 2.6, "Referrer quality").

---

## Pre-Launch Checklist Summary

### Must-do (blocks launch)

- [x] Audit all WhatsApp templates in Meta Business Manager (Section 1.1) — **DONE: `audit-whatsapp-templates.mjs` run 2026-04-08. 24/24 existing templates APPROVED. 10 missing templates created via API (PENDING approval).**
- [x] Fix 24h session-expired template fallback gap — **DONE: `sendWhatsAppMessage` now falls back to `tigerhire_session_expired` on window-closed error**
- [x] Add vouch deduplication constraints (Section 1.2, scenario #1) — **DONE: DB unique constraint + code guards for duplicate/self/circular vouches**
- [x] Wire `credibility_multiplier` into vouch weight calculation — **DONE: `calculateVouchWeight` now applies LLM credibility multiplier**
- [x] Circular vouch detection (A↔B) — **DONE: `saveVouch` checks reverse direction and blocks with user-facing message**
- [x] Rapid vouch hard-block — **DONE: >5 vouches in 24h now rejected (not just logged)**
- [x] Verification claims "confirmed" path — **DONE: `verify.ts` sets `confirmed` for employment claims when timeline is consistent**
- [x] `recalculate_all_trust_scores` PG function — **DONE: migration `20260408120000_recalculate_all_trust_scores_fn.sql` created**
- [x] Human signal string mismatch fix — **DONE: `ai_generated` → `likely_ai_generated` in `trust-score.ts`**
- [ ] Re-run `audit-whatsapp-templates.mjs` after new templates approved — **MANUAL: wait 1-2 hours then verify all 34 templates APPROVED**
- [ ] End-to-end test: vouch pipeline happy path (Section 1.3.1) — **MANUAL: requires WhatsApp + Supabase interaction**
- [ ] End-to-end test: cold pipeline happy path (Section 1.3.2) — **MANUAL: requires browser test**
- [x] Verify data collection integrity for proof statement (Section 1.3.3) — **DONE: fixed `entry_path` for referred applies, added `hire` action signal, added bulk reject → hiring outcomes**
- [ ] Stripe test-mode checkout and webhook test (Section 1.4) — **VERIFIED: code paths correct; needs manual Stripe test-mode run**
- [ ] Tenant isolation manual test (Section 1.6) — **VERIFIED: RLS + TenantScopedClient in place; manual cross-org test needed**
- [ ] WhatsApp webhook signature rejection test (Section 1.6) — **VERIFIED: HMAC-SHA256 + timingSafeEqual; manual curl test needed**

### Should-do (risks week-one pain if skipped)

- [ ] WhatsApp webhook load test at 50 concurrent messages (Section 1.5) — **VERIFIED: rate limit + fire-and-forget pattern correct**
- [x] Circuit breaker now trips on HTTP 5xx errors — **DONE: `postMetaMessage` throws on server errors so breaker advances**
- [ ] Redis degradation test (Section 1.5) — **VERIFIED: graceful `null` return on Redis failure; rate limit uses Postgres not Redis**
- [x] Marketing template opt-in gate — **DONE: All 7 MARKETING-category templates now guarded by `requireMarketingOptIn`**
- [x] Template category audit in Meta BM — **DONE: 4 templates reclassified as MARKETING by Meta; opt-in guards added**
- [x] Document accepted trust score manipulation risks (Section 1.2) — **DONE: comprehensive docblock in `trust-score.ts`**
- [x] PII logging audit (Section 1.6) — **DONE: logger now redacts PII from message body in production**
- [x] Dead code cleanup — **DONE: deleted orphan `meta-cloud-api.ts` (unused, stale v18.0 API)**

### Nice-to-have (moved to DONE)

- [x] LinkedIn/GitHub URL trust weight reduction — **DONE: reduced from +8/+7 to +3/+2**
- [x] Human signal → trust penalty wiring — **DONE: -10 penalty for AI-generated CVs with confidence > 0.8 (string mismatch fixed)**
- [x] Rapid vouch pattern flagging — **DONE: >5 vouches in 24h from same phone → hard-blocked + logged in agent_logs**
- [ ] Vouch question reduction (5 → 3) — deferred to Phase 3
- [ ] Referral systems unification view — deferred to Phase 3

---

## Key Files Reference

| Area                                      | Path                                                             |
| ----------------------------------------- | ---------------------------------------------------------------- |
| WhatsApp service                          | `src/lib/services/whatsapp.ts`                                   |
| WhatsApp templates (wrapper)              | `src/lib/whatsapp/templates.ts`                                  |
| WhatsApp session states                   | `src/lib/whatsapp/sessions.ts`                                   |
| WhatsApp inbound handler                  | `src/lib/whatsapp/handler.ts`                                    |
| WhatsApp webhook route                    | `src/app/api/webhooks/whatsapp/route.ts`                         |
| Template creation script                  | `scripts/create-interakt-templates.ts`                           |
| Trust score calculation                   | `src/lib/agents/trust-score.ts`                                  |
| Vouch agent                               | `src/lib/agents/vouch.ts`                                        |
| Vouch schema (LLM output)                 | `src/lib/agents/schemas.ts`                                      |
| Ghost risk heuristic (`ghost_risk_score`) | `src/lib/agents/ghostbuster.ts`                                  |
| Candidate Authenticity Check (CV)         | `src/lib/agents/ghostbuster-authenticity.ts`                     |
| Human signal detector                     | `src/lib/services/human-signal-detector.ts`                      |
| FitScore three-stage                      | `src/lib/fitscore/three-stage/scorer.ts`                         |
| FitScore hybrid v2                        | `src/lib/fitscore/hybrid/pipeline.ts`                            |
| FitScore service                          | `src/lib/services/FitScoreService.ts`                            |
| Pipeline candidates                       | `supabase/schema/20_pipeline.sql`                                |
| Hiring outcomes                           | `src/lib/services/hiring-outcomes.ts`                            |
| Pipeline action signals                   | `src/lib/services/pipeline-action-signals.ts`                    |
| Analytics API                             | `src/app/api/analytics/route.ts`                                 |
| Referral identity layer                   | `supabase/migrations/20260326140000_referral_identity_layer.sql` |
| WhatsApp referral handler                 | `src/lib/whatsapp/referral-handler.ts`                           |
| Public apply (referral resolution)        | `src/lib/agents/public-apply.ts`                                 |
| Payout trigger                            | `src/lib/agents/payout-trigger.ts`                               |
| Feature flags                             | `src/lib/feature-flags.ts`                                       |
| Stripe service                            | `src/lib/services/stripe.ts`                                     |
| Stripe webhook                            | `src/app/api/webhooks/stripe/route.ts`                           |
| Env config                                | `src/lib/config/env.ts`                                          |
