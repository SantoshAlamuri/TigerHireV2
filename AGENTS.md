# AGENTS.md

## Cursor Cloud specific instructions

### Overview

TigerHire is an AI-powered two-sided talent marketplace built with Next.js 16 (App Router), TypeScript, Tailwind CSS 4, and Supabase. See `README.md` for setup basics.

### Running services

- **Dev server**: `npm run dev` (port 3000, uses Turbopack by default; add `--webpack` for Webpack mode)
- The app starts without real Supabase credentials in dev mode. The env config (`src/lib/config/env.ts`) returns empty strings for missing optional vars and stubs for required ones when `NODE_ENV !== "production"`.
- A `.env.local` file must exist with at least placeholder values for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Without real Supabase credentials, auth flows (login, register) will fail at the network level, but all public pages, the waitlist flow, and the dev server itself work fine.

### Lint / Typecheck / Test

- **Lint**: `npm run lint` (ESLint 9). There is 1 pre-existing error (conditional React Hook in a component) and ~323 warnings, all in the existing codebase.
- **Typecheck**: `npm run typecheck` (tsc --noEmit). Passes cleanly.
- **Unit/integration tests**: `npm test` (Vitest). ~804/820 tests pass; the 16 failures are pre-existing (component mocking issues and API route test edge cases).
- **E2E tests**: `npm run test:e2e` (Playwright). Requires `npx playwright install --with-deps chromium` first.
- **Format check**: `npm run format:check` (Prettier).

### Gotchas

- The Husky pre-commit hook runs `npx lint-staged`, which runs Prettier + ESLint on staged files. If committing, be aware of the pre-existing lint error which may cause the hook to fail on certain files.
- `.env.example` is committed. Copy it to `.env.local` and then fill required values for your environment.
- The `docker-compose.yml` provides a standalone Postgres on port 54322 for DB-only local dev. Full Supabase local stack requires `npx supabase init` then `npx supabase start` (not yet configured in this repo).
- Node.js 20+ is required. The VM has Node 22, which works fine.

## Correctness conventions (added 2026-07-06 after the FitScore/flags audit)

These rules exist because each one maps to a real production-bound bug class found in the 2026-07-06 scoring audit. Do not regress them.

1. **LLM-output zod schemas: never `z.array(x).catch([])`.** An array-level `.catch` silently replaces the whole array when ONE element is malformed (safeParse still reports success) — this made candidates with critical red flags render spotless. Use element-level tolerance: `z.preprocess` that coerces/drops bad elements individually (see `coerceRedFlagArray` in `src/lib/validations/fitscore-hybrid.ts`). Enforced by `tests/unit/llm-schema-guardrails.test.ts`.
2. **Prompts that demand structured output must state the exact JSON shape** (key names + enum values), not just describe it in prose — models otherwise invent key names and the schema tolerance layer becomes the only defense.
3. **React hooks: `react-hooks/exhaustive-deps` is `error` for `src/components/fitscore/**`and`src/components/dashboard/FitScore\*.tsx`\*\* (eslint.config.mjs override). A stale closure in the JD wizard silently discarded recruiter-entered scoring requirements. When cleaning up other directories, extend that override list — never weaken it.
4. **Scoring invariants:** dedupe flags BEFORE the score engine (never only at persist); the displayed score, band label, verdict, and market ranking must all derive from the SAME final (calibrated, rounded) number; never persist model "quotes" that failed verbatim-substring validation against the resume.
5. **Degraded paths must be visible:** any fallback/degraded acceptance (deterministic fallback score, sanitized quotes, demolished extraction fields) needs a distinct `logger.warn` event name and, where recruiter-facing, a UI indicator (`scoring_method` → fallback badge).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
