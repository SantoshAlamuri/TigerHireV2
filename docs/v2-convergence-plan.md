# Converging v2 onto canonical routes — without losing features

The `/recruit/v2` prefix produced most of the defects found on 2026-07-30: a route
policy that locked hiring managers out of their own seat, an agency grant that
briefly exposed the org candidate database, a half-migrated nav, and a v2
analytics page recomputing from a 100-row sample what v1 already served from SQL
views. Two homes for one screen means every permission, nav entry and metric has
two definitions, and they drift.

So screens converge onto their canonical routes, one seat at a time.

**Analytics is done** (now `/recruit/analytics`, legacy report at
`/recruit/analytics/legacy`) and is the template: move the directory onto the canonical
path, point the registry at it, and keep anything the redesign has NOT replaced at
`<route>/legacy`, registered and linked. Deleting a page whose features have no
replacement is not convergence, it is loss.

## Feature deltas that must be closed BEFORE each move

Measured by comparing links and action labels present in the v1 page and absent
from its v2 counterpart. This is the list that stops the redesign from shipping
as a downgrade.

### `/recruit/jobs` — v1 212 lines, v2 171 — **NOT A DELTA**

| Claimed missing     | What it actually is                                                                                                                                                                                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/recruit/jobs/new` | Recorded as a dropped capability, and briefly "restored" as a Create directly button. That was wrong: the route is a **stub** whose whole content is the sentence "Jobs are created only from approved requisitions". Nothing was ever lost, and the button advertised a capability that does not exist. Removed. |

The lesson generalises: a delta measured by comparing **links** counts a link to
an explainer page as a feature. Before restoring anything from this table,
open the v1 route and confirm it does the thing its name implies.

The real gap here is not direct creation — it is that the requisition chain is
**not configurable**. See "Requisition approval is hardcoded" below.

## Requisition approval is hardcoded

`src/lib/workflows/requisition-approval-definitions.ts` holds exactly two
presets, and both of them always require Finance:

| Key                                  | Chain                        |
| ------------------------------------ | ---------------------------- |
| `requisition_linear_v1` (default)    | Finance → Admin              |
| `requisition_parallel_hr_finance_v1` | Finance + Admin, in parallel |

The settings page picks between those two and nothing else. A company whose
policy is "recruiter → company admin", or "HM → company admin → recruiter", or
one that has no finance function at all, cannot express it — and there is no
way to say that a given role skips approval entirely.

The runtime is not the blocker. `workflow_instances` / `workflow_stages`
already execute an arbitrary chain: each stage carries a key, an order, an
approver role and its own SLA clock, and parallel stages are just a shared
`stage_order`. What is missing is a **definition** an org can author, plus skip
rules. That is a schema addition and a builder UI, not a rewrite.

### `/recruit/candidates` — v1 493 lines, v2 237 — **CLOSED**

All four restored in `src/lib/v2/candidate-filters.ts` with tests. Kept for the
record of what was nearly lost:

| Missing in v2                            | Note                                           |
| ---------------------------------------- | ---------------------------------------------- |
| **Filter by function** ("All functions") | v2 groups by role but cannot filter            |
| **Filter by location** ("All locations") | absent entirely                                |
| **Intent signal**                        | a scoring/sort signal with no v2 equivalent    |
| Empty state ("No candidates match")      | v2 has no no-results state for a filtered list |

The line-count drop is not all savings: roughly half of it is these four
capabilities. Leaner is the goal; lesser is not.

## Seat order

1. **Recruiter** — most complete, and its screens are reused by other seats.
   Retires most of the `/recruit/v2` prefix. Close the deltas above first.
2. **Hiring manager** — needs BUILDING, not trimming, and **requisition raising
   is the blocker, not a nice-to-have**. The operator's flow is HM raises →
   leadership approves → recruiter works it, so raising a requisition is the
   FIRST thing this seat does. The v2 HM seat has no path to it, nor to JD or
   ICP/rubric approval, all of which the route policy grants them today. Its nav
   cannot switch until these exist, or hiring managers lose the work they are
   accountable for.
3. **Head of Talent** — `ta:portfolio`, `ta:gov`, `ta:rubric` unbuilt.
4. **Agency** — last. Route access is deliberately revoked until
   `/recruit/v2/candidates`, `/candidates/pool`, `/setup` and `/setup/benchmarks`
   gate their own content; today they have no role check at all, so route policy
   is the only barrier. Two of its screens are also unbuilt.

## Verification per seat

CI did not catch a single one of the defects above. Each was found by opening a
page as a specific login. So each seat's convergence ends with: load the dev
preview **as that role**, and confirm nothing in its delta table regressed.
