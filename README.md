# TigerHire

AI-powered two-sided talent marketplace. Find the right people. Score the fit.

- **Stack:** Next.js 16, TypeScript, Tailwind CSS, Vercel, Supabase, Claude API.
- **Launch stage:** Pre-beta (target beta cohort: design partners). See [docs/launch/PRE-LAUNCH-INFRA-CHECKLIST.md](docs/launch/PRE-LAUNCH-INFRA-CHECKLIST.md) for the current go/no-go bar and [docs/launch/REVIEW-MAY-20.md](docs/launch/REVIEW-MAY-20.md) / [docs/launch/PRE-LAUNCH-JUN-1.md](docs/launch/PRE-LAUNCH-JUN-1.md) for the rolling checkpoints. The April 2 2026 launch cycle materials are in [docs/archive/2026-q1-q2/](docs/archive/2026-q1-q2/).
- **Documentation:** Engineering docs index — [docs/README.md](docs/README.md). HTTP overview (incl. knockout screening routes): [docs/API.md](docs/API.md). Machine-readable: [docs/openapi.yaml](docs/openapi.yaml) (also `GET /api/openapi` when the app is running).
- **Per-job knockout (yes/no) screening:** If a job has active questions, candidates pass **before** an application row is created. Wiring: public `POST /api/apply` (multipart `screeningAnswers` when `jobId` is set), `GET /api/apply/{slug}?job=`, `POST /api/applications` (`screeningAnswers`), `GET /api/jobs/{id}/public-screening-questions` (candidate), `GET/POST` job `screening-questions` APIs (recruiter). **Stored answers:** `GET /api/applications/{id}` returns `screeningAnswers`; recruit **candidate** page (Hireability) shows the Q/A. DB: `supabase/migrations/20260424090000_job_screening_questions.sql`. Status: [FEATURE-INVENTORY-LIVING.md §4–5](docs/requirements/FEATURE-INVENTORY-LIVING.md#4-applications--apply), [ATS-PARTIAL-GAPS-BACKLOG.md §5](docs/requirements/ATS-PARTIAL-GAPS-BACKLOG.md#5-screening-and-selection).

## Git branches & releases

- **`main`** — Production-ready code only (Vercel production for `tigerhire.io`). **Nothing is pushed or merged to `main` without explicit operator consent and approval** (including from agents and automation). Do not use `main` for experiments or untested changes.
- **`dev`** — Default integration branch. New work lands here first via PR (or equivalent review). Preview deployments validate changes before production.
- **Typical flow:** `git checkout dev && git pull`, branch with a descriptive name, implement and test, open PR **into `dev`**, soak on preview; when the operator approves a release, promote **`dev` → `main`** (again: only with explicit go-ahead). See [CLAUDE.md](CLAUDE.md) and [.cursorrules](.cursorrules) for the full branching rules.
- **Interview–interviewer identity (pipeline):** When enabling in an environment, set **both** `FF_INTERVIEWER_IDENTITY_V1` and `NEXT_PUBLIC_FF_INTERVIEWER_IDENTITY_V1` to the same intent so API validation, the interviewer-options route, and recruit UI stay aligned (see `.env.example` for details and the post-migration audit SQL).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in values when accounts are ready
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Env vars:** See `.env.example` for required and optional variables (Supabase, Stripe, cron secret, etc.). Production requires at least `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and either `CRON_SECRET` or `CRON_SECRET_HASH`.

**Database & migrations:** Apply schema with `npm run db:push` (or `supabase db push`). Migrations live in `supabase/migrations/`.

**Grant platform admin:** run `npm run grant-platform-admin -- --email you@tigerhire.com --confirm you@tigerhire.com` once for each internal operator who should access platform onboarding pages.

**Tests:** `npm run test` (unit/integration), `npm run test:coverage` (with coverage; use `test:coverage:strict` to enforce 70% gates), `npm run test:e2e` (Playwright; run `npm run e2e:sync-apply-slug` to set `E2E_APPLY_ORG_SLUG` from your Supabase, or set it by hand). Full matrix: [docs/TESTING.md](docs/TESTING.md). **OpenAPI:** `docs/openapi.yaml` — also served as JSON at `GET /api/openapi` when the app is running.

To analyze bundle size: `ANALYZE=true npm run build` (opens a report in the browser after build).

### Troubleshooting: WebSocket / HMR connection failed

If the browser console shows `WebSocket connection to 'ws://localhost:3000/_next/webpack-hmr?...' failed`:

- **Hot reload won’t work**, but the app can still run. To fix HMR:
  1. Ensure the dev server is running: `npm run dev`, then open [http://localhost:3000](http://localhost:3000) (not a cached copy or another port).
  2. If you use a proxy, VPN, or tunnel, make sure WebSockets to `localhost:3000` are allowed and forwarded.
  3. Restart the dev server and do a hard refresh (Ctrl+Shift+R / Cmd+Shift+R).

### Troubleshooting: "Database error querying schema" on login

If you get a **400** on `.../auth/v1/token?grant_type=password`, use the test accounts on the login page or click **Setup demo users** first (invalid credentials or user missing). In development, no env var is required—test users use a default password so you can **Setup demo users** once, then sign in with one click from the list. If sign-in shows a red **Database error querying schema** (or a 500 from Auth), Supabase’s `auth.users` table likely has `NULL` in token columns where GoTrue expects empty strings. This can happen after creating users via SQL or after certain migrations.

**Fix:** Run the one-time SQL fix in the Supabase Dashboard → **SQL Editor**:

1. Open your project in [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **SQL Editor** and run the contents of `supabase/fix-auth-users-token-nulls.sql` (or run the four `UPDATE auth.users ...` statements from that file).

After that, login should work again. New users created with **Setup demo users** or the Auth API are created with correct values; the fix is only for existing rows that already have `NULL`s.

### 500 on GET or POST /api/jobs

If the jobs list or job creation returns **500 Internal Server Error**, the database may be missing the `hiring_manager` role and `jobs.hiring_manager_id` column (the app expects them).

**Fix:** In Supabase Dashboard → **SQL Editor**, run the migration script `supabase/migrate_hiring_manager.sql`. It adds the enum value, column, index, and RLS policies for hiring managers.

## Routes

- `/` — Home (companies + candidates hero)
- `/waitlist` — Early access signup (email + WhatsApp link)
- `/about`, `/product`, `/pricing`, `/contact`, `/blog`, `/privacy`, `/terms` — Public pages
- `/login`, `/register` — Auth (Supabase email/password + Google SSO).
- `/api/waitlist` — POST to add waitlist signup (DB integrated).

## Plan

See the project plan and detailed build checklist for the 40-day sprint and tech stack.
