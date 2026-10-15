# Release gap closure — September 2026

Scope: core hiring pilot reliability, based on `dev` commit `11e8c136` (including hiring UI PR #398). This is not production promotion or enterprise feature-completeness certification.

## Implemented

- Candidate erasure checks every affected database operation in the service, the primary profile redaction, and the request completion stamp. Failed cache/log deletion cannot be recorded as successful. Partial CV removal retains file references and leaves the request retryable. Already-removed files require confirmed absence before a retry can complete.
- A read-only preview schema inspection found that `cv_parsed_json` and `embedding` do not exist on `candidates`. The old profile update silently failed. The update now uses `cv_parsed_at` and `profile_embedding`, redacts both name fields and clears the profile URLs. A real preview fixture proved the update, audit record and repeated erasure work; that fixture was removed afterward.
- Phone-only erasure requests retain their resolved candidate ID before phone redaction, allowing the cron to retry. Failed completion stamps are no longer counted as processed.
- Supplemental backups paginate to an exact count, reject unstable/truncated responses, export nine critical tables, and separately download Storage objects with a path/size/SHA-256 manifest. Any table or Storage failure fails the run. The runbook now distinguishes supplemental exports from full database backups and separately restored object contents.
- Backups require dedicated project URL/ref/key variables. They cannot silently inherit the CI preview database. Those GitHub secret names were absent when inspected; provisioning remains open.
- High/critical dependency advisories block the CI Build job. Missing RLS credentials fail rather than produce a misleading green job.
- A mandatory production-mode browser gate authenticates through the real login flow, persists a draft and salary range, verifies the values after reload and denies candidate/anonymous access. Required tests cannot skip, retry into success or count expected failures as passes. The gate uses the exact allowlisted preview database, owned disposable fixtures and email/WhatsApp sandbox modes.
- The former “create job” smoke test is truthfully named as navigation to the role request form; failed recruiter login no longer skips that suite.
- The dev push workflow now runs the production build/boot and required browser gate. The static-only path explicitly says that release readiness was not verified.

## External configuration and observed runtime

- The live production deployment was mapped in Vercel to `3a7f0a035978beab7896f0e6e8b06c02f0c3f5ae`, deployment `dpl_DnHR46QroNFYktTz9dktBixefvvP`. This supersedes the September 13 rollback note.
- Inngest production has 29 registered functions; the inspected September 26 run list showed completed interview follow-up, WhatsApp reconciliation and deadline reminder runs. No production event was replayed or triggered.
- The Inngest `dev` app showed `account_mismatch` and registered `https://tigerhire.io/api/inngest` instead of its preview deployment. Vercel exposed an incorrect origin setting: `INNGEST_SERVE_ORIGIN=https://tigerhire.io` was applied to All Environments. Its scope was changed to Production only, preserving the production value. Vercel confirmed that a new deployment is required; verify sync after the next preview deploy.
- Both `dev` and `main` now require a pull request, an up-to-date branch and the `Release readiness` check; administrator enforcement is enabled and force pushes/deletion are disabled. The aggregate check runs even when its dependencies fail or skip and accepts only successful build and browser verification. Documentation-only PRs also report it. No peer approval count is imposed on the solo operator. Vercel Git deployments remain automatic; protected branch promotion is the release boundary.

## Verification

- Full local suite after the core changes: 660 files passed, 10 skipped; 4,753 tests passed, 46 skipped and one expected failure. Skipped database suites are not counted as live verification.
- Targeted failure-injection tests cover cache/log/redaction/audit failures, CV retry/absence, phone-only retry identity, backup pagination/failure/storage manifests, and strict browser-report enforcement.
- Explicitly opted-in real preview erasure test passed, including a second erasure attempt and cleanup of its synthetic candidate and audit records.
- Typecheck, strict lint, source-size check and production build passed during this batch. Production boot returned healthy in 1.6 seconds.
- Final production-mode browser run: all four desktop/mobile tests passed without retries or skips (38.7 seconds), proving persisted draft/salary, denied candidate/anonymous access and no horizontal page overflow at the tested widths.

## Still required for launch

1. Provision the dedicated backup secrets against the intended production source, verify the full managed database backup/PITR configuration, and perform an isolated database plus file restore drill. The supplemental export is not a transactional snapshot or an all-table backup.
2. Confirm the new preview deployment registers its own Inngest URL and syncs successfully. If key mapping remains wrong, repair the integration mapping without disabling signing or copying production secrets into preview.
3. Verify the reviewed head passes the enforced readiness check and soak on preview before operator-approved production promotion.
4. Complete the full publication → intake → parsing/scoring → shortlist → interview → offer journey on agreed fixtures. The new draft/authorization gate is a real, bounded test, not a claim of whole-lifecycle coverage.
5. Establish acceptable realistic-dataset latency and scoring-quality evidence, and complete broader keyboard/zoom/role coverage. Desktop/mobile draft checks do not prove every screen.
6. If paid self-service is in scope, validate the chosen payment provider. The previous live Stripe health result was false; that alone does not establish Razorpay failure.
7. Full HRIS employee/requisition sync and hire pushback remain enterprise feature work; the existing connector reports `pending_build`. They are not represented as finished by this pilot hardening batch.

The user was asked which release scope to target and to provision dedicated backup secrets without sharing them in chat. Work proceeded on the shared core pilot controls while those answers remained pending.
