# Jobs and leadership navigation delivery

Scope: existing recruiter/leadership jobs lists and navigation. No referral, production, account or schema changes.

## Delivered

- Company and recruiter jobs share one compact list, with All/Open/Drafts/Closed, submitted search, twenty-row pagination, lifecycle labels, exact application counts, retry and empty states. Company links retain company detail context. Hiring-manager and agency recruiter entry screens remain role-specific.
- Summary API preserves existing organisation and hiring-manager scopes, explicitly limits supported roles, selects only list fields and application relation counts, and avoids the fit-score scan. The screen no longer downloads a capped 200-application sample or a separate requisition list to guess counts/blockers.
- Leadership login and primary Home navigation lead to `/company` (Overview). Portfolio remains a distinct report, accessible through the recruiter list switch. The coordinator owns the dashboard/report contents.
- Company approvals retains its dedicated source filters and rejection-undo workflow in both plan modes. Tasks remains a separate consolidated task surface; it no longer silently replaces this inbox.
- Super-admin job navigation uses the accessible recruiter context, without a create-job action.

## Evidence and limits

131 focused tests pass across eleven files, covering query context, pagination, lifecycle honesty, role-specific fetch behavior, summary API denial/scoping, exact relation counts, navigation, approvals retention and existing route behavior. TypeScript and changed-file ESLint pass. Integrated browser/visual checks remain coordinator work.

A read-only preview query confirmed the summary projection returns valid relation counts for twenty jobs. Local serialization comparison of the same twenty rows measured 328,917 bytes for full rows versus 4,847 bytes for projected list rows (about 98.5% smaller). Median serialization cost was 0.579 ms versus 0.0114 ms over seven batches of 1,000 iterations following fifty warmups. The benchmark projection used zero count placeholders; a separate real relation-count query also produced 4,847 bytes. These are payload/local CPU measurements, not a claim about end-to-end page latency. Existing application job-id indexes support the relation lookup; no database plan was measured.

Other route-ledger capability merges remain explicitly open. This batch does not remove unique editors, candidate profiles, analytics or job workspaces.
