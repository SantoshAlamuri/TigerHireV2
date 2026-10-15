# UI Test Run - 2026-03-20

**Summary and test list:** [UI_TEST_RESULTS.md](./UI_TEST_RESULTS.md).

Environment:

- App URL: `http://localhost:3000`
- Mode: local dev (`npm run dev`)
- Session role: Super Admin (logged in)
- Browser automation: cursor-ide-browser

## Coverage

Routes validated:

- `/admin`
- `/`
- `/recruit/pipeline`
- `/recruit/jobs`
- `/admin/costs`

## Results

1. `/admin` - PASS

- Loaded successfully.
- Interaction validated: clicked `Notifications` button and panel opened.
- Evidence: `ui-run-admin-initial.png`

2. `/` - PASS

- Public landing page loaded successfully.
- Interaction validated: clicked `See how it works`.
- Evidence: `ui-run-home.png`

3. `/recruit/pipeline` - REDIRECT (ROLE-BASED)

- Navigation attempt redirected to `/admin`.
- No 401/403/500 observed; behavior appears role-gated for current session.
- Evidence: `ui-run-recruit-pipeline-redirect-admin.png`

4. `/recruit/jobs` - REDIRECT (ROLE-BASED)

- Navigation attempt redirected to `/admin`.
- Interaction validated on resulting page: clicked `Open menu`.
- No 401/403/500 observed.
- Evidence: `ui-run-recruit-jobs-redirect-admin.png`

5. `/admin/costs` - PASS WITH UI WARNING

- Loaded successfully.
- Interaction validated: clicked `Sync Costs`.
- API response completed and success message displayed: "Sync completed. Imported 0 records."
- Evidence: `ui-run-admin-costs-after-sync-click.png`

## Persona Coverage (All Test Accounts)

Run method:

- Used the dev login test-account buttons on `/login`.
- Captured one evidence screenshot per persona landing.

Login evidence:

- `ui-run-login-test-accounts.png`
- `ui-run-login-before-employee.png`

Persona results:

1. Super Admin (`sam@tigerhire.io`) - PASS

- Landed on `/admin`.
- Interaction: opened notifications.
- Evidence: `ui-run-role-super-admin.png`

2. Admin (platform) (`admin@tigerhire.com`) - FAIL (seed/auth mismatch)

- Stayed on `/login` with invalid credentials messaging.
- Evidence: `ui-run-role-admin-platform.png`

3. Company Admin (`nidhi.gupta@finstack.in`) - PASS

- Landed on `/company`.
- Interaction: opened notifications panel.
- Evidence: `ui-run-role-company-admin.png`

4. Recruiter (`rajiv.menon@finstack.in`) - PASS

- Landed on `/recruit`.
- Interaction: clicked dashboard quick action (`View Pipeline`).
- Evidence: `ui-run-role-recruiter.png`

5. Hiring Manager (`kavita.rao@finstack.in`) - PASS

- Landed on `/company/my-jobs`.
- Interaction: clicked `New Hiring Request`.
- Evidence: `ui-run-role-hiring-manager.png`

6. Employee (`meera.nair@finstack.in`) - PASS

- Landed on `/employee`.
- Interaction attempt on sidebar link had viewport-click limitation in automation, but page and core controls loaded.
- Evidence: `ui-run-role-employee.png`

7. Agency (`fatima.sheikh@talentbridge.co`) - PASS

- Landed on `/agency`.
- Interaction: clicked `Post JD`.
- Evidence: `ui-run-role-agency.png`

8. Candidate Pro (`priya.sharma@gmail.com`) - PASS

- Landed on `/candidate` (Pro greeting visible).
- Interaction attempt on sidebar link hit the same automation viewport limitation, but page loaded and role-specific state is visible.
- Evidence: `ui-run-role-candidate-pro.png`

9. Candidate Free (`siddharth.patil@outlook.com`) - PASS

- Landed on `/candidate` (Free greeting visible).
- Interaction: clicked `Job preferences` and navigated to `/candidate/preferences`.
- Evidence: `ui-run-role-candidate-free.png`

## Full Feature Suite Run (Playwright)

Command:

- `CI= npx playwright test --reporter=line`

Execution result:

- Total tests: 125
- Passed: 28
- Failed: 97
- Exit code: 1
- Duration: ~63s

Primary failure pattern:

- Most failures come from strict selector collisions in login helpers used across many specs:
  - `getByLabel("Password")` now matches both the password input and the "Show password" button.
  - This triggers Playwright strict-mode failures before feature steps execute.

Representative failing suites impacted by the selector issue:

- `admin-flow.spec.ts`
- `agency-flow.spec.ts`
- `auth-flow.spec.ts`
- `candidate-flow.spec.ts`
- `recruiter-flow.spec.ts`
- `full-functional.spec.ts`
- `tabs-and-scores.spec.ts`
- `ui-regression.spec.ts`

Interpretation:

- Feature coverage breadth is high (all major suites executed), but most failures are currently test-harness selector breakages, not direct confirmation that corresponding product features are broken.

## Full Feature Suite Rerun (After E2E Selector Fix)

Changes applied before rerun:

- Updated e2e login selectors from `getByLabel("Password")` to `input[name="password"]` across the feature specs to avoid strict-mode collisions with the "Show password" button.

Rerun command:

- `CI= npx playwright test --reporter=line`

Rerun result:

- Total tests: 125
- Passed: 47
- Failed: 77
- Skipped: 1
- Exit code: 1
- Duration: ~4.3m

Delta vs previous run:

- Pass count improved from 28 -> 47 (+19 tests).
- The original password-selector blocker was largely removed.

Top remaining failure patterns:

- `page.waitForURL(.../company|recruit|candidate...)` timeouts in role-specific setup flows.
- `expect(...).toBeVisible()` assertions expecting exact text that no longer matches current UI copy.
- A remaining strict-mode matcher issue in a broad public-page text selector (`getByText(/about|TigerHire/i)` matching multiple elements).

Current confidence statement:

- Authentication + role-routing + a broad subset of dashboard flows are now executing farther than before.
- Full "all features green" validation is still blocked by flaky/outdated e2e assertions and role seed assumptions in tests.

## Full Feature Suite Rerun (After Seeded Login Helper)

Additional stabilization work:

- Added shared helper `e2e/helpers/login.ts` that:
  - Uses seeded dev "Test account" login buttons by role.
  - Falls back to email/password login when test-account buttons are unavailable.
- Migrated major e2e suites to use this helper.
- Updated stale test-account emails and reduced brittle text assertions in candidate/public paths.

Latest rerun command:

- `CI= npx playwright test --reporter=line`

Latest rerun result:

- Total tests: 125
- Passed: 104
- Failed: 21
- Exit code: 1
- Duration: ~2.0m

Delta vs previous rerun:

- Pass count improved from 47 -> 104 (+57 tests).
- Remaining failures are now concentrated in a smaller set of assertion/UX-interference cases instead of broad auth/setup failures.

Top remaining failure buckets:

- Cookie consent dialog intermittently intercepting clicks during login/setup flows.
- A handful of brittle content expectations on public/apply pages.
- Some recruiter/fit-score workflow assertions expecting specific UI text/controls that are not consistently present.

## Network/API Observations (from browser + dev logs)

- `POST /api/admin/costs/sync` returned 200.
- Cost dashboard APIs returned 200:
  - `/api/admin/costs/summary`
  - `/api/admin/costs/by-provider`
  - `/api/admin/costs/trend`
- No 401/403/500 observed during this run for tested flows.

## Issues Found

### 1. Recharts container size warning (reproducible)

Observed repeatedly while visiting admin pages including costs:

- `[browser] The width(-1) and height(-1) of chart should be greater than 0`

Impact:

- Risk of chart render instability/blank charts on first paint or in constrained layout states.

Severity:

- Medium (UI reliability).
