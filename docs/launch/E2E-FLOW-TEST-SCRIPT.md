# End-to-end flow test script (June 3 launch)

Use this as the **written test script** for P1. Target: full path in **under 15 minutes** with **zero console errors** and **no HTTP 500s**. Record a screen capture when it passes.

## Preconditions

- Staging or local with env applied; at least one test company and recruiter account.
- WhatsApp test: optional for this script; use email fallbacks if WA is in sandbox.

## Flow (recruiter + candidate)

1. **Sign in** as company admin or recruiter.
2. **Create or open a job** (status open, public apply enabled if you use org apply URL).
3. **Post application** as candidate: open `/apply/{org-slug}` (or org job link), upload CV, complete knock-out/screening if shown, submit.
4. **Verify application** appears under **Recruit → Applications** with **FitScore** on the card.
5. **Open candidate** (Recruit → Candidates → select) and confirm **score detail** and **activity / communications** panel if present.
6. **Move stage / shortlist** as needed (pipeline).
7. **Interviews** (if using slots): add availability on job **Interviews** tab; either book in-app or use **self-schedule link** when generated.
8. **Offer**: create/send offer from candidate flow; open **public offer link**; sign (ordecline) as appropriate.
9. **Audit**: offer timeline / audit events visible where implemented.

## Automated smoke (CI)

- Run: `npx vitest run tests/functional/launch-p1-routes-smoke.test.ts` to verify launch route modules import.
- Run: `npx playwright test e2e/launch-jun3-smoke.spec.ts` (requires `baseURL` in `playwright.config.ts` and a reachable dev/preview server) for public home/pricing and invalid self-schedule token.
- **Self-schedule link (recruiter):** `POST /api/jobs/{jobId}/interviews/self-schedule-link` with body `{ "pipeline_candidate_id": "<uuid>" }` returns `{ url, expiresAt }`. Open the URL as a candidate to pick a slot (requires `interview_schedule_tokens` migration applied).

## Punch list

While running, note: broken steps, 404s, missing buttons, confusing copy, `TODO`/`FIXME` in UI path. File fixes as separate tasks.

## Video

Store the E2E recording in your team drive; name includes date and environment.
