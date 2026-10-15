# Finish interrupted 13 Sep gap-closure batches

Date: 14 September 2026  
Status: **interrupted slice closed.** Remaining product and release work is listed at the bottom, not implied done.

| Step | Work                                                                                                  | Status                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Finish the uncommitted candidate-ux batch                                                             | **done** — `c671893c` / cherry-picked as `f6afa08d`                                                                                              |
| 2    | Land jobs-nav and candidate-ux onto [PR #388](https://github.com/SantoshAlamuri/TigerHireV1/pull/388) | **done**                                                                                                                                         |
| 3    | Unblock [PR #387](https://github.com/SantoshAlamuri/TigerHireV1/pull/387) preview schema drift        | **done** — existing migration on preview `htdyomyhkvhcwoeodwas`                                                                                  |
| 4    | Record evidence in the execution plan                                                                 | **done**                                                                                                                                         |
| 5    | Production schema must match the migration already in git                                             | **done** — same existing migration applied to production `qzhhhsvtyqyixpcdfhng` (empty table, RLS + owner policy). Domain still on the rollback. |
| 6    | Restack #388 onto latest #387 so it is mergeable                                                      | **done** in this merge                                                                                                                           |

## What landed

- Review queue ranks remaining `applied` rows by stored FitScore before the batch limit. Next batch is page 1 of whatever is still applied.
- Recruiter list/profile/review restore filters, expanded jobs, scroll and selected application.
- Jobs lists share one implementation; leadership Home leads to `/company` Overview.
- `candidate_career_profiles` exists on preview and production. No candidate documents were written.

## Still unfinished (do not treat as done)

These were never part of a completed release:

1. **Promote a reviewed #387 build** — tigerhire.io remains the rollback. Inngest preview signatures still fail; do not disable validation.
2. **Review and merge #388** after CI on the restacked branch. It is product code, not a release by itself.
3. **F04** — one five-step setup workspace (request → JD → requirements → evaluation → publish). Current setup is collapsed completed work, not that workspace.
4. **Authenticated recruiter and leadership walkthroughs** of upload, publish, review and jobs landing.
5. **Durable server undo** for review decisions. The PATCH schema cannot restore `applied`; local Undo was removed on purpose.
6. **Route ledger “merge required” rows** — job detail/editors, hiring-request lists, candidate profiles, analytics, admin directories.
7. **Excluded by user** — referrals/marketplace, light theme, platform-admin job posting.

F08 filter/scroll restore and F10 score-ranked review batches are closed in code; they still need a live recruiter walkthrough.
