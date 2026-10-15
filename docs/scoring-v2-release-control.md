# Scoring V2 Release Control Sheet

> **SUPERSEDED (2026-07-08).** This document is a historical snapshot; its dates,
> task states, and flag references are no longer accurate. Current status:
> [`docs/ops/STATUS-2026-07-08.md`](ops/STATUS-2026-07-08.md) · launch
> decision: [`docs/launch/GO-NO-GO-JUN-2026.md`](launch/GO-NO-GO-JUN-2026.md).

Last Updated: 2026-04-27T19:15:00+05:30  
Source of Truth: This file  
Purpose: Verification-first release control for Dimensions Ontology / FitScore rollout

## Operating Rules

- This sheet is mandatory and governs rollout decisions.
- Cursor generated the scaffold only. **Status updates are human-owned** and must be made via PR review.
- Allowed status enum only: `BLOCKED`, `IN_PROGRESS`, `GREEN`, `RED`.
- A row can be `GREEN` only when evidence is attached in the required format.
- Required evidence types per row: command output paste, SQL result rows, PR link, or screenshot path.
- "Looks good", "passed locally", or "should be fine" are not valid evidence.

## Current State Snapshot

| Area                    | Status      | Owner                      | Evidence                                                   | Timestamp                 | Notes                                            |
| ----------------------- | ----------- | -------------------------- | ---------------------------------------------------------- | ------------------------- | ------------------------------------------------ |
| Phase 1                 | IN_PROGRESS | Santosh                    | Pending gate evidence in Sections A/D/C1                   | 2026-04-27T19:15:00+05:30 | Code landed; acceptance gates pending            |
| Phase 2                 | IN_PROGRESS | Santosh + Trust-risk owner | Pending schema lock sign-off for `evidence_type`           | 2026-04-27T19:15:00+05:30 | Schema landed in code; coordination gate pending |
| Phase 3                 | RED         | Santosh                    | V2 prompts in scaffold form, shadow evidence not collected | 2026-04-27T19:15:00+05:30 | Not promotable                                   |
| Phase 4                 | IN_PROGRESS | Santosh                    | Docs present only                                          | 2026-04-27T19:15:00+05:30 | Operational promotion not executed               |
| Staging deploy state    | IN_PROGRESS | [ENGINEER_NAME_REQUIRED]   | Link deploy run / commit SHA                               | [TIMESTAMP_REQUIRED]      | Fill before Section B                            |
| Production deploy state | IN_PROGRESS | [ENGINEER_NAME_REQUIRED]   | Link deploy run / commit SHA                               | [TIMESTAMP_REQUIRED]      | Fill before Section E                            |

### Flag Snapshot (must be kept current)

| Environment | scoring_phase1_wiring | scoring_v2_shadow_enabled | scoring_v2_primary | Owner                    | Evidence                                    | Timestamp            | Notes |
| ----------- | --------------------: | ------------------------: | -----------------: | ------------------------ | ------------------------------------------- | -------------------- | ----- |
| Staging     |      [VALUE_REQUIRED] |          [VALUE_REQUIRED] |   [VALUE_REQUIRED] | [ENGINEER_NAME_REQUIRED] | SQL output paste from `feature_flags` query | [TIMESTAMP_REQUIRED] |       |
| Production  |      [VALUE_REQUIRED] |          [VALUE_REQUIRED] |   [VALUE_REQUIRED] | [ENGINEER_NAME_REQUIRED] | SQL output paste from `feature_flags` query | [TIMESTAMP_REQUIRED] |       |

## Global Gates

- Section B is `BLOCKED` until Section A is fully `GREEN`.
- Section C is `BLOCKED` until Section B is fully `GREEN`.
- Section E is `BLOCKED` until Section C and Section D staging gates are `GREEN` for required duration.
- Any `RED` row in active section blocks progression.

---

## Section A — Pre-Staging Verification (No new migrations, no flag flips)

Status: `IN_PROGRESS`  
Owner: Santosh  
Gate to unlock Section B: All rows `GREEN`

| ID  | Check                                                            | Status      | Owner                    | Evidence (required format)                                    | Timestamp                 | Notes                                                                                                     |
| --- | ---------------------------------------------------------------- | ----------- | ------------------------ | ------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| A1  | Integration test mock audit for changed layers                   | RED         | Santosh                  | `rg` output pasted for both integration tests                 | 2026-04-27T19:15:00+05:30 | `fitscore-hybrid-routing.test.ts` mocks scorer/hybrid; must be replaced with no-mock integration coverage |
| A2  | Load-bearing diff audit (`FitScoreService`, `stage1-role-intel`) | IN_PROGRESS | Santosh                  | `git diff main -- <file>` output paste with reviewer sign-off | [TIMESTAMP_REQUIRED]      | Confirm no unintended behavior with all flags OFF                                                         |
| A3  | Confirm `scoring_phase1_wiring` default false in migration SQL   | IN_PROGRESS | Santosh                  | SQL file excerpt pasted from migration                        | [TIMESTAMP_REQUIRED]      | Must be migration-level default evidence                                                                  |
| A4  | V2 prompt quality audit (real prompt vs scaffold)                | RED         | Santosh                  | Prompt review notes + approval PR link                        | 2026-04-27T19:15:00+05:30 | Current prompts are scaffold-level; require explicit approval or TODO block                               |
| A5  | Legacy NULL handling (`rubric_version_id`) in UI/API             | IN_PROGRESS | [ENGINEER_NAME_REQUIRED] | Screenshot path(s) + test result/PR link                      | [TIMESTAMP_REQUIRED]      | Legacy rows must render safe fallback label                                                               |
| A6  | Regression labeled-set gate readiness and run status             | RED         | Santosh                  | Regression run artifact link + tolerance report               | 2026-04-27T19:15:00+05:30 | Gate not yet executed; required before claiming Phase 1 acceptance                                        |

### A Rollback Procedure (if accidental flag/migration run occurs)

- Rollback Owner: Santosh + [ENGINEER_NAME_REQUIRED]
- Action: Set affected flag(s) to `false` immediately and stop rollout.
- Notification: Post in `#scoring-rollout` within 5 minutes with root cause and timestamp.

---

## Section B — Staging Migration Order

Status: `BLOCKED`  
Owner: [ENGINEER_NAME_REQUIRED]  
Block reason: Section A has `RED` rows

**Do not execute while Section A is not fully GREEN.**

| ID  | Migration                                                     | Status  | Owner                                 | Evidence (required format)                            | Timestamp            | Notes                                      |
| --- | ------------------------------------------------------------- | ------- | ------------------------------------- | ----------------------------------------------------- | -------------------- | ------------------------------------------ |
| B1  | `20260427190000_add_rubric_version_to_fit_scores.sql`         | BLOCKED | [ENGINEER_NAME_REQUIRED]              | Migration run log + SQL verify output                 | [TIMESTAMP_REQUIRED] | Verify column exists and backfill behavior |
| B2  | `20260427191000_add_dimension_node.sql`                       | BLOCKED | [ENGINEER_NAME_REQUIRED]              | Migration run log + table/constraint check SQL output | [TIMESTAMP_REQUIRED] |                                            |
| B3  | **Pause gate**: trust-risk schema lock before `evidence_type` | BLOCKED | Santosh + [TRUST_RISK_OWNER_REQUIRED] | Sign-off link (issue/PR/comment)                      | [TIMESTAMP_REQUIRED] | Mandatory before B4                        |
| B4  | `20260427192000_add_evidence_type.sql`                        | BLOCKED | [ENGINEER_NAME_REQUIRED]              | Migration run log + row/constraint check SQL output   | [TIMESTAMP_REQUIRED] |                                            |
| B5  | `20260427193000_add_evidence_to_dimension_link.sql`           | BLOCKED | [ENGINEER_NAME_REQUIRED]              | Migration run log + FK/unique index checks            | [TIMESTAMP_REQUIRED] | Verify global/role uniqueness behavior     |
| B6  | `20260427194000_add_scoring_config.sql`                       | BLOCKED | [ENGINEER_NAME_REQUIRED]              | Migration run log + PK/index checks                   | [TIMESTAMP_REQUIRED] |                                            |
| B7  | `20260427195000_add_rubric_version.sql`                       | BLOCKED | [ENGINEER_NAME_REQUIRED]              | Migration run log + index checks                      | [TIMESTAMP_REQUIRED] |                                            |
| B8  | `20260427200000_add_fit_scores_v2.sql`                        | BLOCKED | [ENGINEER_NAME_REQUIRED]              | Migration run log + table/flag seed checks            | [TIMESTAMP_REQUIRED] | Confirm both V2 flags default false        |

### B Rollback Procedure

- Rollback Owner: [ENGINEER_NAME_REQUIRED]
- Action: Stop migration chain, apply rollback migration only if reviewed and approved.
- Notification: Post in `#scoring-rollout` within 5 minutes with migration ID and DB state.

---

## Section C — Staging Flag Rollout (One flag at a time)

Status: `BLOCKED`  
Owner: Santosh + [ENGINEER_WATCHER_REQUIRED]  
Block reason: Section B not fully GREEN

**No parallel flag flips. Move one row at a time.**

| ID  | Step                                                             | Status  | Owner                                 | Evidence (required format)                                        | Timestamp            | Notes                                                                           |
| --- | ---------------------------------------------------------------- | ------- | ------------------------------------- | ----------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------- |
| C1  | Flip `scoring_phase1_wiring=true` only; observe 48h              | BLOCKED | Santosh + [ENGINEER_WATCHER_REQUIRED] | Flag change screenshot + 48h metric snapshots + SQL query outputs | [TIMESTAMP_REQUIRED] | Rollback trigger: generic usage >= 10% OR dimensions_json < 100% OR error spike |
| C2  | Flip `scoring_v2_shadow_enabled=true` only after C1 GREEN        | BLOCKED | Santosh + [ENGINEER_WATCHER_REQUIRED] | Flag change evidence + shadow coverage/delta/cost query outputs   | [TIMESTAMP_REQUIRED] | Rollback trigger: cost > 2.5x baseline OR write failures OR unstable deltas     |
| C3  | Keep `scoring_v2_primary=false` until shadow duration/gates pass | BLOCKED | Santosh + [ENGINEER_WATCHER_REQUIRED] | Weekly gate review artifact link                                  | [TIMESTAMP_REQUIRED] | Primary cannot be enabled before shadow gate evidence                           |

### C Rollback Procedure

- Rollback Owner: Santosh + [ENGINEER_WATCHER_REQUIRED]
- Action: Set current active rollout flag to `false` immediately.
- Notification: Post in `#scoring-rollout` within 5 minutes with trigger metric and threshold breach.

---

## Section D — Validation Queries (Gate Evidence)

Status: `IN_PROGRESS`  
Owner: [ENGINEER_NAME_REQUIRED]

### D1 — Phase 1 Gate: `dimensions_json` coverage must be 100%

```sql
with scoped as (
  select created_at, dimensions_json
  from public.fit_scores
  where created_at >= :deploy_time
    and is_test_run = false
)
select
  count(*) as total_rows,
  count(*) filter (where dimensions_json is not null) as populated_rows,
  round(100.0 * count(*) filter (where dimensions_json is not null) / nullif(count(*),0), 2) as populated_pct
from scoped;
```

| ID  | Status      | Owner                    | Evidence              | Timestamp            | Notes                  |
| --- | ----------- | ------------------------ | --------------------- | -------------------- | ---------------------- |
| D1  | IN_PROGRESS | [ENGINEER_NAME_REQUIRED] | Paste SQL output rows | [TIMESTAMP_REQUIRED] | Must be exactly 100.00 |

### D2 — Pre-flag baseline: `rubric_version_id` populated vs NULL

```sql
select
  count(*) as total_rows,
  count(*) filter (where rubric_version_id is not null) as populated_rows,
  count(*) filter (where rubric_version_id is null) as null_rows,
  round(100.0 * count(*) filter (where rubric_version_id is null) / nullif(count(*),0), 2) as null_pct
from public.fit_scores;
```

| ID  | Status      | Owner                    | Evidence              | Timestamp            | Notes                                                       |
| --- | ----------- | ------------------------ | --------------------- | -------------------- | ----------------------------------------------------------- |
| D2  | IN_PROGRESS | [ENGINEER_NAME_REQUIRED] | Paste SQL output rows | [TIMESTAMP_REQUIRED] | NULLs acceptable for legacy rows; UI must handle gracefully |

### D3 — Rubric distribution after Phase 1 flag-on

```sql
select
  coalesce(rubric_version_id, 'legacy_null') as rubric_version_id,
  coalesce(rubric_snapshot->>'role_title', 'unknown_role') as role_title,
  count(*) as row_count
from public.fit_scores
where created_at >= :deploy_time
  and is_test_run = false
group by 1,2
order by row_count desc;
```

| ID  | Status      | Owner                    | Evidence              | Timestamp            | Notes                                              |
| --- | ----------- | ------------------------ | --------------------- | -------------------- | -------------------------------------------------- |
| D3  | IN_PROGRESS | [ENGINEER_NAME_REQUIRED] | Paste SQL output rows | [TIMESTAMP_REQUIRED] | Verify non-generic rubric pickup for matched roles |

### D4 — Shadow coverage denominator (must run before delta query)

```sql
with v1_pairs as (
  select distinct job_id, candidate_id
  from public.fit_scores
  where created_at >= :deploy_time
    and is_test_run = false
),
v2_pairs as (
  select distinct job_id, candidate_id
  from public.fit_scores_v2
  where created_at >= :deploy_time
)
select
  (select count(*) from v1_pairs) as v1_pair_count,
  (select count(*) from v2_pairs) as v2_pair_count,
  (select count(*) from v1_pairs join v2_pairs using (job_id, candidate_id)) as overlap_pair_count;
```

| ID  | Status      | Owner                    | Evidence              | Timestamp            | Notes                                                        |
| --- | ----------- | ------------------------ | --------------------- | -------------------- | ------------------------------------------------------------ |
| D4  | IN_PROGRESS | [ENGINEER_NAME_REQUIRED] | Paste SQL output rows | [TIMESTAMP_REQUIRED] | Do not interpret delta results without this coverage context |

### D5 — V1 vs V2 delta distribution

```sql
with v1_latest as (
  select distinct on (job_id, candidate_id)
    job_id, candidate_id, overall_score as v1_score, created_at
  from public.fit_scores
  where is_test_run = false
  order by job_id, candidate_id, created_at desc
),
v2_latest as (
  select distinct on (job_id, candidate_id)
    job_id, candidate_id, score as v2_score, created_at
  from public.fit_scores_v2
  order by job_id, candidate_id, created_at desc
)
select
  count(*) as compared_pairs,
  round(avg(abs(v2.v2_score - v1.v1_score)), 2) as mean_abs_delta,
  percentile_cont(0.5) within group (order by abs(v2.v2_score - v1.v1_score)) as p50_abs_delta,
  percentile_cont(0.95) within group (order by abs(v2.v2_score - v1.v1_score)) as p95_abs_delta
from v1_latest v1
join v2_latest v2 using (job_id, candidate_id);
```

| ID  | Status      | Owner                    | Evidence              | Timestamp            | Notes                                             |
| --- | ----------- | ------------------------ | --------------------- | -------------------- | ------------------------------------------------- |
| D5  | IN_PROGRESS | [ENGINEER_NAME_REQUIRED] | Paste SQL output rows | [TIMESTAMP_REQUIRED] | Phase 3 evidence; interpret only with D4 coverage |

---

## Section E — Production Rollout (Only after staging gates are GREEN for required duration)

Status: `BLOCKED`  
Owner: Santosh + [ENGINEER_WATCHER_REQUIRED]  
Block reason: staging gates incomplete

| ID  | Step                                                | Status  | Owner                                 | Evidence (required format)                                      | Timestamp            | Notes                                   |
| --- | --------------------------------------------------- | ------- | ------------------------------------- | --------------------------------------------------------------- | -------------------- | --------------------------------------- |
| E1  | `scoring_phase1_wiring` ramp 10% -> 50% -> 100%     | BLOCKED | Santosh + [ENGINEER_WATCHER_REQUIRED] | Flag change logs + metric snapshots per ramp step               | [TIMESTAMP_REQUIRED] | Hold each step 24-48h minimum           |
| E2  | `scoring_v2_shadow_enabled` ramp 10% -> 50% -> 100% | BLOCKED | Santosh + [ENGINEER_WATCHER_REQUIRED] | Flag logs + D4/D5 + cost trend evidence                         | [TIMESTAMP_REQUIRED] | Only after E1 stable                    |
| E3  | `scoring_v2_primary` ramp 10% -> 50% -> 100%        | BLOCKED | Santosh + [ENGINEER_WATCHER_REQUIRED] | Gate review artifact + support trend + rollback readiness proof | [TIMESTAMP_REQUIRED] | Maintain 2-week V1 shadow safety window |

### E Rollback Procedure

- Rollback Owner: Santosh + [ENGINEER_WATCHER_REQUIRED]
- Action: Set active production rollout flag to `false`; freeze further ramps.
- Notification: Post in `#scoring-rollout` and `#engineering-incidents` within 5 minutes.
- Required payload: flag name, prior value, new value, trigger metric, timestamp, owner.

---

## Section F — Parallel Required Workstreams

Status: `IN_PROGRESS`  
Owner: Santosh

These are parallel to rollout flow, but each blocks named gates.

| ID  | Workstream                                              | Status      | Owner                                 | Blocks Gate                     | Evidence                    | Timestamp            | Notes                                       |
| --- | ------------------------------------------------------- | ----------- | ------------------------------------- | ------------------------------- | --------------------------- | -------------------- | ------------------------------------------- |
| F1  | Eval harness + HM-verdicted candidates                  | IN_PROGRESS | Santosh + [DATA_OWNER_REQUIRED]       | Phase 3 promotion decision      | Eval dashboard/report link  | [TIMESTAMP_REQUIRED] | Required for full PRD promotion confidence  |
| F2  | DPDP/consent scope confirmation for new evidence typing | IN_PROGRESS | Santosh + [LEGAL_OWNER_REQUIRED]      | Phase 2 production rollout      | Approval doc link           | [TIMESTAMP_REQUIRED] | Must confirm data shape in consent envelope |
| F3  | Marketing copy reconciliation with runtime truth        | IN_PROGRESS | Santosh + [MARKETING_OWNER_REQUIRED]  | Phase 1 promotion communication | Copy diff/release note link | [TIMESTAMP_REQUIRED] | Prevent claims/runtime drift                |
| F4  | Trust-risk ontology coordination on shared schema       | IN_PROGRESS | Santosh + [TRUST_RISK_OWNER_REQUIRED] | Phase 2 schema lock             | Sign-off link               | [TIMESTAMP_REQUIRED] | Mandatory before evidence_type finalization |

---

## Decisions Log

Capture decisions that affect schema, scoring, UI, and rollout behavior.

| Date            | Decision                                                | Decider(s)         | Rationale            | Impacted Sections   | Evidence                |
| --------------- | ------------------------------------------------------- | ------------------ | -------------------- | ------------------- | ----------------------- |
| [DATE_REQUIRED] | Confidence band display format (qualitative vs numeric) | [DECIDER_REQUIRED] | [RATIONALE_REQUIRED] | [SECTIONS_REQUIRED] | [LINK_OR_NOTE_REQUIRED] |
| [DATE_REQUIRED] | Conditional composition renormalization policy          | [DECIDER_REQUIRED] | [RATIONALE_REQUIRED] | [SECTIONS_REQUIRED] | [LINK_OR_NOTE_REQUIRED] |
| [DATE_REQUIRED] | Sub-signal depth limit                                  | [DECIDER_REQUIRED] | [RATIONALE_REQUIRED] | [SECTIONS_REQUIRED] | [LINK_OR_NOTE_REQUIRED] |
| [DATE_REQUIRED] | Score snapshot policy (hard pin vs re-score)            | [DECIDER_REQUIRED] | [RATIONALE_REQUIRED] | [SECTIONS_REQUIRED] | [LINK_OR_NOTE_REQUIRED] |

---

## Change Control

- Every status change (`BLOCKED`, `IN_PROGRESS`, `GREEN`, `RED`) requires:
  - PR update to this file,
  - evidence attached in row format,
  - reviewer sign-off.
- Status-only changes without evidence must be rejected in review.

## Post-Launch Checklist

- Set up test Supabase project, re-enable `fitscore-routing-db-ci` workflow.
