# Moat visibility audit (Brief 5 — Phase 1)

| Status         | Phase 2 shipped on `dev` (2026-05-16)                                                        |
| -------------- | -------------------------------------------------------------------------------------------- |
| Date           | 2026-05-16                                                                                   |
| Scope          | Recruiter / HM / leadership **dashboard** only (not candidate WhatsApp, not marketing mocks) |
| Branch audited | `dev` @ `56095e8` (post Brief 4)                                                             |

---

## Executive summary

TigerHire **collects** vouches, referral attribution, ghost-risk, and authenticity signals in Postgres and surfaces them through FitScore / pipeline APIs. **Recruiter-facing chrome barely shows the moat:**

- **Vouches:** one binary **“Vouched”** pill on pipeline cards when `vouch_count > 0` (no count, no names).
- **Referral:** fields are returned by `/api/my-pipeline` but **not rendered** anywhere in recruit/company pipeline UI.
- **Trust-risk / authenticity:** mapped on FitScore rows in `mappers.ts`, but **only visible in compact FitScore rows** (job matches). The **full candidate verdict panel** (primary decision view) shows **no** vouch, referral, ghost, or authenticity UI. `FitScoreCard.tsx` has a richer moat block but is **not imported** by any dashboard route (marketing mock only).

Phase 2 should prioritize **pipeline card** + **candidate verdict panel** + **job matches list** — all can use data already loaded or already on the `FitScore` object without new pipelines.

---

## Section A — Current state

### A.1 Vouches

| Location                   | File (approx.)                                                                                                         | What user sees                                               | Glance vs drill-down                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------- |
| Pipeline kanban card       | `src/app/(dashboard)/recruit/pipeline/components/RecruitPipelineCard.tsx` ~412–416                                     | Green pill **“Vouched”** if `vouch_count > 0`                | Glance (binary); no count/names       |
| Company HM pipeline        | Same component via `src/app/(dashboard)/company/my-pipeline/page.tsx`                                                  | Same                                                         | Same                                  |
| Job matches (per job)      | `src/app/(dashboard)/recruit/jobs/[id]/components/JobMatchesSection.tsx` → `FitScoreReasoningPanel` `compact` ~564–567 | Text: **“N vouch(es)”**                                      | Glance on match list                  |
| Candidate detail (verdict) | `src/app/(dashboard)/recruit/candidates/[id]/page.tsx` → `FitScoreReasoningPanel` **full** mode                        | **Nothing**                                                  | Drill-down gap                        |
| FitScoreCard (unused)      | `src/components/dashboard/FitScoreCard.tsx` ~561–574                                                                   | **“Vouched by”** list (name, relationship, standout snippet) | Would be drill-down — **not shipped** |
| Employee home tile         | `src/components/home/tiles/employee-tiles.tsx` ~55–64                                                                  | Tile **“Vouch requests”** (API stub returns empty)           | Employee-only, not recruiter moat     |
| Admin / agents             | `src/lib/agents/vouch.ts`, cron, WhatsApp                                                                              | Backend only                                                 | N/A                                   |

**Data source (pipeline):** `GET /api/my-pipeline` aggregates `vouches` table → `vouch_count` per candidate (`src/app/api/my-pipeline/route.ts` ~168–168, ~414–501).

**Data source (FitScore views):** `FitScoreRepository` selects `candidates(..., vouches(id, voucher_name, relationship_type, standout_sentence))` → `candidateVouches` in `src/lib/mappers.ts` ~647–649.

---

### A.2 Referral attribution

| Location                      | File (approx.)                                                                  | What user sees                                                         | Glance vs drill-down          |
| ----------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------- |
| Pipeline kanban card          | `RecruitPipelineCard.tsx` type ~67–80                                           | **Not rendered** (fields on `PipelineCandidate`)                       | N/A — data present, UI absent |
| Applications inbox            | `src/app/(dashboard)/recruit/applications/page.tsx`                             | **No** referrer fields in `ApplicationRow` or card UI                  | N/A                           |
| Candidate pool list           | `src/app/(dashboard)/recruit/candidates/page.tsx`                               | **No** referral columns                                                | N/A                           |
| Referrals program (org)       | `src/app/(dashboard)/company/referrals/**`                                      | Program/campaign management, not per-candidate attribution on pipeline | Different product surface     |
| Leadership home tile          | `src/components/home/tiles/leadership-tiles.tsx` `LhReferralLeadersTile` ~66–90 | Top referrers by **truncated UUID**, not name                          | Aggregate glance only         |
| Employee / referrer dashboard | `src/app/(dashboard)/dashboard/referrer/**`                                     | Referrer-facing, not recruiter pipeline                                | Out of brief scope            |
| WhatsApp / payout agents      | `src/lib/whatsapp/referral-handler.ts`, `payout-trigger.ts`                     | Backend                                                                | N/A                           |

**Data source (pipeline):** `/api/my-pipeline` sets `referrer_id`, `referrer_name`, `referrer_type`, `referrer_org_verified`, `referrer_verified_org_name`, `parent_referrer_name` (`route.ts` ~491–500).

---

### A.3 Trust-risk signals (ghost risk + authenticity)

| Signal                                     | Stored (examples)                                               | Surfaced in recruiter dashboard UI?                                                                            |
| ------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `ghost_risk_score` → label LOW/MEDIUM/HIGH | `candidates.ghost_risk_score`, `getGhostRiskLabel()`            | **Compact only:** `FitScoreReasoningPanel` ~521–562 (“Reliability: {label}”). **Not** on pipeline cards.       |
| `trust_score`                              | `candidates.trust_score`                                        | Compact chip **“Trust {n}”** in `FitScoreReasoningPanel` / unused `FitScoreCard`                               |
| `authenticity_signal` + reasons            | `candidates.authenticity_*`                                     | **Only** in unused `FitScoreCard.tsx` ~384–404 (“Authenticity check: …”). **Not** in `FitScoreReasoningPanel`. |
| Agent output                               | `src/lib/agents/ghostbuster-authenticity.ts`, `run-pipeline.ts` | Admin/agent routes; no recruit pipeline chrome                                                                 |

**Re-verified:** Grep over `src/app/(dashboard)/recruit/**/*.tsx` shows **no** `ghost_risk`, `authenticity_signal`, or `authenticity` rendering outside indirect use via shared components above.

**Important nuance:** UI copy uses **“Reliability”** / **“Reliability Signal (beta)”**, not “ghost risk” or raw scores — aligned with Brief 5 §5.1. Authenticity uses plain-language labels in dead `FitScoreCard` only.

---

### A.4 Data plumbing reference (no new pipelines needed for top surfaces)

| API / module                                             | Moat fields exposed                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `GET /api/my-pipeline`                                   | `vouch_count`, `referrer_*`, (no ghost/authenticity on pipeline row today)                                   |
| FitScore fetch (`FitScoreRepository` + `mapFitScoreRow`) | `candidateVouches`, `candidateGhostRiskLabel`, `candidateTrustScore`, `candidateAuthenticitySignal`, reasons |
| `GET /api/applications` (inbox)                          | `direct_referrer_id` in DB/export routes; **not** joined into inbox list UI                                  |
| Seed script                                              | `scripts/seed-qa-engineer-candidates.ts` pre-computes `ghost_risk_score`, vouches, referrals for demos       |

---

## Section B — Ranked recommendation (top 3 for Phase 2)

Scoring: **daily traffic** (1–5) · **decision relevance** (1–5) · **implementation cost** (5 = cheapest). Higher combined score = prioritize.

| Rank  | Surface                                                                         | Signals                  | Approach                                                                                                                                                                                                                                                                | Files to edit (est.)                                                           | Lines (est.) | Impact (one line)                                              |
| ----- | ------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------ | -------------------------------------------------------------- |
| **1** | **Pipeline kanban card** `/recruit/pipeline`, `/company/my-pipeline`            | Vouch + referral + trust | Upgrade pill to **“{n} vouches”** with tooltip (names/dates if added to API or single extra join); **“Referred by {name}”** badge when `referrer_name`; **“Trust review”** / reliability pill when `ghost_risk` added to pipeline payload _or_ proxy via fit-score join | `RecruitPipelineCard.tsx`; possibly `my-pipeline/route.ts` if ghost not on row | ~50–70       | Recruiters see moat on every card they drag all day            |
| **2** | **Candidate detail — FitScore verdict (full panel)** `/recruit/candidates/[id]` | All three                | Add moat strip to `FitScoreReasoningPanel` full layout (port from `FitScoreCard` ~546–595 + authenticity ~384–404): vouch list, reliability flag, authenticity plain-language label; tooltips, no raw scores                                                            | `FitScoreReasoningPanel.tsx` (reuse patterns from `FitScoreCard.tsx`)          | ~60–90       | Where hiring decisions are made after clicking a pipeline card |
| **3** | **Job matches list** `/recruit/jobs/[id]/matches`                               | Vouch + trust            | Replace compact text **“N vouch(es)”** / **“Reliability: X”** with same badge/tooltip system as pipeline; optional authenticity when signal fires                                                                                                                       | `JobMatchesSection.tsx`, `FitScoreReasoningPanel.tsx` (`compact` branch)       | ~40–55       | Triage at source when reviewing applicants per role            |

**Combined scores:** (1) 5+5+5 = 15 · (2) 4+5+4 = 13 · (3) 4+4+4 = 12.

**Phase 2 commit suggestion:** one commit per surface (per Brief 5 §5.3).

### B.1 Implementation notes (feasibility)

**Surface 1 — no new API if trust stays off pipeline cards initially**

- Referral + vouch: fields already on `PipelineCandidate` from `/api/my-pipeline`.
- Vouch tooltip detail: today only `vouch_count` is returned. Options: (a) tooltip “Vouched by peers” without names; (b) add `vouches: { voucher_name, created_at }[]` to my-pipeline response (additive JSON field — allowed by brief).
- Trust on card: requires `ghost_risk_score` or `authenticity_signal` on pipeline API **or** skip on card and rely on surface 2 — recommend **additive fields** on my-pipeline from existing candidate join (~15 lines in route).

**Surface 2 — no new API**

- `FitScoreReasoningPanel` already receives `score: FitScore` with moat fields populated by `mapFitScoreRow` when FitScore queries include candidate embed (already does in repository).

**Surface 3 — no new API**

- Same `score` object as job matches compact rows.

---

## Section C — Deferred surfaces

| Surface                                        | Why deferred                                                                                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Applications inbox** `/recruit/applications` | High triage traffic, but list API/types omit referrer/vouch/ghost; needs **API + type extension** before UI (~half a brief on its own). |
| **Candidate pool** `/recruit/candidates`       | Discovery, not primary decision path; no moat columns today.                                                                            |
| **Analytics** `/recruit/analytics`             | Aggregate funnel metrics; Brief 5 says no new aggregates; per-candidate moat belongs on pipeline/verdict.                               |
| **Jobs list** `/recruit/jobs`                  | Job-level cards; moat is candidate-level.                                                                                               |
| **Home tiles**                                 | Leadership referral tile shows UUID slices, not candidate attribution; poor moat story without redesign.                                |
| **Company referrals / campaigns**              | Program ops, not “who referred this applicant.”                                                                                         |
| **FitScoreCard.tsx**                           | Dead code in dashboard; merge patterns into `FitScoreReasoningPanel` instead of reviving a second component.                            |
| **Dedicated moat dashboard**                   | Explicitly out of scope (Brief 5 §8).                                                                                                   |
| **Admin agent / observability**                | Internal; not recruiter product surface.                                                                                                |

---

## Section D — Gaps / risks for Phase 2

| Risk                                             | Mitigation                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Pipeline tooltip needs vouch detail beyond count | Add optional `vouches[]` to my-pipeline row (additive); or Phase 2 ship count-only tooltip first |
| Duplicate moat clutter when all signals fire     | Brief 5: design multi-signal row in pipeline header; collapse to icons on narrow cards           |
| “Reliability” vs “Trust review” vocabulary       | Keep Brief 5 rule: plain language, no raw `ghost_risk_score` in UI                               |
| `FitScoreCard` drift                             | Do not wire `FitScoreCard` back in; port once into `FitScoreReasoningPanel`                      |
| HM uses same pipeline card                       | Surface 1 automatically covers HM my-pipeline                                                    |

---

## Section E — Suggested Santosh review checklist

1. Confirm **top 3**: Pipeline card · Candidate verdict panel · Job matches compact.
2. Swap **#3** for **Applications inbox** only if willing to approve small `/api/applications` list enrichment in same sprint.
3. Confirm whether pipeline cards should show **trust/authenticity** in Phase 2 or only on verdict panel (affects my-pipeline API scope).
4. Vouch tooltip: **count-only** OK for v1, or require **voucher names** in Phase 2?

---

---

## Section F — Phase 2 scope (Santosh-approved)

| Surface                          | Signals shown                            | Notes                                                                         |
| -------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| Pipeline kanban card             | Vouch count + referrer                   | **No** trust/authenticity on kanban (avoids clutter / accusatory framing)     |
| Candidate detail / verdict panel | All three                                | Voucher names, referral detail, trust review + authenticity in plain language |
| Job matches compact row          | Vouch badges + reliability (MEDIUM/HIGH) | Upgraded from plain text via `CompactMoatBadges`                              |

**API:** `GET /api/my-pipeline` returns additive `vouches: { voucher_name, relationship_type }[]` per row for tooltip names.

**Deferred:** Applications inbox (needs list API enrichment).

_Phase 1 inventory + Phase 2 decisions. Implementation in Brief 5 Phase 2 commits._
