# Candidate intake and review gap closure

## Delivered

- Job intake mounts the existing uploader directly and preselects the current role; existing open-role and upload APIs remain responsible for authorization and eligibility.
- Candidate lists send `jobId` to the authorized applications API, paginate with exact totals, expand the selected job, and use compact responsive rows. Name, exact role/location and high-intent filters now run on the server before pagination; suggestions remain optional so users can type values absent from the current page. Rejected applications remain visible rather than disappearing into an implicit pool.
- Review excludes missing-evidence sentinels from columns, summaries, comparison text and queue counts; no scoring values or decisions are changed by this display filtering.
- Comparison is optional. Decision controls precede evidence and remain sticky. Profile links carry application, job and review return context; candidate selection is navigable from the queue.
- Decisions await successful API persistence before advancing. Failed bulk entries retain selection; successful retries clear errors. Network writes no longer run inside React state updaters. Decision saves invalidate application/summary caches. Keyboard shortcuts ignore text entry.
- `/api/jobs/[id]/application-summary` checks hiring role and job access, then uses session RLS and exact head counts. It returns total/applied/shortlisted/rejected/hired/screened without application payloads. Screened preserves the existing meaning: at least one screening-answer row, not completed screening.

- Integration QA fixes preserve linked application selection during loading, prevent older searches from overwriting the active result, retain successful uploads across later batch failures, and retry only pending files with stable request keys. Singleton retry requests require the existing mandatory email; chunking avoids singleton tails. Zero scores remain distinct from missing scores and group score text is neutral.

## Explicit remaining work

- Durable undo is unavailable: the existing PATCH schema cannot restore `applied`, and decision changes may notify candidates. The misleading local-only Undo button/shortcut was removed. A safe server-supported undo requires its own transition and notification design; permissions were not expanded.
- Filter suggestions currently come from visible results; full organization-wide facet suggestions are a future usability refinement.
- Review loads batches of up to 100 by stored FitScore (then unscored by created_at). Next batch reloads page 1 of remaining `applied` rows after decisions leave the queue.
- List, profile and review restore filters, expanded jobs, selected application and dashboard scroll from the URL/session. Organisation-wide facet suggestions and durable server undo remain open.
- Authenticated recruiter/leadership browser walkthroughs at laptop/mobile sizes and production-like timing measurements have not been performed by this agent. F08/F10 are not fully closed.
- No referral, payout, new onboarding or production mutation work was included.

## Verification

14 September finish: focused tests for review-batch ranking/UUID exclusion, repository score routing, and workspace restore. TypeScript and targeted ESLint recorded with the commit. Authenticated recruiter/leadership walkthroughs still have not been performed. No candidate decisions, uploads, notifications or production database writes were performed during verification.
