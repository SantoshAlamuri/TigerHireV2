# Recruiter journey closure — create job → approve JD Base → candidate scored

**Date:** 2026-08-15
**Branch:** `claude/promotion-gate-fixes` (targets `dev`)
**Trigger:** first-time-recruiter UI audit after the v1/v2 refactor

## What the audit found

Walked as Recruiter (`rajiv.menon@finstack.in`) and Company Admin (`nidhi.gupta@finstack.in`)
in a real browser. The journey was **hard-blocked**: no candidate could be scored, and the
first screen after login already failed.

Four defects, three of which shared one root cause.

### 1. Ambiguous PostgREST embed blanked most read paths (P0)

`jobs` gained a second foreign key to `organisations` (`client_organisation_id`), which made
every unqualified `organisations(name)` embed **through jobs** ambiguous. PostgREST answered
`PGRST201` instead of rows, so the API returned 500.

Verified against the preview database. Blast radius at the time of the audit:

| Hidden by the bug             | Rows |
| ----------------------------- | ---- |
| Jobs (recruiter saw "0 open") | 27   |
| Applications                  | 111  |
| Candidates                    | 238  |
| Fit scores                    | 432  |

Surfaces affected: jobs list, job hub, stage counts, candidates list, candidate detail,
score reasoning, public job board, `feed.xml`, job alerts, distribution engine, WhatsApp flows.

**Fix:** pin every jobs-context embed to `organisations!jobs_organisation_id_fkey`. Response
keys are unchanged, so no consumer needed updating. 17 call sites across 15 files.

### 2. The scoring gate existed nowhere it was linked (P0)

`JdBaseSetupStep` — the JD-Base / Ideal-Profile approval, i.e. **the** gate that decides
whether candidates score against a real rubric or the generic bar — rendered only inside
`RecruitmentPlanDocument`, which after the refactor was reachable only from the orphaned
`/recruit/jobs/[id]/legacy` page.

Six live surfaces linked to `/recruit/jobs/[id]#ideal-profile-setup`, an anchor that did not
exist on that page: the job-hub header button, the ACTION REQUIRED "the gate" card, v2 setup
step 2, the Job Setup sidebar, the requisition's "Open ICP & scoring setup" CTA, and the
matches page. Every path was circular.

**Fix:** render `JdBaseSetupStep` on the live job page behind the existing `editJobSetup`
capability, with the anchor id the links already point to.

### 3. Failures presented as empty states (P0)

The candidates list said _"No candidates in process yet."_ and candidate detail said
_"No scores have been computed for this candidate yet."_ — both over a 500. A recruiter reads
these as facts and stops looking. Pipeline showed 21 candidates at the same moment, and a
candidate carrying `S:93` on Pipeline read as unscored one click away.

**Fix:** both surfaces now distinguish a failed load from genuine emptiness and offer a retry.
This restores the repo convention that degraded paths get a recruiter-visible indicator.

### 4. `[object Object]` in API error detail (P1)

`handleApiError` stringified Supabase/PostgREST error objects with `String(err)`, so the dev
detail read `"detail": "[object Object]"` — which is what made the root cause above take
longer to find than it should have.

**Fix:** JSON-stringify non-Error objects.

### Not a defect: the "Approve does nothing" symptom

The Approve button in the Tasks drawer appeared to hang with no feedback and left the
requisition `under_review`. Root-caused to the **two-stage approval workflow**
(`leadership` → `finance`): the first approval legitimately advances one stage without
flipping the requisition, and the tasks page's own `/api/jobs` 500 was breaking the drawer's
refresh so nothing visibly changed.

Re-tested through the real UI after the API fix: **both stages approve cleanly**, the drawer
closes, the pending task correctly re-appears for the `finance` stage, and the requisition
reaches `approved` → `converted`. No code change was needed. Left as an open UX item below.

## Verification

Local gate, since GitHub Actions has been intermittent (see
`project_github_actions_billing_outage`):

| Gate                          | Result                           |
| ----------------------------- | -------------------------------- |
| `npm run typecheck`           | clean                            |
| `npx vitest run` (full)       | 4470 passed, 0 failed, 623 files |
| `npm run lint`                | clean                            |
| `node scripts/size-check.mjs` | clean                            |
| `npx prettier --check`        | clean                            |

End-to-end journey re-walked in a real browser on a **new** requisition:

1. Recruiter creates requisition → `REQ-ENGINEER-2026-015`
2. Admin approves stage 1 (leadership) via the Tasks drawer → dialog closes, finance task appears
3. Admin approves stage 2 (finance) → requisition `approved`
4. Background Inngest job drafts the JD → status `converted`, job created
5. Recruiter opens the job → **H1 shows the real title, "Scoring setup" renders, preset
   confirmation and approval wizard present**
6. Console and network on the final screen: **zero 5xx, zero page errors**

The journey now completes to the gate. Scoring itself still requires a human to approve the
rubric — by design.

## Regression guard

`tests/unit/postgrest-embed-ambiguity.test.ts` fails the build if any file that queries `jobs`
embeds `organisations(` without naming the FK. The guard was verified in both directions: it
passes clean, and it fails with the exact file:line when the bug is reintroduced.

## Known gaps — not release blockers, worth scheduling

1. **`npm run test:unit` is a silent no-op.** `vitest run --dir tests/unit` reports
   "No test files found" and **exits 0** under vitest 4, so the script passes without running
   anything. `npx vitest run` works. Any gate relying on `test:unit` is not testing.
2. **Multi-stage approval is invisible to the approver.** Approving stage 1 gives no
   "recorded — now waiting on Finance" confirmation. Correct behaviour, no feedback.
3. **Duplicate route families.** `/recruit/hiring-requests` silently rewrites to
   `/company/hiring-requests`; `/recruit/jobs/new` is a page that only says "disabled, go
   elsewhere"; `/recruit/candidates` duplicates Pipeline and disagreed with it. Orphans with
   zero inbound links: `/recruit/jobs/[id]/legacy`, `/recruit/jobs/legacy`,
   `/recruit/candidates/legacy`, `/recruit/verify`. Safe to delete now that the gate has moved
   off the legacy page.
4. **`/recruit/v2/setup` shows false ✓s** — claimed "Screening questions — 5 asked on WhatsApp"
   for a job with nothing configured.
5. **Console noise on every page** — CSP block for `va.vercel-scripts.com`, aborted Sentry
   `/monitoring` POSTs.
6. **Audit log on the requisition takes ~8s** behind a bare "Loading audit log…".

## Release recommendation

Ship to `dev` and soak on the preview deploy. The three P0s are fixed and verified in a
browser, the full suite is green, and the ambiguous-embed class is now guarded. Promote
`dev` → `main` only on explicit operator go-ahead, per `CLAUDE.md`.
