# Remaining work — 14 September 2026

Status: **in progress.** Referral, light theme, and platform-admin job posting stay excluded.

This plan finishes what the interrupted-batch plan left open. Update the status column after each wave. Do not mark a wave done without the evidence named in the wave.

| Wave | Work                                                                                                                                                                                                                                                            | Status                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| A    | Merge [PR #387](https://github.com/SantoshAlamuri/TigerHireV1/pull/387) to `main` (startup fix, CI clean). Retarget [PR #388](https://github.com/SantoshAlamuri/TigerHireV1/pull/388) to `main` so full CI runs.                                                | **done** — #387 merged 2026-09-13; #388 retargeted to `main`           |
| B    | F04: five-step role workspace (Request → Job description → Hiring requirements → Candidate evaluation → Preview and publish). Existing editors stay; checklist language and progress match those five steps. Screening/interview become optional after publish. | **done**                                                               |
| C    | Durable undo for **hold only** (`viewed` → `applied`). Shortlist/reject stay irreversible until notification-safe undo exists.                                                                                                                                  | **done**                                                               |
| D    | Authenticated recruiter/leadership walkthrough of jobs landing, upload, setup, review.                                                                                                                                                                          | **blocked** — login required; no recruiter credentials in this session |
| E    | Safe route aliases that already have parity (job setup canonical URL). Remaining merge-required rows stay listed, not blindly redirected.                                                                                                                       | **done**                                                               |

## Will not claim done in this plan

- **Inngest preview signatures** — needs the Inngest account. Do not disable validation.
- **Vercel production domain move** — merging #387 to `main` is the git release; assigning tigerhire.io is a separate Vercel action after the new production deployment is healthy.
- **Full route-ledger merges** (job editors, hiring-request lists, candidate profiles, analytics, admin directories) — each needs capability parity first.
- **Reject/shortlist undo** — would notify candidates or reverse payouts.

## Wave A evidence

- #387 merged to `main` as `7ab236d8`.
- #388 base is `main`.

## Wave B evidence

- `buildSetupSequence` returns the five user-language steps as required, plus optional operational steps.
- Setup page shows one next action, completed steps collapsed, publish as the last required step.
- Existing setup-sequence tests updated; new tests for the five-step order.

## Wave C evidence

- PATCH allows `applied` only when current status is `viewed`.
- Review queue can undo a hold after a successful restore.
- Tests cover allowed hold restore and denied reject/shortlist restore.

## Wave D evidence

- **Blocked.** https://tigerhire.io/login loads the Company/Vendor sign-in form. This session has no recruiter credentials, so jobs landing, upload, setup, and review were not walked while signed in.

## Wave E evidence

- `/recruit/jobs/[id]/setup` serves the setup workspace.
- `/recruit/v2/jobs/[id]/setup` redirects to the canonical URL.
