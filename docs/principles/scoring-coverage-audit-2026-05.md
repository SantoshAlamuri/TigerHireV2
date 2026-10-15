# Scoring coverage audit — May 2026

> **Current state (2026-05-18):** TH-SCORING-1/2/3 are **implemented** in code. Use **[`scoring-entrypoints-current.md`](./scoring-entrypoints-current.md)** for the up-to-date surface table. The gap counts below reflect the **2026-05-16** audit snapshot only.

**Scope:** Compare current code to [Scoring coverage principle](./scoring-coverage.md). **No code changes** in this pass (historical).

**Inbound WhatsApp UX (typing vs interim messages, which path runs which copy):** [whatsapp-inbound.md](./whatsapp-inbound.md) — complements this audit’s WhatsApp scoring rows; do not conflate Lane A interim with role-guided “evaluating…” when judging regressions.

## Current state (post-audit fixes)

| Ticket       | Status in code (2026-05-18)                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| TH-SCORING-1 | **Done** — `fitscore-routing.ts` → `FitScoreService` for lane-a, immediate-match, job-alert, role-guided-flow |
| TH-SCORING-2 | **Done** — `POST /api/intake/email` enqueues scoring or `pending_jd_approval`                                 |
| TH-SCORING-3 | **Done** — `FitScoreService` is hybrid-only; no `computeFitScore` branch                                      |
| TH-SCORING-4 | **Open (operational)** — bulk ingest still defers score by design; enforcement is UX/process                  |

---

## Summary — gap counts by classification (2026-05-16 snapshot)

| Classification            | Count | Notes                                                                                                                          |
| ------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Deliberate**            | 1     | Agency bulk upload intentionally defers parse/score (timeout UX).                                                              |
| **Accidental**            | 4     | WhatsApp modules still call legacy three-stage `computeFitScore` instead of `FitScoreService`.                                 |
| **Missing**               | 1     | Email intake saves profile/applications but never invokes unified scoring or enqueue.                                          |
| **Cleanup (non-surface)** | 3     | Unreachable three-stage branches in `FitScoreService`; unused `computeFitScore` imports in `scout.ts` and `fitscore-agent.ts`. |

---

## JD Base + ICP gating (how code behaves today)

- **Unified path (`FitScoreService.computeSingle` / `computeBatch`):** Loads `jd_base` via `getJdBaseByJobId`. If `approved_by` is absent, default behaviour is **`queue_pending`** (pair queued for post-approval sweep) or an early return payload with `scoring_status: "pending_jd_approval"` — not silent drop.
- **ICP:** Ideal candidate profile is carried on the JD Base document (`ideal_candidate_profile`); HM approval is represented by **`approved_by`** on that row (patching profile can reset approval in JD Base workflows). There is **no separate ICP approval flag** in the audited apply paths beyond that package.

---

## Surface-by-surface audit

### 1. Public web apply — `POST /api/apply`

| Field                  | Detail                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| **Entry**              | `src/app/api/apply/route.ts` → `processPublicApplication` (`src/lib/agents/public-apply.ts`) |
| **Unified path?**      | **Yes.** `processCandidate` calls `FitScoreService.computeSingle` for approved JD bases.     |
| **Bypass**             | None for scoring when JD approved.                                                           |
| **JD Base / ICP gate** | **Yes** (`isJdBaseApproved` / queue pending pairs).                                          |
| **Gap class**          | None.                                                                                        |

### 2. Applications API + Inngest — `POST /api/applications`, `fit-score-single`

| Field                  | Detail                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| **Entry**              | `src/app/api/applications/route.ts`; worker `src/inngest/functions.ts` (`FitScoreService.computeSingle`) |
| **Unified path?**      | **Yes.**                                                                                                 |
| **Bypass**             | None.                                                                                                    |
| **JD Base / ICP gate** | **Yes** (inside `FitScoreService`).                                                                      |
| **Gap class**          | None.                                                                                                    |

### 3. Agency single upload — `POST /api/agency/upload-profile`

| Field                  | Detail                                                                    |
| ---------------------- | ------------------------------------------------------------------------- |
| **Entry**              | `src/app/api/agency/upload-profile/route.ts` → `processPublicApplication` |
| **Unified path?**      | **Yes** (same as public apply).                                           |
| **Bypass**             | None.                                                                     |
| **JD Base / ICP gate** | **Yes.**                                                                  |
| **Gap class**          | None.                                                                     |

### 4. Agency bulk upload — `POST /api/agency/upload-profile/bulk`

| Field                  | Detail                                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entry**              | `src/app/api/agency/upload-profile/bulk/route.ts` → `savePublicApplication`                                                                                             |
| **Unified path?**      | **No** at ingest time.                                                                                                                                                  |
| **Bypass**             | **Nothing** at apply time — by design skips parse/score in-request (comment: avoid timeouts; “Score Pending” flow).                                                     |
| **JD Base / ICP gate** | **N/A** at ingest (no scorer invoked).                                                                                                                                  |
| **Gap class**          | **Deliberate** — architectural/latency tradeoff; principle alignment depends on **mandatory** downstream scoring UX (reprocess / batch) until unified entry is invoked. |

**Why deferral is deliberate (not drift):** The bulk route runs **`savePublicApplication`** per file under concurrency caps (`src/app/api/agency/upload-profile/bulk/route.ts`). Each successful path does CV upload, candidate upsert, pipeline/application rows — already heavy for **N files × serverless `maxDuration`**. Inline **`processPublicApplication`** (extract text, Claude parse, **`FitScoreService.computeSingle`**) would routinely exceed limits and produce flaky UX; the product explicitly steers agencies to **“Score Pending”** so scoring happens out-of-band through the same unified stack as other surfaces. The gap risk is **operational** (someone never clicks Score Pending), not that bulk was trying to avoid JD Base rules.

### 5. Email intake — `POST /api/intake/email`

| Field                  | Detail                                                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entry**              | `src/app/api/intake/email/route.ts` → `savePublicApplication`                                                                                                                                             |
| **Unified path?**      | **No.**                                                                                                                                                                                                   |
| **Bypass**             | **No scorer** — only upload + candidate + applications pipeline upsert (same fast path as bulk).                                                                                                          |
| **JD Base / ICP gate** | **No** — nothing checks or queues for FitScore in this route. _Note:_ pending JD approval queue is only populated when code paths call `enqueuePendingJdApprovalPair` / `FitScoreService` — **not** here. |
| **Gap class**          | **Missing** relative to principle unless a separate job guarantees `FitScoreService` later (none found wired from this route).                                                                            |

### 6. WhatsApp — `lane-a.ts`

| Field                  | Detail                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| **Entry**              | `handleLaneASingleJobScore` → `computeFitScore` (`src/lib/fitscore/scorer.ts` → three-stage)             |
| **Unified path?**      | **No.**                                                                                                  |
| **Bypass**             | **V1 three-stage** (`computeFitScore`).                                                                  |
| **JD Base / ICP gate** | **No** — three-stage pipeline does not enforce JD Base approval or hybrid queue semantics.               |
| **Gap class**          | **Accidental** — predates hybrid v2 consolidation; not an intentional permanent fork for JD Base policy. |

### 7. WhatsApp — `immediate-match.ts`

| Field                  | Detail                                                  |
| ---------------------- | ------------------------------------------------------- |
| **Entry**              | `runImmediateMatchAfterPreferences` → `computeFitScore` |
| **Unified path?**      | **No.**                                                 |
| **Bypass**             | **V1 three-stage.**                                     |
| **JD Base / ICP gate** | **No.**                                                 |
| **Gap class**          | **Accidental.**                                         |

### 8. WhatsApp — `job-alert.ts`

| Field                  | Detail                                                               |
| ---------------------- | -------------------------------------------------------------------- |
| **Entry**              | Invoked from `JobService` / cron job alerts path → `computeFitScore` |
| **Unified path?**      | **No.**                                                              |
| **Bypass**             | **V1 three-stage.**                                                  |
| **JD Base / ICP gate** | **No.**                                                              |
| **Gap class**          | **Accidental.**                                                      |

### 9. WhatsApp — `role-guided-flow.ts`

| Field                  | Detail                                      |
| ---------------------- | ------------------------------------------- |
| **Entry**              | Role selection handlers → `computeFitScore` |
| **Unified path?**      | **No.**                                     |
| **Bypass**             | **V1 three-stage.**                         |
| **JD Base / ICP gate** | **No.**                                     |
| **Gap class**          | **Accidental.**                             |

### 10. WhatsApp — Scout (`triggerScoutAgent`)

| Field                  | Detail                                                             |
| ---------------------- | ------------------------------------------------------------------ |
| **Entry**              | `src/lib/agents/scout.ts` → `FitScoreService.computeSingle`        |
| **Unified path?**      | **Yes.**                                                           |
| **Bypass**             | None (dead **import** of `computeFitScore` remains — see Cleanup). |
| **JD Base / ICP gate** | **Yes.**                                                           |
| **Gap class**          | None for behaviour; import cleanup only.                           |

### 11. WhatsApp — apply from match (`application-bridge.ts`)

| Field                  | Detail                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| **Entry**              | `createApplicationFromWhatsApp` → `ApplicationService.create` with existing `fitScoreId` |
| **Unified path?**      | **N/A** — does not compute a new score; attaches to existing `fit_scores` row.           |
| **Bypass**             | N/A                                                                                      |
| **JD Base / ICP gate** | Inherited from **whenever** that row was created (could be v1 or v2 historically).       |
| **Gap class**          | None for “apply instant”; principle applies to **prior** scoring surface.                |

---

## Resolved questions from prior audit

### A. WhatsApp `computeFitScore` callers — deliberate or accidental?

**Accidental drift.** These paths bypass `FitScoreService`, so they **do not** enforce JD Base approval or hybrid v2 persistence (`scoring_version: 2`). There is no separate product comment asserting Lane A / job alerts must stay on three-stage for JD Base reasons — they simply were not migrated.

### B. `/api/intake/email` — why no FitScore on apply?

The route uses **`savePublicApplication`** only (Phase 1 save). There is **no** Inngest enqueue, **no** `FitScoreService.computeSingle`, and **no** pending-JD queue touch in this handler. Unless operators always run a downstream **reprocess/rescore** job for email-sourced candidates, this is a **missing** implementation relative to the principle.

### C. Unreachable three-stage branch in `FitScoreService.computeSingle`

After `computeSingle` loads `jd_base`, **unapproved** bases return or queue **before** the hybrid vs three-stage branch. Therefore, when execution reaches:

```ts
const score = jdBase?.approvedBy
  ? await runHybridFitScorePipeline(...)
  : await computeFitScore(...);
```

the **else branch is unreachable** under current control flow. The same pattern exists in **`computeBatch`** after its early return for unapproved bases. **Flag for cleanup** (remove dead branch or refactor guard for clarity).

---

## Recommendations

| Item                                                                  | Recommendation                                         | Rationale                                                                                                                                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WhatsApp `lane-a`, `immediate-match`, `job-alert`, `role-guided-flow` | **Migrate**                                            | Route all scoring through `FitScoreService.computeSingle` (or future `scoreCandidateForJob`) so JD Base / queue semantics and v2 persistence are identical to web apply.         |
| `POST /api/intake/email`                                              | **Fix**                                                | After save (or async): invoke unified scorer or enqueue same event as `fit-score-single` for each relevant `(jobId, candidateId)`; queue pending if JD not approved.             |
| Agency bulk fast path                                                 | **Keep separate** _ingest_ **+ Fix/Migrate** _scoring_ | Keep non-blocking upload; **require** a durable follow-up that calls the unified entry (batch job already implied by “Score Pending” — document and enforce so principle holds). |
| `FitScoreService` unreachable `computeFitScore` branches              | **Cleanup**                                            | Removes confusion and prevents future regressions if guards change.                                                                                                              |
| Unused `computeFitScore` imports (`scout.ts`, `fitscore-agent.ts`)    | **Cleanup**                                            | Lint noise; avoid implying three-stage use.                                                                                                                                      |

---

## Parked tickets (queued — do not start until ledger acceptance gate clears)

Use these as GitHub issues / Linear; **no implementation** until measurement protocol on the ledger initiative is clean.

### TH-SCORING-1 — Migrate WhatsApp to unified scorer

- **Title:** Migrate WhatsApp FitScore callers to `FitScoreService` / canonical `scoreCandidateForJob`
- **Scope:** `lane-a.ts`, `immediate-match.ts`, `job-alert.ts`, `role-guided-flow.ts` — replace `computeFitScore` (three-stage) with unified path; preserve JD Base queue semantics and `scoring_version: 2`.
- **Acceptance:** WhatsApp flows produce same behaviour as web apply for approved/unapproved JD Base; latency budgets documented or adjusted.

### TH-SCORING-2 — Email intake scoring

- **Title:** `POST /api/intake/email` — invoke unified scorer or enqueue `fit-score-single` after save
- **Acceptance:** Each intake creates pending-JD queue rows when appropriate; no silent skip for eligible jobs.

### TH-SCORING-3 — FitScoreService cleanup

- **Title:** Remove unreachable three-stage branches in `FitScoreService.computeSingle` / `computeBatch`; remove unused `computeFitScore` imports in `scout.ts`, `fitscore-agent.ts`
- **Acceptance:** Typecheck + targeted tests green; no behaviour change on unified paths.

### TH-SCORING-4 — Agency bulk invariant

- **Title:** Document/enforce “Score Pending” invariant for bulk upload
- **Acceptance:** Principle satisfied end-to-end (ingest fast path + mandatory follow-up scoring or explicit queued state); optional telemetry/alerts if profiles sit unscored past SLA.

---

## Follow-up tickets (summary list)

Same work as **Parked tickets** above — kept as a short numbered list for quick scanning:

1. Migrate four WhatsApp modules to unified scorer (+ E2E / latency).
2. Fix email intake scoring.
3. Cleanup `FitScoreService` dead branch + stray imports.
4. Align agency bulk “Score Pending” with explicit invariant.
