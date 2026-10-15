# Launch Readiness Gap to Closure - 2026-05-03

## Audit scope

- Repo: `TigerHire`
- Branch at audit time: `main`
- Working tree size at audit time: `223` changed paths
- Objective: run a clean, reproducible launch sweep and convert results into closure actions

## Clean test sweep (this pass)

| Check            | Command                                                          | Result | Evidence                                                  |
| ---------------- | ---------------------------------------------------------------- | ------ | --------------------------------------------------------- |
| Functional smoke | `npx vitest run tests/functional/launch-p1-routes-smoke.test.ts` | PASS   | 1 file, 2 tests passed                                    |
| E2E launch smoke | `npx playwright test e2e/launch-jun3-smoke.spec.ts`              | PASS   | 2 tests passed                                            |
| Type safety      | `npm run typecheck`                                              | PASS   | `tsc --noEmit -p tsconfig.typecheck.json` completed clean |

## Runtime endpoint sweep (production)

| Endpoint                                                                    | Status | Notes                                   |
| --------------------------------------------------------------------------- | ------ | --------------------------------------- |
| `https://tigerhire.io/`                                                     | `200`  | OK                                      |
| `https://tigerhire.io/jobs`                                                 | `200`  | OK                                      |
| `https://tigerhire.io/product`                                              | `200`  | OK                                      |
| `https://tigerhire.io/terms`                                                | `200`  | OK                                      |
| `https://tigerhire.io/privacy`                                              | `200`  | OK                                      |
| `https://tigerhire.io/dpa`                                                  | `200`  | OK                                      |
| `https://tigerhire.io/api/health`                                           | `200`  | OK                                      |
| `https://tigerhire.io/api/health?ready=1`                                   | `200`  | OK                                      |
| `https://tigerhire.io/api/health?ready=1&deps=1`                            | `200`  | OK                                      |
| `https://tigerhire.io/api/webhooks/whatsapp`                                | `403`  | Expected for protected webhook endpoint |
| `https://tigerhire.io/api/schedule/self-serve/0000000000000000000000000000` | `401`  | Non-500 failure path is healthy         |

## Defensive behavior check

Auth burst (`POST /api/auth/login`) returned:

- Attempts 1-4: `401`
- Attempts 5-6: `429`

Interpretation: invalid auth path is rate-limited; no `5xx` observed in burst.

## Readiness verdict

- **Product path confidence:** Medium-High (smoke tests passing for launch path)
- **Test confidence:** Medium (targeted smoke is green; full regression is not validated by this pass)
- **Ops confidence:** Medium-Low (critical infra checklist items still open/blocked)
- **Go/No-Go:** **NO-GO** until below P0 ops gaps are closed and evidenced

## Gap to closure (P0)

| Gap                                       | Current state              | Closure action                                                                       | Owner        | Exit evidence                                     |
| ----------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------ | ------------ | ------------------------------------------------- |
| DNS mail auth (SPF/DKIM/DMARC hardening)  | Blocked in infra checklist | Publish SPF + DKIM and move DMARC policy from `p=none` per rollout plan              | Ops          | DNS lookup evidence + mail-tester result          |
| PostHog production telemetry proof        | Blocked                    | Confirm `NEXT_PUBLIC_POSTHOG_KEY` + server key in prod env, generate one known event | Ops          | Screenshot/URL of captured production event       |
| Sentry production proof                   | In progress                | Trigger synthetic error and verify visibility in Sentry issue stream                 | Ops          | Sentry issue/event URL                            |
| Uptime monitoring and escalation evidence | In progress                | Configure monitor + on-call escalation for domain and webhook path                   | Ops          | Monitor screenshot with policy and alert chain    |
| Manual critical-path recording            | Open                       | Execute full recruiter-to-offer path from punch list and capture video               | Product + QA | Filled punch-list evidence cells + recording link |
| Punch list not updated with today results | Open                       | Mark both automated smoke commands as passed, attach command output snippets         | QA           | Updated punch-list rows with timestamp            |

## Suggested closure sequence (fastest path)

1. Update punch list with this run's two passing automated smoke checks.
2. Run and record the manual critical path from `docs/launch/E2E-FLOW-TEST-SCRIPT.md`.
3. Close observability proofs (PostHog + Sentry screenshots/URLs).
4. Close DNS mail auth and attach validation proof.
5. Attach uptime/alerting proof and finalize go/no-go sign-off.

## Recommended launch gate

Launch only when:

- Both automated smoke checks are green on the final candidate build.
- Manual critical-path video is complete with no unhandled `5xx`.
- All infra P0 rows in `PRE-LAUNCH-INFRA-CHECKLIST.md` are `done` with evidence links.

## 2026-05-07 execution update

- Offer countersign schema drift was closed in production by applying migration SQL via Supabase MCP (`offer_company_countersign` applied as version `20260507105253`).
- Production schema now includes all required columns on `public.offers`: `company_signer_name`, `company_signer_email`, `company_sign_token`, `company_sign_requested_at`, `company_signed_at`, `company_signer_ip`, `company_signer_user_agent`.
- Branch hygiene action completed: created and pushed `claude/soft-launch-prep` from `dev`, then fast-forwarded to current `main` head before preview deploy.
- Preview deployment is ready at `https://tigerhire-kgxtsq37q-santoshalamuris-projects.vercel.app` (`dpl_5YShFcibnf7kZ9ASAv16LpAAEMJu`).
- Fresh smoke probes on both production and preview returned expected non-`5xx` status codes on launch routes, webhook protection route, invalid scheduling token, and unauthenticated offer endpoints.
