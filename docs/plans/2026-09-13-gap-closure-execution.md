# Current gap-closure execution

User correction: referral work is excluded. This execution plan supersedes the referral and marketplace workstreams in the earlier full-chat roadmap. No new account onboarding, payout features, light theme, or platform-admin job posting.

Coordinator owns integration, scope, file ownership, regression evidence and release decisions. Agents work in isolated branches; a completed coding task is not a completed release.

| Workstream                                                 | Owner                              | Status / completion evidence required                                                                                                                                             |
| ---------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup, dependency safety and CI                          | release_stability                  | PR #387 CI green after preview migration. Same existing `candidate_career_profiles` migration now on production. Domain still on rollback. Inngest preview signature still fails. |
| Job-scoped upload, candidate filtering/counts and evidence | candidate_gaps                     | Integrated job-scoped uploader, server filters, evidence cleanup and exact totals; retry identity and stale-response regressions verified                                         |
| Short setup, truthful status and approval feedback         | hiring_setup                       | Integrated compact role request, truthful status and background approval feedback; explicit publication preview and confirmation integrated                                       |
| Public role availability / lifecycle parity                | release_stability                  | Verify publication APIs and public listing use existing policy consistently                                                                                                       |
| Admin layout, deferred reports, readable labels            | coordinator                        | Existing operations grouped by task; report requests deferred; errors cannot look like zero                                                                                       |
| Persistent candidate actions and context                   | candidate_gaps                     | Persisted decisions + 14 Sep score-ranked review batches and list/review session restore on this branch (`f6afa08d`). Safe server undo and authenticated walkthroughs remain open |
| Duplicate routes                                           | release_stability                  | Equivalent aliases consolidated; distinct capability routes retained in disposition ledger                                                                                        |
| Shared readability and install interruptions               | coordinator + page owners          | Existing dark theme; semantic text/focus; no promotional overlay during hiring tasks                                                                                              |
| Performance                                                | each owner, coordinator integrates | Record request/data reductions separately from measured latency; no unmeasured speed claims                                                                                       |
| Integrated verification                                    | coordinator                        | Typecheck/lint, focused and live tests, role-specific UI walkthroughs, final build/boot and runtime review                                                                        |

## Known external blockers

- `candidate_career_profiles` applied from the existing migration to preview `htdyomyhkvhcwoeodwas` and production `qzhhhsvtyqyixpcdfhng`. Empty table, RLS on, owner policy. No candidate documents written.
- Inngest preview sync signature failure requires owning account verification; authentication must not be disabled.
- Production stays on the rollback build until a production-configured release passes its gates.

## Completion rule

Map each audited finding and route to verified fix, verified already-correct behavior, or an explicit remaining blocker. Track actual-role visual checks and realistic dataset timings separately; neither is implied by unit-test success. Do not mark the entire plan done while any required gate or finding remains unresolved.

## Audit closure matrix

Code completion is separate from an authenticated walkthrough and release. The original audit documents are preserved as historical evidence; their proposed designs are not claims about delivered behavior.

| Finding                   | Current result                                                                                             | Remaining work                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| F01 Upload dead end       | Existing job-scoped uploader mounted at intake and list                                                    | Authenticated receipt walkthrough                                        |
| F02 Conflicting lifecycle | Explicit publication predicate, corrected setup labels, public endpoint eligibility                        | Reconcile every lifecycle surface and approval invalidation              |
| F03 Hidden publication    | Explicit preview and confirm action using existing PATCH; failure retains inputs                           | Authenticated publication walkthrough and approval invalidation contract |
| F04 Fragmented setup      | Completed setup and approved evaluation collapsed                                                          | Single five-step workspace is still outstanding                          |
| F05 Long request form     | Two stages, visible essentials, persistent actions, focus/error handling                                   | Reload/back recovery and authenticated viewport walkthrough              |
| F06 Approval waits        | Approval no longer waits for generation on four surfaces                                                   | Durable generation failure/retry and named ownership                     |
| F07 Buried daily work     | Confirmed-action rows, compact activity links, no zero-task banner                                         | Default routing and consolidated daily-work shell                        |
| F08 Review context        | Sticky persisted decisions, URL/session restore of filters, expanded jobs, scroll and selected application | Authenticated walkthrough; safe server-supported undo remains open       |
| F09 Evidence/copy         | Missing-evidence sentinels hidden; internal automation instructions removed                                | Full criterion/copy audit                                                |
| F10 Counts/data           | Exact authorized summary counts; review batches ranked by stored score before the limit                    | Realistic dataset checks; organisation-wide filter facets                |
| F11 Admin overload        | Task sections, deferred reports, name lookup, clear count scope                                            | Unified company exception queue and organisation workspace               |
| F12 Density/overlays      | Persistent actions, collapsed completed work, hiring/admin install prompt suppression                      | Broader responsive, zoom and readability checks                          |
| V01 Contrast              | Existing semantic text tokens adopted in changed admin areas                                               | Full rendered contrast audit                                             |
| V02 Amber semantics       | Existing theme retained                                                                                    | Shared semantic palette treatment                                        |
| V03 Score meaning         | Neutral list score; zero and missing kept distinct                                                         | Stored-band consistency across all score surfaces                        |
| V04 Framing               | Admin sections and completed setup reduced                                                                 | Jobs summary framing                                                     |
| V05 Typography            | Admin 10–11px labels increased                                                                             | Shared type scale elsewhere                                              |
| V06 Controls              | Changed controls use existing tokens                                                                       | Broader shared-control adoption                                          |
| V07 Focus                 | Request step/error focus and admin focus indicators                                                        | Full keyboard and focus contrast audit                                   |
| V08 Theme                 | New light theme excluded                                                                                   | No new theme in this scope                                               |
| V09 Glow                  | No global change                                                                                           | Work-surface/glow cleanup                                                |
| V10 Interruptions/state   | Install overlays suppressed; evidence/status/task errors clarified                                         | All-role state and ownership walkthrough                                 |

## Verification recorded so far

- Integration at e3236962: 108 focused tests across 16 changed test files passed; changed-file ESLint and TypeScript passed. Later changes require final rerun.
- Actual admin component rendered with fixture data at 1366×768 and 390×844: no browser exceptions and no mobile horizontal overflow. This is not authenticated end-to-end evidence.
- Admin initial endpoint requests reduced from eight to four; report/health queries deferred until their section. This is a structural request reduction, not a measured latency claim.
- Candidate list filters and pagination run server-side; dashboard counts no longer download application payloads. Overall slowness is not yet proven resolved.
- Release PR #387 remains open. CI unit/integration, typecheck, lint and security passed; Behavior RLS failed on the missing preview table, and dependent Build/E2E were skipped.
- No production promotion, candidate notification, outbound call or referral work performed in this gap-closure branch.

## Final integration review corrections

- Stale requests cannot overwrite newer state, cache, or in-flight ownership; silent refresh completion clears a pending spinner.
- Upload retries retain successful receipts and use a distinct email for each failed singleton file; regressions cover failures in separate batches.
- Canonical offer routes preserve existing super-admin access without widening the company route family.
- Reports chart sizing starts when the deferred chart mounts. Billing/support/system-health counts show unavailable rather than false zero on loading/error.
- Fixture-based mobile Reports verification rendered the actual chart with no horizontal overflow or browser exceptions.

## Final local verification

Code at 3ddc8fbe plus admin chart/count correction 1af8eb3a (included in its history): 143 changed-file tests across 21 files and 19 additional navigation/readiness tests passed. Changed-file ESLint, standalone TypeScript and diff checks passed.

A fresh standard `npm run build` passed using local dependencies, followed by `npm run verify:boot`: server started in 2.0 seconds and `/api/health` returned HTTP 200 with `{"ok":true}`. This used the existing preview environment locally; it is not production or authenticated journey verification. An initial alternative Webpack build failed on the unchanged `node:async_hooks` logging import path; the standard Turbopack build is the verified build mode.

Release remains blocked as above. The full audit is not closed: use the matrix and route ledger for the next existing-gap batch. Do not treat this build or a draft PR as evidence of production deployment or overall latency resolution.

## 14 September follow-up (interrupted batches)

See [2026-09-14-finish-interrupted-batches.md](./2026-09-14-finish-interrupted-batches.md).

- Jobs lists unified; leadership Home leads to `/company` (Overview). Local commits `83aa948f` and `c7b6225b`.
- Review queues rank remaining `applied` rows by stored FitScore before the batch limit; list/profile/review restore filters, selection and scroll. Cherry-pick `f6afa08d`. Focused tests: 30 passed across four files before that commit.
- Authenticated role walkthroughs, F04 five-step setup, Inngest preview signatures, and production promotion remain open. Career-profile table exists on preview and production.
