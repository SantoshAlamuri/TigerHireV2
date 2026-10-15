# TigerHire PRD vs Codebase — Build Status

Cross-reference of the TigerHire PRD vs Codebase plan (Section 3 “What needs to be done”) with what is implemented.

---

## 3.1 Priority 1 — WhatsApp + Scout (Sprint 1)

| Plan item                  | Status   | Implementation                                                                                                                                                       |
| -------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WhatsApp webhook**       | ✅ Built | `src/app/api/webhooks/whatsapp/route.ts` — GET hub verification, POST inbound (async, 200 quick return).                                                             |
| **WhatsApp session state** | ✅ Built | `src/lib/whatsapp/sessions.ts` — getOrCreateSession, updateSession. Table `whatsapp_sessions` in `supabase/schema/16_whatsapp_sessions.sql`.                         |
| **Inbound handler**        | ✅ Built | `src/lib/whatsapp/handler.ts` — routes by state: new, cv_requested, cv_received, scored, vouch_q1–q5, referral_phone_requested, slot_selection.                      |
| **Media download**         | ✅ Built | `src/lib/whatsapp/media.ts` — download WhatsApp media (Meta Graph API).                                                                                              |
| **Scout Agent (CV path)**  | ✅ Built | `src/lib/agents/scout.ts` — download PDF → upload to `candidate-cvs` → Claude parse → upsert candidate → Verify (background) → FitScore → send results via WhatsApp. |
| **Schema for CV flow**     | ✅ Built | Migrations: `15_candidates_prd.sql`, `21_storage_candidate_cvs.sql` — phone, cv_url, cv_raw_text, cv_parsed_at, trust_score, ghost_risk_score, etc.                  |
| **FitScore after CV**      | ✅ Built | Scout calls FitScore; `src/lib/whatsapp/fitscore-notify.ts` — sendFitScoreResultsViaWhatsApp (top 3, reply 1/2/3).                                                   |

---

## 3.2 Priority 2 — FitScore

| Plan item                 | Status   | Implementation                                                                           |
| ------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| **salary_recommendation** | ✅ Built | `src/lib/fitscore/types.ts`, `scorer.ts`; DB `07b_fit_scores_salary_recommendation.sql`. |

---

## 3.3 Priority 3 — Referral + Vouch (Sprint 3)

| Plan item                       | Status   | Implementation                                                                                                                       |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Schema (referrals, vouches)** | ✅ Built | `supabase/schema/17_vouches.sql`, `19_referrals.sql`; `02a_profiles_phone.sql` for referrer phone.                                   |
| **Referral handler**            | ✅ Built | `src/lib/whatsapp/referral-handler.ts` — parseReferralText, detectAndHandleReferral, handleReferralCandidatePhone; wired in handler. |
| **Vouch agent**                 | ✅ Built | `src/lib/agents/vouch.ts` — 5-question flow, saveVouch, specificity score (Claude), weight, recalculateTrustScore.                   |
| **Trust score**                 | ✅ Built | `src/lib/agents/trust-score.ts` — recalculateTrustScore from entry_path, vouches, verification_claims, profile links, ghost_risk.    |

---

## 3.4 Priority 4 — Recruiter dashboard

| Plan item                                  | Status    | Implementation                                                                                                                                                                                                                       |
| ------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Vouches / verification / ghost on card** | ✅ Built  | FitScore GET includes candidates.vouches, candidates.verification_claims, trust_score, ghost_risk; `src/components/dashboard/FitScoreCard.tsx` — Trust, Reliability Signal (beta), “N vouch(es)”, “Vouched by”, verification claims. |
| **Unlock flow**                            | ✅ Exists | `src/app/api/candidates/[id]/unlock/route.ts` — deducts credits; PRD alignment not fully audited.                                                                                                                                    |

---

## 3.5 Priority 5 — Verify + Trust (Sprint 5)

| Plan item                        | Status   | Implementation                                                                                                                                                              |
| -------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Schema (verification_claims)** | ✅ Built | `supabase/schema/18_verification_claims.sql`.                                                                                                                               |
| **Verify agent**                 | ✅ Built | `src/lib/agents/verify.ts` — work history (Claude), timeline consistency, insert verification_claims, recalculateTrustScore.                                                |
| **Candidate Authenticity Check** | ✅ Built | `src/lib/agents/ghostbuster-authenticity.ts` — CV authenticity pipeline; API `POST /api/agents/ghostbuster`. Heuristic `ghost_risk_score`: `src/lib/agents/ghostbuster.ts`. |

---

## 3.6 Scheduler, cron, and job sync (Sprints 4–6)

| Plan item                | Status       | Implementation                                                                                                                                                                                                       |
| ------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pipeline schema**      | ✅ Built     | `supabase/schema/20_pipeline.sql` — pipeline_stages, pipeline_candidates.                                                                                                                                            |
| **Pipeline stages API**  | ✅ Built     | `src/app/api/jobs/[id]/pipeline-stages/route.ts` — GET list, POST create/update stages per job.                                                                                                                      |
| **Request Interview**    | ✅ Built     | `src/app/api/jobs/[id]/pipeline/request-interview/route.ts` — ensure pipeline_candidates row, call triggerSchedulerAgent (WhatsApp slot options).                                                                    |
| **Scheduler agent**      | ✅ Built     | `src/lib/agents/scheduler.ts` — triggerSchedulerAgent (3 slots via WhatsApp), handleSlotSelection (1/2/3 → interview_scheduled_at, session complete). Handler calls handleSlotSelection in slot_selection state.     |
| **Cron: reminders**      | ✅ Built     | `src/app/api/cron/reminders/route.ts` — interviews in next 60 min, WhatsApp reminder; `reminder_sent_at` to avoid duplicates (`22_pipeline_reminder_sent.sql`).                                                      |
| **Cron: trust**          | ✅ Built     | `src/app/api/cron/trust/route.ts` — recalculate trust for candidates with recent vouches/verification_claims.                                                                                                        |
| **Cron: cleanup**        | ✅ Built     | `src/app/api/cron/cleanup/route.ts` — mark open jobs closed if updated_at &gt; 90 days ago.                                                                                                                          |
| **vercel.json crons**    | ✅ Built     | `vercel.json` — reminders (_/30 _ \* \* _), trust (0 3 _ \* _), cleanup (0 4 _ \* 0).                                                                                                                                |
| **Recruit pipeline UI**  | ⚠️ Partial   | `src/app/(dashboard)/recruit/pipeline/page.tsx` is a **generic kanban** over all candidates (from `/api/candidates`), not per-job pipeline_stages. No UI yet to manage stages or “Request Interview” from shortlist. |
| **Indeed / Adzuna sync** | ❌ Not built | Documented as post-MVP.                                                                                                                                                                                              |

---

## Summary

- **Built:** WhatsApp webhook, sessions, handler, media, Scout, FitScore (incl. salary_recommendation), FitScore-via-WhatsApp, referral + vouch + trust, Verify + Candidate Authenticity Check, recruiter card (vouch/verification/ghost), pipeline schema, pipeline-stages API, request-interview API, scheduler agent, slot reply handling, reminders/trust/cleanup crons and vercel.json, reminder_sent_at.
- **Partial:** Recruit pipeline page (kanban exists; per-job stages and “Request Interview” are API-only, no UI).
- **Not built:** Indeed/Adzuna job sync (post-MVP); optional calendar invite on slot confirm (PRD “create calendar invite” — reminder only for now).
