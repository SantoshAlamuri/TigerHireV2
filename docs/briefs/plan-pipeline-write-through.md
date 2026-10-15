# Brief #3 — Plan → pipeline write-through

## Problem

`POST /api/jobs/[id]/recruitment-plan/stages` saved only `plan_stages`. Renames and reorders drifted from `pipeline_stages`, breaking counts and automation resolution.

## Solution

`syncPlanStagesToPipeline()` in `src/lib/recruitment-plan/sync-plan-stages-to-pipeline.ts`, called after successful plan stage save.

### When `pipeline_stage_id` is set

- Update `stage_name`, `stage_order`, `sla_days`, `feedback_template_id`, interviewer fields
- Locked system stages: update interviewer/SLA only (no rename/reorder)

### When `pipeline_stage_id` is null

- Insert new `pipeline_stages` row and set FK on `plan_stages`
- Run `linkPlanStagesToPipeline` for any remaining null FKs

## Out of scope

- Pipeline editor → plan (bidirectional)
- Deleting pipeline columns when plan stages deactivate

## Acceptance

- Rename Phone Screen on Plan → pipeline kanban label updates
- Candidate counts on Plan document stay consistent with pipeline

## Tests

`tests/unit/recruitment-plan-stages-sync.test.ts`
