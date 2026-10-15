# Agent Status And Gap Closure

Last updated: 2026-03-20

## Status Matrix

| Agent             | Planned in docs | Module                             | Trigger surfaces                        | Feature flag                             | Test coverage | Status               |
| ----------------- | --------------- | ---------------------------------- | --------------------------------------- | ---------------------------------------- | ------------- | -------------------- |
| orchestrator      | yes             | `src/lib/agents/orchestrator.ts`   | jobs orchestrator API, watchdog cron    | none                                     | unit covered  | implemented_active   |
| fitscore          | yes             | `src/lib/agents/fitscore-agent.ts` | fit-score API, admin API, cron, Inngest | `fitscore_hybrid_execution` (step-level) | unit covered  | implemented_active   |
| talent_scout      | yes             | `src/lib/agents/talent-scout.ts`   | admin API, cron                         | none                                     | unit covered  | implemented_active   |
| hiring_signal     | yes             | `src/lib/agents/hiring-signal.ts`  | admin scrape API                        | none                                     | partial       | implemented_partial  |
| scout             | yes             | `src/lib/agents/scout.ts`          | WhatsApp flow, admin API                | `scout_agent`                            | partial       | implemented_disabled |
| verify            | yes             | `src/lib/agents/verify.ts`         | scout chain, admin API                  | `verify_agent`                           | partial       | implemented_disabled |
| vouch             | yes             | `src/lib/agents/vouch.ts`          | WhatsApp flow, admin API                | `vouch_agent`                            | partial       | implemented_disabled |
| scheduler         | yes             | `src/lib/agents/scheduler.ts`      | pipeline APIs, admin API                | `scheduler_agent`                        | unit covered  | implemented_disabled |
| consent           | yes             | `src/lib/agents/consent.ts`        | WhatsApp flow, admin API                | `consent_flow`                           | partial       | implemented_disabled |
| cv_parser         | yes             | `src/lib/agents/cv-parser.ts`      | apply/upload/debug routes, Inngest      | none                                     | unit covered  | implemented_active   |
| normalizer        | yes             | `src/lib/agents/normalizer.ts`     | cv-parser pipeline                      | none                                     | unit covered  | implemented_active   |
| validator         | yes             | `src/lib/agents/validator.ts`      | cv-parser pipeline                      | none                                     | unit covered  | implemented_active   |
| auto_reply        | yes             | `src/lib/agents/auto-reply.ts`     | admin API/manual trigger                | none                                     | pending       | implemented_partial  |
| info_request      | yes             | `src/lib/agents/info-request.ts`   | admin API/manual trigger                | none                                     | pending       | implemented_partial  |
| linkedin_importer | yes             | missing                            | none                                    | n/a                                      | none          | missing              |

## Wiring Verification

- Queue to Inngest mappings now exist for all declared queue job names in `src/lib/jobs/queue.ts`.
- Inngest route now registers `fitScoreBatch` plus `orchestrator-advance`, `pipeline-reminder`, and `webhook-process` handlers in `src/app/api/inngest/route.ts`.
- Orchestrator watchdog now reads normalized env defaults from `src/lib/config/env.ts`.
- Trust score cron is now scheduled in `vercel.json` at `0 4 * * *`.
- Admin agent trigger endpoint now supports: `talent_scout`, `fitscore`, `scout`, `verify`, `scheduler`, `vouch`, `consent`, `auto_reply`, `info_request`.

## Prioritized Gap Closure Order

1. Activate existing flagged pipeline in safe order: `scout -> verify -> vouch -> scheduler -> consent`.
2. Roll out new partial agents in manual mode first: `auto_reply`, then `info_request`.
3. Add productized trigger paths for `auto_reply` and `info_request` from orchestration checkpoints.
4. Implement `linkedin_importer` as the next missing module.

## Required Test Coverage Before Full Rollout

- `src/lib/jobs/queue.ts`: assert mapped jobs do not silently drop without logs.
- `src/app/api/inngest/route.ts`: assert all expected functions are registered.
- `src/app/api/admin/agents/route.ts`: verify success and validation failures for newly supported agent names.
- `src/lib/agents/normalizer.ts`: skill aliasing, dedupe, salary range normalization.
- `src/lib/agents/validator.ts`: mismatch flags and identity missing checks.
- `src/lib/agents/cv-parser.ts`: parsed output includes validator flags in `authenticity_flags` when detected.
