# Code Quality Reality Check — International Standards

**Purpose:** Explain why Code Quality scores 25–50/100 in the Elite audit and what must change to reach 90+ (Elite) in line with common international and industry standards.

**References:** Elite Standard v1/v2, [ELITE-CODE-REVIEW-CHECKLIST.md](./ELITE-CODE-REVIEW-CHECKLIST.md), [PRODUCTION-READINESS-CODE-REVIEW.md](./archive/2026-q1-q2/PRODUCTION-READINESS-CODE-REVIEW.md), ISO/IEC 25010 (maintainability), SonarQube/ESLint best practices, TypeScript strict mode, OWASP input validation.

---

## 1. How Code Quality Is Scored (Elite Audit)

The `npm run rate` script scores **Code Quality** from four checks only:

| Check                             | What it measures                                 | Current                            |
| --------------------------------- | ------------------------------------------------ | ---------------------------------- |
| **TypeScript strict (typecheck)** | `tsc --noEmit` passes                            | ✓ Pass                             |
| **ESLint**                        | Zero errors (and warnings if `--max-warnings 0`) | ✗ Fail (e.g. k6 unused var)        |
| **No `any` in src/**              | No `: any` or `as any` in `src/`                 | ✓ Pass (explicit any rare; see §3) |
| **No .ts/.tsx >400 lines**        | No file in `src/` over 400 lines                 | ✗ Fail — **32 files**              |

**Result:** 2/4 = **50/100**. If ESLint is run with `--max-warnings 0` or typecheck ever failed, the score can drop to **25/100**.

So the **main driver** of the low Code Quality number is:

1. **File size** — 32 files over 400 lines (audit) and many over 250 (ESLint/Elite v2).
2. **Lint** — Any single ESLint error or warning fails the check (when enforced strictly).

Security-related checks (reportError, Zod) are scored under **Security**, not Code Quality, but fixing them is required for an overall 90+.

---

## 2. Alignment With International / Industry Standards

| Standard / practice                 | What it expects                                                                       | Our gap                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **ISO/IEC 25010 (Maintainability)** | Modularity, reusability, analysability, modifiability, testability                    | Very large files reduce modularity and analysability; hard to test in isolation.                             |
| **SonarQube / ESLint**              | File length limits (often 250–500 lines), cyclomatic complexity, no duplicated blocks | 32 files >400 lines; complexity rules exist but oversized files often imply high complexity.                 |
| **TypeScript strict**               | Strict mode, no `any`, explicit return types on public APIs                           | We pass typecheck; remaining `any`-like usage in JSDoc or generics should be minimised.                      |
| **Clean Code / SOLID**              | Single responsibility, small units, clear boundaries                                  | Monolithic pages (1000+ lines) violate SRP; logic mixed with UI.                                             |
| **Testability**                     | Units small enough to unit test; integration boundaries clear                         | Giant pages and components are hard to test; coverage excludes `page.tsx` but logic inside them is untested. |
| **OWASP / secure coding**           | Validate all inputs at boundaries (Zod/parsers), structured error logging             | Scored under Security; Zod at 34% on mutating routes, reportError missing in 51/95 routes with catch.        |

So: **the low Code Quality score is a fair reflection** of file size and lint, and improving it aligns with common international and industry norms.

---

## 3. What Needs to Be Fixed (Prioritised)

### P0 — Must fix for Code Quality to reach 90+

#### A. Eliminate ESLint failures and enforce 0 warnings

- **Current:** k6 scripts excluded from no-unused-vars in eslint.config.mjs.
- **Action:**
  - Fix or remove the unused variable (or exclude k6 from lint if it’s not product code).
  - Run `npm run lint -- --max-warnings 0` in CI so that **any** warning fails the build.
- **Standard:** ESLint with zero warnings is a common industry baseline (e.g. in strict CI gates).

#### B. Reduce file size: no file in `src/` >400 lines (audit) and ideally ≤250 (Elite v2)

- **Current:** **32 files** in `src/` exceed 400 lines. Examples:

| Lines | File                                                        |
| ----: | ----------------------------------------------------------- |
|  2373 | `src/lib/mock/data.ts`                                      |
|  1487 | `src/app/(dashboard)/recruit/jobs/[id]/page.tsx`            |
|  1061 | `src/app/(dashboard)/recruit/jobs/[id]/interviews/page.tsx` |
|  1018 | `src/components/dashboard/PostJobForm.tsx`                  |
|  1006 | `src/app/(dashboard)/company/jobs/new/page.tsx`             |
|  1006 | `src/app/(dashboard)/recruit/jobs/new/page.tsx`             |
|   971 | `src/app/(dashboard)/agency/pipeline/page.tsx`              |
|   831 | `src/app/(dashboard)/agency/clients/page.tsx`               |
|   818 | `src/app/(dashboard)/candidate/profile/page.tsx`            |
|     … | … (24 more files)                                           |

- **Action (per file):**
  - **Extract components:** Move sections of the page into smaller React components (e.g. `RecruitJobDetailHeader`, `RecruitJobDetailPipeline`, `InterviewsList`, `InterviewForm`).
  - **Extract hooks:** Move data fetching and state logic into `useRecruitJobDetail`, `useInterviews`, etc.
  - **Extract lib/ modules:** Move business logic and API calls into `src/lib/` (services, repositories, utils) with clear single responsibility.
  - **Split mock data:** Replace one giant `lib/mock/data.ts` with multiple files (e.g. by domain: `mock/jobs.ts`, `mock/candidates.ts`) or generate from a smaller seed.
- **Target:** Every file in `src/` ≤400 lines (audit), then ≤250 (Elite v2 / `npm run size-check`).
- **Standard:** SonarQube and many style guides cap file length (e.g. 250–500 lines); 250 is a strong maintainability target.

#### C. Prettier and openapi.yaml

- **Current:** `format:check` fails (e.g. `docs/NEXT-ITERATION-PRIORITY.md`, `docs/openapi.yaml` YAML syntax).
- **Action:** Run `npm run format` (or Prettier on the repo), fix the YAML syntax error at `docs/openapi.yaml` (nested mappings in compact form).
- **Standard:** Consistent formatting and valid config files are part of DX and CI hygiene.

---

### P1 — Strongly recommended (quality and security)

#### D. Remove or type `any` and avoid escape hatches

- **Current:** Grep for `\bany\b` in `src/` still finds usages (e.g. in `env.ts`, `LoginClient.tsx`, `job-query.ts`, `JobRepository.ts`, `handler.ts`, `health/route.ts`, etc.). Some may be in comments or generics; the audit only counts `: any` and `as any`.
- **Action:** Replace `any` with `unknown` and type guards, or with proper types; avoid `@ts-ignore` without a ticket reference.
- **Standard:** TypeScript strict + no explicit `any` is the usual “international” baseline for TypeScript codebases.

#### E. JSDoc for public APIs

- **Standard (Elite Q4):** New public APIs in `src/lib/` and API route helpers should have JSDoc (params, return, throws).
- **Action:** Add JSDoc to exported functions in `src/lib/` and shared API helpers used by route handlers.

#### F. Test coverage and structure

- **Current:** Coverage thresholds are 70% (lines, branches, functions, statements); many `page.tsx` and heavy components are excluded, so a lot of UI logic is untested.
- **Action:** As you split large pages into hooks and lib modules, add unit tests for hooks and lib; add integration tests for API routes and critical flows. Keep coverage ≥70% and aim for ≥80% on new code in `src/lib/` and API routes.
- **Standard:** 70–80%+ line coverage and integration tests at boundaries are common in production codebases.

---

### P2 — Security and reliability (affect overall score, not Code Quality pillar)

- **reportError in catch blocks:** 51/95 API routes that use `catch` do not call `reportError`. Add structured error logging in every route that catches.
- **Zod at boundaries:** 34% (29/85) of mutating routes use Zod; target ≥80%. Add Zod (or similar) validation for every POST/PUT/PATCH/DELETE body.
- See [PRODUCTION-READINESS-CODE-REVIEW.md](./archive/2026-q1-q2/PRODUCTION-READINESS-CODE-REVIEW.md) for the full list (rate limit fail-closed, file type validation by content, etc.).

---

## 4. Target State (90+ Code Quality)

| Criterion         | Target                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------- |
| Typecheck         | Pass (strict)                                                                           |
| ESLint            | Pass with `--max-warnings 0`                                                            |
| No `any`          | 0 explicit `any` in `src/`                                                              |
| File size         | 0 files in `src/` >400 lines (then 0 >250 for v2)                                       |
| Prettier / format | Pass                                                                                    |
| Tests             | Coverage ≥70% (thresholds pass); new logic in lib and API covered                       |
| Structure         | Large features split into components, hooks, and lib modules with single responsibility |

---

## 5. Suggested Order of Work

1. **Quick wins (1–2 days)**
   - Fix ESLint (e.g. k6 unused var or exclude k6).
   - Fix Prettier and `docs/openapi.yaml`.
   - Run `npm run rate` and confirm Code Quality is no longer dragged down by lint/format.

2. **File size (sprint-sized)**
   - Tackle the top 5–10 largest files first (e.g. `lib/mock/data.ts`, recruit job `[id]/page.tsx`, interviews page, `PostJobForm`, job new pages, agency pipeline).
   - For each: extract components, hooks, and lib modules; re-run `npm run size-check` and `npm run rate` until no file in `src/` is >250 lines.

3. **Consistency**
   - Add JSDoc for new and high-traffic public APIs in `src/lib/`.
   - Replace remaining `any` with proper types.
   - Add reportError and Zod to all mutating routes (Security pillar).

4. **CI**
   - Ensure CI runs: `npm run typecheck`, `npm run lint -- --max-warnings 0`, `npm run format:check`, `npm run size-check`, and `npm run rate --fail-under=70` (or 90 when you target Elite).

---

## 6. Summary

- **Why the score is low:** Code Quality is computed from only four checks. Two fail: **ESLint** and **file length** (32 files >400 lines). That yields 50/100; with one more failure it would be 25/100.
- **Reality check:** Large, monolithic files and lint/format failures are legitimate quality issues and align with **international and industry standards** (ISO 25010, SonarQube-style rules, TypeScript strict, Clean Code).
- **What to fix first:** (1) Lint and format, (2) split the 32 oversized files into smaller components, hooks, and lib modules, (3) then tighten types, JSDoc, tests, and security (reportError + Zod) to reach and sustain 90+.

Once ESLint and file length pass and the other two Code Quality checks keep passing, Code Quality will reach **100/100** for that pillar; the overall Elite score will still require improving Security (and optionally DX) as in the existing production-readiness checklist.
