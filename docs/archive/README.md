# Docs archive

Historical engineering docs that are no longer actionable but preserved for audit trail and context.

**These docs are not deleted because:**

- They contain time-stamped evidence (DNS checks, prod probes, schema verification) that might be relevant during a future incident postmortem.
- They document the reasoning behind decisions that are now embedded in current code or runbooks.
- Linking back to them from postmortems or onboarding sessions is occasionally useful.

**These docs are not in the main `docs/` tree because:**

- Their content has been superseded by later versions or by code-as-truth (e.g. CVE patches, infra checklist updates).
- Keeping them inline made it harder to tell at a glance which engineering docs are "current and authoritative."
- The April-2 launch cycle and April-25 pre-launch verification cycle are both complete and won't be re-run in their original form.

## What's in here

### `2026-q1-q2/`

Engineering docs that were closed out or superseded between Q1 2026 and the pre-beta sweep on 2026-05-12.

| File                                     | Why archived                                                                                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APRIL_2ND_LAUNCH_EXECUTIVE_SUMMARY.md`  | April 2 launch cycle is complete. Beta cohort planning lives in current `docs/launch/` docs.                                                                           |
| `APRIL_2ND_LAUNCH_MILESTONES.md`         | Same — milestone tracker for a past launch cycle.                                                                                                                      |
| `APRIL_2ND_LAUNCH_PLAN.md`               | Same — original April-2 launch plan.                                                                                                                                   |
| `APRIL_2ND_LAUNCH_TASK_TRACKER.md`       | Same — task tracker; live tracker is now `docs/launch/PRE-LAUNCH-INFRA-CHECKLIST.md` for beta-readiness items.                                                         |
| `PUNCH-LIST-2026-04-24.md`               | April 24 verification-cycle punch list. Superseded by 2026-05-12 sweep.                                                                                                |
| `READINESS-GAP-TO-CLOSURE-2026-05-03.md` | Closed by the 2026-05-12 work (DNS fix, PostHog/Sentry wiring, Next.js CVE patch, tech-debt re-audit). Useful as a snapshot of what we believed was open in early May. |
| `PRA_FLAG_SNAPSHOT_2026-04-25.md`        | April 25 PRA flag snapshot — historical evidence.                                                                                                                      |
| `PRELAUNCH_EXECUTION_LOG_2026-04-25.md`  | April 25 execution log — historical evidence.                                                                                                                          |
| `SPRINT1_STAGING_DRY_RUN_2026-04-25.md`  | April 25 sprint-1 staging dry run — historical evidence.                                                                                                               |
| `PRODUCTION_READINESS_AUDIT.md`          | Superseded by `docs/PRODUCTION_READINESS_AUDIT_V2.md`.                                                                                                                 |
| `PRODUCTION-READINESS-AUDIT.md`          | Earlier production-readiness snapshot; superseded by V2.                                                                                                               |
| `PRODUCTION-READINESS-CODE-REVIEW.md`    | Source of the tech-debt log items (T1–T22); the log itself is current.                                                                                                 |
| `CRITICAL_REVIEW_LAUNCH_READINESS.md`    | Historical critical review; findings absorbed into the current launch checklist.                                                                                       |

## When to dig in here

- **Postmortem** — looking for "what did we know about X before incident Y?"
- **Onboarding a new engineer** — explaining why a current pattern exists ("this used to be in the punch list, that's why").
- **Audit / compliance review** — providing time-stamped evidence of pre-launch verification.

For anything else, **start from `docs/README.md`** — that's the live index.

## Archival policy

- Move docs here when (a) the timeline they reference has passed _and_ (b) their actionable contents are reflected in a current doc or in code.
- Update `docs/README.md`'s "Recently archived" section when moving things, so a reader following an old link knows where to find the file.
- Don't archive a doc just because it's old — only if its actionable claims are stale.
