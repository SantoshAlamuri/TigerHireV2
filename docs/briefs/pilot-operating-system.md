# Pilot Operating System

Master brief for the managed-hire loop: configure hiring → move candidates → act in `/tasks` → trust automation and role-specific scoring.

## Four layers

| Layer                    | What                                                | Brief                                                                                                                                |
| ------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1 — Data truth           | Plan stage save writes through to `pipeline_stages` | [plan-pipeline-write-through.md](./plan-pipeline-write-through.md)                                                                   |
| 2 — Automation trust     | Phone Screen → screening → card                     | Screening checklist below                                                                                                            |
| 3 — Recruiter inbox      | Inline task drawer for all `act` kinds              | Brief #2 (task drawer); **filters after panels**                                                                                     |
| 4 — Reach + intelligence | Email fallback + JD template rubric                 | [notification-email-fallback.md](./notification-email-fallback.md), [jd-base-template-selection.md](./jd-base-template-selection.md) |

## Week 1 gate (sequential)

1. Preview smokes: `npm run test:e2e:smoke` (see `scripts/phase0-smoke-checklist.md`)
2. Meta: approve `th_screening_invite`; set plan stage `comms_template` on Phone Screen (not only `WHATSAPP_SCREENING_TEMPLATE_NAME`)
3. Promote `dev` → `main` after `npm run launch:enterprise-ready`
4. Demo job: `npm run seed:pilot-demo`

## Demo job recipe

- **Title:** Backend Engineer
- **JD Base:** approved, from India template library
- **Plan:** Phone Screen `stage_type = phone_screen`, optional `comms_template = th_screening_invite`
- **Candidates:** 1 Applied, 1 Phone Screen (screening test), 1 Interview (slot-picker task)
- **Tasks:** at least one approval, feedback overdue, interviewer assignment

## Screening verification (0.5 day test session)

Two tracks — do not conflate:

| Track              | UI                                | Trigger                                       |
| ------------------ | --------------------------------- | --------------------------------------------- |
| Pre-screen yes/no  | Candidate page → Pre-screen block | Apply flow                                    |
| AI WhatsApp screen | `CandidateScreeningCard`          | Move to Phone Screen + `FF_PLAN_AUTO_EXECUTE` |

### Checklist

1. Flags on preview: `FF_PLAN_DOCUMENT`, `FF_PLAN_AUTO_EXECUTE` (`node scripts/print-plan-beta-env.mjs`)
2. Demo job configured (`npm run seed:pilot-demo`)
3. Move candidate to Phone Screen → `screening_jobs` row created
4. Reply YES on WhatsApp → `summary_json` on card + application CTC/notice fields
5. If broken, trace: pipeline move → `dispatchPlanStageOnCandidateMove` → `triggerScreeningAfterFitScore` → `whatsapp-flow` → `persist-summary-to-application`

**Note:** `WHATSAPP_SCREENING_TEMPLATE_NAME` is for pre-apply link templates, not plan `th_screening_invite`.

## Child briefs

- [plan-pipeline-write-through.md](./plan-pipeline-write-through.md) — Brief #3
- [notification-email-fallback.md](./notification-email-fallback.md) — Brief #4
- [jd-base-template-selection.md](./jd-base-template-selection.md) — Brief #5

Brief #2 (task drawer): prioritize inline panels over inbox filters.
