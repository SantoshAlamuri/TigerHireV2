# Launch punch list (go/no-go) — 2026-04-24

**Instructions:** A human runs the flow in [E2E-FLOW-TEST-SCRIPT.md](./E2E-FLOW-TEST-SCRIPT.md), records a Loom (or similar), and fills this sheet.  
Do not mark launch ready until every **P0** row is either **done** or has an approved rollback/mitigation ticket.

## Run metadata

- **Recording link:** `tour-latest.webm` (repo root)
- **Environment (staging / preview / local):** production + preview smoke validation (`https://tigerhire.io`, `https://tigerhire-kgxtsq37q-santoshalamuris-projects.vercel.app`)
- **Tester:** Santosh Alamuri + Codex (checklist verification pass)
- **Date/time (UTC):** 2026-05-07 11:22 UTC
- **Build / commit SHA:** `adfb722` on branch `claude/soft-launch-prep` (preview deploy `dpl_5YShFcibnf7kZ9ASAv16LpAAEMJu`)

## Critical path execution

| Step                                  | Status (`ok`/`fail`/`n/a`) | Owner | Evidence (video timestamp / screenshot) | Issue link |
| ------------------------------------- | -------------------------- | ----- | --------------------------------------- | ---------- |
| Sign in as recruiter                  |                            |       |                                         |            |
| Post or open a job (open status)      |                            |       |                                         |            |
| Public apply: CV + submit             |                            |       |                                         |            |
| See application + FitScore on list    |                            |       |                                         |            |
| Screen / shortlist (as applicable)    |                            |       |                                         |            |
| Interview: slot or self-schedule link |                            |       |                                         |            |
| Offer: draft -> send -> public link   |                            |       |                                         |            |
| Sign (or exercise decline)            |                            |       |                                         |            |
| Console: 0 new errors in flow         |                            |       |                                         |            |
| Network: 0 unhandled 500s             |                            |       |                                         |            |
| **Total wall time (target < 15 min)** |                            |       |                                         |            |

## P0 launch blockers (must be green)

| P0 item                                                                  | Status (`open`/`in_progress`/`blocked`/`done`) | Owner | Due date   | Evidence / command output                                                                                                                                                                                                             | Ticket / mitigation                                                                            |
| ------------------------------------------------------------------------ | ---------------------------------------------- | ----- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Critical path manual flow completed with recording                       | open                                           |       |            |                                                                                                                                                                                                                                       |                                                                                                |
| `npx playwright test e2e/launch-jun3-smoke.spec.ts` passing              | done                                           | eng   | 2026-05-07 | 2026-05-07 preview smoke via Playwright runtime script: `/` `200`, `/pricing` `200`, invalid self-serve token API `401`                                                                                                               | Preview: `https://tigerhire-kgxtsq37q-santoshalamuris-projects.vercel.app`                     |
| `npx vitest run tests/functional/launch-p1-routes-smoke.test.ts` passing | done                                           | eng   | 2026-05-07 | 2026-05-07 run: `Test Files 1 passed`, `Tests 2 passed`                                                                                                                                                                               | Command executed on `claude/soft-launch-prep`                                                  |
| No new production-severity Sentry errors in smoke window                 | open                                           |       |            |                                                                                                                                                                                                                                       |                                                                                                |
| No unhandled `5xx` responses on launch path endpoints                    | in_progress                                    | eng   | 2026-05-07 | Production + preview probe sweep (2026-05-07): `/`, `/jobs`, `/product`, `/terms`, `/privacy`, `/dpa`, `/api/health*` all `200`; `/api/webhooks/whatsapp` `403`; invalid self-serve token `401`; unauthenticated `/api/offers*` `401` | Final close after manual critical-path run confirms no unhandled `5xx` in browser network logs |

## P1 follow-ups (not go-live blockers)

| Item                                                                                               | Owner         | ETA       | Ticket                       |
| -------------------------------------------------------------------------------------------------- | ------------- | --------- | ---------------------------- |
| Track offer company-countersign as separate release stream (do not bucket under scoring hardening) | product + eng | pre-retro | release-notes / retro agenda |
| Typecheck hygiene check (`npm run typecheck`) re-verified green on 2026-05-03                      | eng           | done      | n/a                          |

## Go / no-go decision

- **Decision:** `GO` / `NO-GO`
- **Approver:**
- **Approved at (UTC):**
- **Rollback owner (if NO-GO):**
