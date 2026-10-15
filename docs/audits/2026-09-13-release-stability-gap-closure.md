# Release stability: first gap-closure batch

Branch: `codex/release-stability-gap-closure`, based on `053246f4`.

## Verified findings

- `tigerhire.io` returned HTTP 200 for `/`, `/login`, `/register` and `/api/health`. The HTML deployment marker remains `dpl_CPMVLTved8Y9vfCHzs5NEHme8Q5k`. Vercel Overview maps this to rollback commit `dfa7274b` and shows rollback/domain-assignment controls. No promotion was performed.
- The existing Vercel browser session is signed in as `santoshalamuri` and can read runtime logs. No Vercel connector tool is available in this Codex session; the Claude connector's authentication has not been changed.
- Runtime logs show instrumentation/environment-validation failures even for HTTP 200 responses on the live domain. Public route status alone is insufficient evidence of healthy startup.
- A detailed log for deployment `dpl_8n3EERQqXsmHSEXcGSPqMRW8sL6h` (`053246f4`), request `srl9c-1789315462437-53c1e0c4335a`, at 2026-09-13 16:04:22 UTC names `BOLNA_FROM_PHONE_NUMBER is required when Bolna voice screening is configured in production`. It also records an unhandled rejection and process exit status 128. This directly establishes the new deployment's startup configuration defect; the historical `b7d29d3b` deployment has not been independently isolated in this investigation.
- The user confirms no outbound Bolna number exists yet. Local configuration also lacks that value while the key and agent are configured. No credential values were printed or changed.
- Before this fix, neither the CI Build job nor the promotion Build step invoked `verify:boot`.
- Follow-up verification: main CI run `34766386012` explicitly reports `schema-drift-check: probing project htdyomyhkvhcwoeodwas`; its behavior tests execute assertions. Vercel's Production `NEXT_PUBLIC_SUPABASE_URL` is `https://qzhhhsvtyqyixpcdfhng.supabase.co`. CI therefore already targets preview; no secret rewrite is needed. Historical documents and the local `.env.preview` filename contain contradictory environment labels and must not be used as authoritative targets.
- Recent inspected CI run `34766775747` is the Dependabot PR #386 merge build, not proof of current main's CI outcome. It fails the test/coverage step and security audit; its Build job is skipped. A green Behavior RLS job alone is not proof that database tests ran, since the workflow supports a missing-secret skip path.

## Changes in this batch

1. Optional voice provisioning no longer makes the entire production app fail startup when the outbound number is absent. Startup emits a named `bolna_voice_unavailable` warning. Configured malformed numbers still fail validation. Core required variables and other validation remain enforced.
2. The existing outbound-call guard remains unchanged: production calls without a from-number fail before a request to Bolna. No number, caller identity or candidate call was fabricated.
3. The boot checker now requires a completed production build, invokes the installed Next CLI directly instead of an npx wrapper, bounds the HTTP/body wait, requires HTTP 200 with JSON `ok: true`, detects known instrumentation/validation failures in startup logs, and shuts down its server on success or failure. It does not prove the absence of errors arising after the observation window or replace deployment runtime-log review.
4. Regression tests cover absent/present/malformed voice number, required cron configuration, no outbound request without a number, and seven boot-check scenarios including HTTP 200 accompanied by startup errors and a stalled body.
5. CI and promotion workflows now run `verify:boot` after building with preview configuration and outbound notifications off. A fail-closed target guard checks the exact preview URL and matching JWT project/role claims before integration tests and the boot check. This configuration check does not replace server authentication or RLS tests. Six tests cover accepted preview configuration and rejected production/mismatched/missing credentials.

## Verification

- Focused tests: 40 passed across environment validation, voice guard, boot checker and CI preview-target checks.
- Targeted ESLint: passed.
- Repository typecheck: passed.
- Fresh `npm run build`: passed, including compilation, TypeScript, page generation and postbuild restoration.
- `npm run verify:boot` against that fresh build: passed in 2.5 seconds, HTTP 200 with `ok: true`, using local configuration without a Bolna from-number. This proves local production-mode startup, not Vercel runtime parity.
- Initial startup-fix formatting and `git diff --check`: passed. Subsequent dependency and preview-deployment verification is recorded below. No database migrations or candidate calls have been performed.

## Follow-up release verification

- PR #387: https://github.com/SantoshAlamuri/TigerHireV1/pull/387.
- Initial fix `cf8f8634` deployed to preview as `dpl_463aMa2iLTxAMDHzaCkfZxWHfgCt`. The unique deployment health endpoint returned HTTP 200 and `{"ok":true}`. Deployment-scoped runtime logs show the named optional-voice warning instead of the fatal startup validation error.
- Preview is not fully cleared: two `/api/inngest` requests returned HTTP 401 with `Signature validation failed` / `Invalid signature`. The detailed request `d4qrd-1789316996595-bb1aa5c20e81` came from `Go-http-client/2.0` with a `deployId` query. This establishes a failed signed handshake, but does not independently establish which key or integration setting is wrong. Do not disable signature validation. Inngest account access is needed to compare the intended preview environment and its signing configuration.
- Replaced the nonexistent `fit_scores.fit_label` projection with existing `band` / `verdict` fields. Database read errors now skip notifications with a named warning rather than telling the candidate that scoring failed. Three notifier tests pass with messaging mocked.
- The read-only preview schema recheck reported missing `candidate_career_profiles`. **14 Sep:** the existing `supabase/migrations/20260904161828_candidate_career_profiles.sql` was applied to preview `htdyomyhkvhcwoeodwas` and then to production `qzhhhsvtyqyixpcdfhng` (empty table, RLS, owner policy). No candidate documents were written. CI Behavior RLS and Build passed on PR #387. The production domain remains on the rollback.
- Next.js was upgraded separately to pinned `16.3.5`, followed by a fresh build and successful production boot in 2.2 seconds. The upstream [Next.js advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) identifies `16.3.3` as a patched version. Subsequent targeted lockfile updates resolve sharp `0.35.4`, xmldom `0.9.12`, Tiptap core `3.31.3`, Browserslist `4.28.9`, fast-uri `3.1.7`, and js-yaml `4.3.2`. Each update was followed by a fresh production build and successful boot before proceeding to the next; the final boot passed in 3.1 seconds.
- Final `npm audit`: zero high, zero critical, four moderate findings (`@humanfs/node`, `@vitest/mocker`, `fflate`, `vitest`). No audit threshold was reduced or advisory suppressed.
- Final focused run: 83 tests passed across seven files covering startup, voice guards, CI targeting, notifier behavior, document extraction and input sanitization. Inngest source registration check passed. These tests use fixtures/mocks and send no candidate messages.
- Patched application commit `270888f2` deployed as `dpl_9PjekFVwdrjMyTdVikcrCytTNhjw`. `/`, `/login`, `/register` returned 200 with that exact deployment marker; `/api/health` returned 200 with `ok:true`. Deployment logs show the optional-voice warning and zero fatal log entries in the inspected window; two error-level entries still require integration verification. CI's Security Audit passed for this head. The production domain still serves the rollback marker.
- Supplying the anon key to the main test job exposed previously skipped live suites. Diagnostics found obsolete test setup/contracts: tenant tests called Next cookies outside a request; the login CSRF mock omitted newer exports and expected an obsolete SSO-disclosing 403; the security-definer test expected a candidate-pool RPC permission intentionally revoked by `20260621130100_revoke_candidate_pool_rpc_anon_auth.sql`.
- Corrected those tests: real signed-in user sessions behind the request adapter, unique owned fixtures, explicit approved agency links and checked setup errors; generic 401 for blocked SSO password login; authenticated candidate enumeration denied while the service role remains allowed. All 16 tests in these suites passed across the final targeted reruns, including real preview RLS/auth behavior. No database permissions were broadened. Fixture writes were limited to the verified preview project with cleanup; no schema migration was applied.

## Next release steps

- Publish a reviewed build containing this fix; promoting the existing `053246f4` cannot include a local code change. Verify its actual runtime logs before moving the production domain, then match the live domain marker to the intended deployment and check useful user routes.
- CI preview targeting is verified. `candidate_career_profiles` exists on preview and production. Apply is complete; promoting a reviewed #387 build is still a separate release step. Inngest preview signatures remain a separate integration check.
- The local dependency audit clears the high-severity release gate. Require CI and fresh runtime verification of the final PR head before release; moderate findings remain tracked above.
- Continue with existing upload/state/count/evidence gaps after this release-stability batch. New product capabilities remain deferred.
