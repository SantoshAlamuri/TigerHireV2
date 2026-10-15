# Elite Engineering Standard v2.0 — Tool-Enforced

**Validation:** Automated | **Target:** 90+ on all metrics

This document defines how each pillar is **enforced in code and CI**, not just documented. Stack: Next.js, React, TypeScript, Vitest, ESLint, Prettier.

---

## 1. Code Quality — Strict tool enforcement

### Type safety (0 errors)

- **tsconfig:** `strict: true` (in [tsconfig.json](../tsconfig.json) / [tsconfig.typecheck.json](../tsconfig.typecheck.json)). Optional when ready: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- **Rules:** No `any`; use `unknown` + type guards. All function returns explicitly typed. No `@ts-ignore` without ticket link in comment.
- **Enforcement:** `npm run typecheck` (CI + gate).

### Lint / format (0 warnings)

- **ESLint:** `@typescript-eslint/no-explicit-any: "error"`, `max-lines: ["error", { max: 250, skipBlankLines: true }]` for `src/`. Tests excluded from max-lines and no-explicit-any.
- **Prettier:** [.prettierrc](../.prettierrc) — `printWidth: 100`. Optional: `singleQuote: true` when team adopts.
- **Pre-commit:** lint-staged runs Prettier + ESLint; commit blocked on error.
- **CI:** `npm run lint -- --max-warnings 0` (build fails on any warning).

### File size limits

- **Rule:** No file in `src/` &gt; 250 lines (blank/comments skipped).
- **Enforcement:** ESLint `max-lines` + `npm run size-check` ( [scripts/size-check.mjs](../scripts/size-check.mjs) ).
- **Exception:** Architecture review approval for specific files; add ESLint disable with ticket.

---

## 2. Security — Input/output boundaries

### Zod validation (target 100% at boundaries)

- **Rule:** Every API route that mutates (POST/PUT/PATCH/DELETE) must validate request body with Zod (e.g. `schema.parse()` or `safeParse()`).
- **Enforcement:** `npm run validate` runs [scripts/validate-schemas.mjs](../scripts/validate-schemas.mjs); fails if any mutating route lacks Zod usage.
- **Pattern:** Use a shared `validate(schema)(input)` or `schema.parse(body)` at the top of the handler; reject unknown keys with `.strict()`.

### Error logging (structured, no leaks)

- **Rule:** All errors logged with correlation ID; client never sees stack or internal details; sensitive data redacted.
- **Enforcement:** Code review + `reportError` / logger usage; no `res.json({ error: error.message, stack })`.

---

## 3. Performance — Maintain 100

- **Budgets:** Vitest coverage thresholds in [vitest.config.ts](../vitest.config.ts). Optional: bundle size in CI (e.g. bundlesize), Lighthouse CI.
- **Runtime:** Health endpoint can log slow operations; no hard enforcement in v2.0.

---

## 4. DX — Friction removal

- **Onboarding:** README + `.env.example`; `npm run gate` verifies typecheck, lint, format, validate, size-check.
- **Fast feedback:** HMR and test watch; target sub-second feedback where possible.

---

## 5. Scalability — Maintain 100

- **Database:** Query review for N+1, indexes; runbooks in [docs/RUNBOOKS.md](./RUNBOOKS.md).
- **Enforcement:** Code review + optional EXPLAIN in PRs.

---

## Scripts reference

| Script                             | Purpose                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run gate`                     | Full pre-submit gate: typecheck, lint (0 warnings), format, validate, size-check. Run before PR. |
| `npm run typecheck`                | TypeScript strict, 0 errors.                                                                     |
| `npm run lint -- --max-warnings 0` | ESLint; fails on warnings.                                                                       |
| `npm run format:check`             | Prettier; fails if any file unformatted.                                                         |
| `npm run validate`                 | Mutating API routes use Zod.                                                                     |
| `npm run size-check`               | No file in src/ &gt; 250 lines.                                                                  |
| `npm run security-audit`           | `npm audit --audit-level=high`.                                                                  |
| `npm run rate`                     | Full Elite audit (score 0–100 + report).                                                         |

---

## PR checklist

See [.github/PULL_REQUEST_TEMPLATE.md](../.github/PULL_REQUEST_TEMPLATE.md). Merge is blocked until `npm run gate` (and tests) pass.

---

## Product documentation hygiene (user-facing changes)

When a PR changes **behavior, permissions, or a primary route** for any tenant-facing role, update the **living** rows in [FEATURE-INVENTORY-LIVING.md](./requirements/FEATURE-INVENTORY-LIVING.md) and, if end-user _tasks_ change, a short pass in [USER-GUIDE-BY-ROLE.md](./help/USER-GUIDE-BY-ROLE.md). If a **PRD** or gap tracker row exists, update that too so GTM and code stay aligned. Not every PR needs all three; cover what would confuse support if left stale.

---

## Relation to v1.0

- [ELITE-ENGINEERING-STANDARD.md](./ELITE-ENGINEERING-STANDARD.md) (v1.0) defines targets and outputs (checklist, performance report, C4, tech debt).
- v2.0 adds **tool enforcement**: ESLint rules, Prettier, validate/size-check scripts, CI `--max-warnings 0`, and the `gate` script so the same criteria are enforced in code and CI.
