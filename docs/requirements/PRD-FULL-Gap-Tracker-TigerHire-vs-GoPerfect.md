# PRD Full Gap Tracker — TigerHire vs GoPerfect (v1.0)

**Source:** `TigerHire-PRD-Full.docx` (April 2026, 8 feature areas).  
**Purpose:** Cross-check repo vs PRD; maintain this list as the single backlog slice for “full product gap closure.”  
**How to use:** Set status per row (`done` / `partial` / `not_started`). Link PRs in the Notes column.

**Sprint execution:** [PRD-FULL-GitHub-issues.md](./PRD-FULL-GitHub-issues.md) (GitHub-ready bodies) · [SPRINT-PRD-MVP.md](./SPRINT-PRD-MVP.md) (two-sprint plan + issue # placeholders).

---

## Legend

| Status          | Meaning                                               |
| --------------- | ----------------------------------------------------- |
| **done**        | Meets PRD acceptance theme in product (may differ UX) |
| **partial**     | Building blocks exist; PRD scope not met              |
| **not_started** | No meaningful implementation                          |

---

## Feature 1 — Always-on inbound screening queue

| ID    | Task                                                                                         | Status      | Code / notes                                                                                                                              |
| ----- | -------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| F1-01 | Event-driven FitScore for **all** inbound channels (apply link + ATS webhook + email parser) | partial     | Apply: `POST /api/applications` enqueues `fit-score-single` or fallback `FitScoreService.computeSingle` — no unified multi-channel worker |
| F1-02 | Recruiter threshold **1–5** → Shortlist vs **Deprioritised** bucket + default views          | not_started | No `depriorit` / threshold grep matches in app code                                                                                       |
| F1-03 | Dashboard banner: “Screening active — N received / M shortlisted / K deprioritised today”    | not_started | —                                                                                                                                         |
| F1-04 | Pause inbound screening **per job** without losing scores                                    | not_started | —                                                                                                                                         |
| F1-05 | NFR tests: p95 score &lt; 60s from receipt (instrument + e2e)                                | partial     | Inngest `fit-score-single` exists; no PRD metrics dashboard / automated SLO test in repo                                                  |

---

## Feature 2 — Natural language job briefing

| ID    | Task                                                                                        | Status      | Code / notes                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| F2-01 | Dedicated briefing field (20–500 words) + debounced extraction pipeline                     | partial     | `generateJobFromPrompt`, `parseJobDescription` in `src/lib/services/anthropic.ts`; JD wizard — not PRD “briefing → criteria list” UX |
| F2-02 | Extracted criteria: must-have, nice-to-have, experience, location, **exclusions**           | partial     | `jd-intelligence` → `skills_rubric` on job; align UI to PRD schema                                                                   |
| F2-03 | Criterion editor: add/remove + **importance 1–3** before activate                           | not_started | Rubric stored; PRD editor + reweight UX TBD                                                                                          |
| F2-04 | Mid-campaign edit: “applies to new applicants” + **re-score all** dialog with time estimate | not_started | —                                                                                                                                    |
| F2-05 | **10** one-click role templates                                                             | not_started | —                                                                                                                                    |

---

## Feature 3 — Explainable score output

| ID    | Task                                                                                              | Status      | Code / notes                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| F3-01 | Card: **star rating (1–5)** + one-sentence headline + **3–5** criterion bullets                   | partial     | `FitScoreCard`, `CandidateCard` — numeric/dimension bars + reasoning; not PRD star + Met/Partial/Not met icons            |
| F3-02 | Per-criterion: label + status icon (✓ / ∼ / ✗) + one-line evidence from resume                    | partial     | `criteriaBreakdown` + `evidence_text` in `FitScoreCard`; map to PRD tri-state UX                                          |
| F3-03 | Job page **“Consistency guarantee”** badge (N applicants, same criteria, last updated)            | not_started | —                                                                                                                         |
| F3-04 | Regenerate explanations when criteria change                                                      | partial     | Rescore paths exist; tie to criteria versioning + copy                                                                    |
| F3-05 | **Scoring** audit log: every event (candidate, job, criteria version, score, time); CSV **+ PDF** | partial     | `GET /api/fit-score/feedback/export` — hiring outcomes / pipeline signals; not full “every score computation” audit + PDF |

---

## Feature 4 — ATS & job board integrations

| ID    | Task                                                       | Status      | Code / notes                                                                                      |
| ----- | ---------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| F4-01 | Naukri P0 (inbound + score write-back)                     | not_started | Docs + admin Apify scrape — not employer API product integration (`docs/PRODUCT_FEATURE_GAPS.md`) |
| F4-02 | LinkedIn Jobs P0                                           | not_started | —                                                                                                 |
| F4-03 | Greenhouse / Lever P1                                      | not_started | —                                                                                                 |
| F4-04 | Workday / BambooHR P2                                      | not_started | —                                                                                                 |
| F4-05 | Deduplication across channels + merge profile              | partial     | General candidate/application model; no ATS-specific merge                                        |
| F4-06 | Admin **connection health** (last sync, errors, reconnect) | not_started | —                                                                                                 |
| F4-07 | Data residency **AWS ap-south-1** for candidate data (NFR) | not_started | Infra / Supabase region policy — verify vs PRD                                                    |

---

## Feature 5 — Autonomous outreach

| ID    | Task                                                                              | Status      | Code / notes                                                                              |
| ----- | --------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| F5-01 | Multi-step **sequence builder** (delays, channel per step)                        | not_started | Orchestrator `stepOutreach` is one-shot email/WA — `src/lib/agents/orchestrator-steps.ts` |
| F5-02 | AI drafts from profile + recruiter review before activate; bulk up to **50**      | partial     | `runCommunication` agent; no sequence UI/analytics                                        |
| F5-03 | Channels: Gmail/Outlook OAuth, LinkedIn InMail API, WhatsApp/SMS (Twilio) per PRD | partial     | WhatsApp + Resend email exist; not OAuth sequence product                                 |
| F5-04 | Auto-pause on reply or interview booking + **opt-out** honoured                   | not_started | —                                                                                         |
| F5-05 | Per-sequence analytics (open, reply, positive reply, interview conversion)        | not_started | —                                                                                         |

---

## Feature 6 — Outbound passive talent sourcing

| ID    | Task                                                                         | Status      | Code / notes                                                                   |
| ----- | ---------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------ |
| F6-01 | Licensed **talent database** (50M+ India) + legal/compliance gate            | not_started | Signals / scout direction only                                                 |
| F6-02 | Search filters per PRD + **FitScore on results** before render (p95 &lt; 3s) | not_started | —                                                                              |
| F6-03 | One-click **Add to sequence** (ties to F5)                                   | not_started | —                                                                              |
| F6-04 | Saved search → **weekly digest of new profiles** (not jobs)                  | not_started | `saved_searches` + `POST /api/cron/job-alerts` = **job** alerts                |
| F6-05 | Profile unlock: basic free; contact details = **unlock credits**             | partial     | Billing / `OutOfCreditsModal` / plan limits — align with PRD “basic vs unlock” |

---

## Feature 7 — Autopilot / agent mode

| ID    | Task                                                                             | Status      | Code / notes                                               |
| ----- | -------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------- |
| F7-01 | Per-job goal (“book N interviews by date”) + guardrails (caps, channels, budget) | not_started | Orchestrator is approval-gated workflow, not PRD Autopilot |
| F7-02 | Autonomous loop: source → score → sequence → monitor → book                      | not_started | —                                                          |
| F7-03 | Human-readable **activity feed** per job with reason strings                     | partial     | Orchestrator run logs — not PRD feed UX                    |
| F7-04 | Pause / override / terminate within **60s** guarantee                            | not_started | —                                                          |
| F7-05 | Advance/reject **feedback** adjusts weights for next run (account-level)         | not_started | Separate from hybrid/three-stage tuning                    |

---

## Feature 8 — Unlimited seats & team collaboration

| ID    | Task                                                                        | Status      | Code / notes                                                                                               |
| ----- | --------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| F8-01 | **All** seats included in **every** plan (pricing + no seat gate)           | not_started | `company/billing` still advertises seat tiers; `TeamManagementContent` tracks `seats_used` / `seats_total` |
| F8-02 | Role matrix: Admin / Recruiter / Viewer per PRD + tests                     | partial     | RBAC exists; align exactly to PRD matrix + QA                                                              |
| F8-03 | Shared candidate context: interview notes, internal ratings, HM feedback    | partial     | `candidate_notes` table + RLS — extend for ratings/HM                                                      |
| F8-04 | **@mention** notifications on candidate cards                               | not_started | No matches in `src`                                                                                        |
| F8-05 | Job-level **team activity log** (who screened / advanced / rejected / when) | partial     | `pipeline_action_signals` etc.; productize as job chronicle                                                |

---

## Non-functional (PRD §9)

| ID     | Task                                                                               | Status      | Notes                                |
| ------ | ---------------------------------------------------------------------------------- | ----------- | ------------------------------------ |
| NFR-01 | Inbound p95 &lt; 60s, search p95 &lt; 3s, 500 concurrent — load tests + monitoring | partial     | Patterns exist; formal SLOs TBD      |
| NFR-02 | PII encryption TLS 1.3 / AES-256                                                   | partial     | Platform defaults; document + verify |
| NFR-03 | WCAG 2.1 AA on **new** PRD surfaces                                                | not_started | —                                    |
| NFR-04 | Audit retention **3 years** (DPDP)                                                 | not_started | Policy + storage lifecycle           |

---

## Release alignment (PRD §10)

| Phase | PRD scope                      | Repo readiness (high level)                                                                          |
| ----- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| MVP   | F1 + F2 + F3 (apply link only) | Strong on FitScore + explain UI; weak on F1 queue UX, F2 briefing UX, F3 audit/PDF/consistency badge |
| v1.1  | F4 (Naukri+LI) + F8            | F4/F8 largely not_started                                                                            |
| v1.2  | More ATS + F5 + audit/DPDP     | Partial building blocks                                                                              |
| v2.0  | F6 + WA/SMS channel + more ATS | Major gaps                                                                                           |
| v2.1  | F7 full parity                 | Major gaps                                                                                           |

---

## Open questions (from PRD §11)

Track answers in `docs/requirements/` or product wiki; unblock F4/F6/F7/F5 LinkedIn.

---

_Last cross-check: codebase search + PRD text extract from `TigerHire-PRD-Full.docx`. Update this file when scope or implementation changes._
