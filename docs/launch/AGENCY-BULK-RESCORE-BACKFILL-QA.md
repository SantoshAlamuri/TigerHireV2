# QA: Agency bulk rescore and pipeline backfill

**Purpose:** Validate [FEATURE-INVENTORY row — agency §17](../requirements/FEATURE-INVENTORY-LIVING.md#17-agency-specific) **partial** paths before telling a **tenant** that heavy **bulk** operations are production-safe. File bugs for gaps.

**When to run:** Staging (or a dry-run tenant) before a large data migration, after a FitScore or pipeline schema change, or when onboarding a new **agency** org.

## APIs under test

| Route                                 | File                                                                                | What it does                                                                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/agency/rescore-candidates` | [rescore-candidates/route.ts](../../src/app/api/agency/rescore-candidates/route.ts) | Rescores fit for pipeline candidate pairs; paginate with offset (see in-file cap).                                                |
| `POST /api/agency/backfill-pipeline`  | [backfill-pipeline/route.ts](../../src/app/api/agency/backfill-pipeline/route.ts)   | Backfills pipeline rows from existing fit scores when data was missing.                                                           |
| `POST /api/agency/pipeline/bulk`      | (see `src/app/api/agency/`)                                                         | **Also** exercise UI bulk from `/agency/pipeline` per release.                                                                    |
| `POST /api/agency/.../bulk`           | [upload-profile etc.](../../src/app/api/agency/)                                    | See [feature inventory — §17](../requirements/FEATURE-INVENTORY-LIVING.md#17-agency-specific); add rows when new bulk paths ship. |

## Test script (minimum)

1. **Auth:** Sign in as an `agency` user tied to a **test** client org with a handful of open jobs and pipeline rows.
2. **Rescore (small):** Call `POST /api/agency/rescore-candidates` with a **narrow** range (limit ≤ max in route). Expect `200` and a non-error message, or a clear `No pipeline candidates` when empty.
3. **Rescore (stress, optional):** Increase volume on **staging** only; watch Vercel **function time** and Inngest if the route triggers background work.
4. **Backfill:** With known fit scores and missing pipeline links in **fixture** data, call `POST /api/agency/backfill-pipeline`. Expect idempotent or safe second run (verify with engineers).
5. **UI:** On `/agency/pipeline`, run the **same** action the UI uses (if different from raw API) and confirm table refresh.
6. **Log / audit:** Confirm no PII in error logs; tenant isolation holds (no cross-client IDs).

**Exit:** Pass all steps on staging, then repeat **smoke** in prod with **one** real customer after a release if they depend on this path.

**If something fails:** Open an issue with **request body shape**, **response code**, and **rough row counts**; label “agency + partial-gaps.”
