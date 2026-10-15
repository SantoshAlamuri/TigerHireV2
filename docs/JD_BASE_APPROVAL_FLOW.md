# JD Base approval flow

**Audience:** Product, design, and engineering.  
**Last updated:** May 2026.  
**UI component:** `src/components/fitscore/jd-base/JdBaseApprovalWizard.tsx`.

This document explains **how hiring managers approve scoring configuration** before candidates are scored. One approved **`job_jd_bases`** row still backs all screens — the wizard is a **guided UX split**, not separate database entities.

---

## 1. Why JD Base exists

Raw job description text is not sufficient for consistent FitScore:

- **Ideal Candidate Profile (ICP)** — who we want (skills, years, traits, background).
- **Scoring rubric** — dimension weights that must sum to **100%**.
- **Human sign-off** — recruiter confirms JD and rubric align before API spend.

Until approval: scoring returns **`pending_jd_approval`**. See `docs/SCORING_ARCHITECTURE.md`.

---

## 2. Who sees the wizard

| Persona | Route / context                         |
| ------- | --------------------------------------- |
| Recruit | Job detail → JD Base setup              |
| Agency  | `agency/jobs/[id]` — `variant="agency"` |
| Company | `company/jobs/[id]`                     |

Same three steps everywhere; copy may differ slightly for agency vs company.

---

## 3. Three screens

### Screen 1 — Ideal Candidate Profile (ICP)

**Purpose:** Define the target candidate, not the job marketing copy.

**Fields (typical):**

- Role title / summary alignment with job
- **Years of experience** range
- **Must-have / nice-to-have skills** (editable lists)
- **Traits** — soft signals (e.g. ownership, communication)
- **Background preferences** — education, industry, certifications emphasis

**Persistence:** Stored inside `job_jd_bases.ideal_candidate_profile` (JSON matching `IdealCandidateProfile` in `src/lib/fitscore/hybrid/types.ts`).

**Templates:** Selecting a template (e.g. `india-008`) **prefills** ICP and may suggest weights — templates are **starting points**, not authoritative over the JD.

### Screen 2 — Rubric (scoring weights)

**Purpose:** How much each scoring dimension matters for this role.

**UI:** Sliders per dimension; live **sum must equal 100%** before save is comfortable (approve flow normalizes weights server-side if needed).

**Persistence:** `job_jd_bases.scoring_weights` (JSON `ScoringWeights`).

**Templates:** Prefill dimension percentages; recruiter adjusts for the actual JD (e.g. manual QA vs senior automation).

### Screen 3 — Review

**Purpose:** Final human check before scoring is unlocked.

**Layout:**

- **Left / top:** Job description text (read-only reference).
- **Right / bottom:** Approved ICP + rubric summary.
- **Mismatch panel:** Warnings and errors from `detectJdBaseMismatches` (`src/lib/fitscore/jd-base-approval/mismatch-detection.ts`).

**Approve action:** Sets `approval_status = approved` (and related timestamps) via existing JD Base API routes. After approval, `FitScoreService` may score candidates.

---

## 4. Mismatch detection rules

Mismatches are **advisory** on the Review screen — they do not block approve by themselves (recruiter may override with eyes open).

| Severity    | Example rule                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------- |
| **error**   | ICP requires **5+ years** but JD says **2–4 years**                                           |
| **error**   | High weight on **test automation** dimension but JD only mentions automation as “preferred”   |
| **warning** | Template ID suggests senior automation profile but JD title/description read junior/manual QA |
| **warning** | Certification emphasized in rubric but not mentioned in JD                                    |

Implementation extracts hints from JD text (year ranges, “preferred” vs “required” language) and compares to ICP + `scoring_weights` + optional template baseline.

**Code:** `mismatch-detection.ts`, `years-range.ts`, `dimension-labels.ts`.

---

## 5. Save and navigation behavior

- Wizard tracks **`maxStepReached`** so users cannot skip ahead without visiting prior steps (linear discipline).
- **Save draft** updates `job_jd_bases` without approving; silent refetch refreshes parent job state.
- **Approve** only on Review; requires valid payload; API errors surface in UI (fixed May 2026: response body parsing).

---

## 6. What gets saved where

| Data                        | Column / location                                      |
| --------------------------- | ------------------------------------------------------ |
| ICP JSON                    | `job_jd_bases.ideal_candidate_profile`                 |
| Rubric weights              | `job_jd_bases.scoring_weights`                         |
| Template reference          | `template_id` (if used)                                |
| JD text used for extraction | Job’s description fields (not duplicated per screen)   |
| Approval state              | `approval_status`, approval metadata on `job_jd_bases` |
| Post-approval scoring       | `fit_scores` rows keyed by `job_id` + `candidate_id`   |

No migration splits ICP and rubric into separate tables — one row, two JSON blobs.

---

## 7. Templates vs JD text

| Source              | Role                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------- |
| **JD text**         | Source of truth for **mismatch warnings** (years, required skills, preferred language) |
| **Template**        | Accelerates setup; mismatch detector may compare template weights to JD                |
| **Recruiter edits** | Final authority at approve time                                                        |

**Product principle:** Templates **suggest**; JD text **grounds** warnings. Wrong template + right JD edits was a known failure mode (e.g. senior automation template on manual QA JD) — Review screen exists to catch that.

---

## 8. After approval

1. Pending applications and uploads may enqueue scoring (`source: upload` or `api`).
2. Each score logs **`signals_log`** including JD Base version context.
3. Recruiters see **FitScore + ICP Match + Market Rank** on cards when blend v2 flags are on.

---

## 9. Related documents

- `docs/SCORING_ARCHITECTURE.md` — scoring pipeline after approval
- `src/lib/fitscore/hybrid/jd-base.ts` — server-side JD Base generation helpers
- `docs/principles/scoring-entrypoints-current.md` — API entrypoints
