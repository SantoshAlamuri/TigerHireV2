# Next Iteration Priority — 65 → 80+

Prioritized list to reach **Overall 80+** and **Code Quality 25 → 90**. Use this after quick wins (lint --fix, prettier --write).

---

## Quick wins (do first)

```bash
npm run lint -- --fix
npm run format
```

Then re-run `npm run rate -- --skip-coverage` to confirm **DX** and **Code Quality** improve (format + fixable lint).

---

## 1. Code Quality — Lint (one remaining warning)

| File                  | Issue                                          |
| --------------------- | ---------------------------------------------- |
| `k6/api-benchmark.js` | `import/no-anonymous-default-export` (line 37) |

**Fix:** Export a named function and set it as `export default`, or add an ESLint-disable with a ticket for k6 scripts.

---

## 2. Code Quality — Remove `any` (1 occurrence)

| File                    | Location                                    | Note                                                                                                                        |
| ----------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/job-access.ts` | Line 22 (JSDoc: "super_admin: **any** job") | Audit script matches the word "any"; if no real `any` type in code, relax the script or rephrase the comment to "all jobs". |

Search code (not comments) for `: any` or `as any` and replace with proper types or `unknown` + type guards.

---

## 3. Code Quality — Long files (>250 lines, v2.0 gate)

**Top 20 by line count** (split into modules/hooks/components to get under 250):

| #   | File                                                        | Lines |
| --- | ----------------------------------------------------------- | ----- |
| 1   | `src/lib/mock/data.ts`                                      | 2161  |
| 2   | `src/app/(dashboard)/recruit/jobs/[id]/page.tsx`            | 1616  |
| 3   | `src/app/(dashboard)/recruit/jobs/[id]/interviews/page.tsx` | 1115  |
| 4   | `src/components/dashboard/PostJobForm.tsx`                  | 1091  |
| 5   | `src/app/(dashboard)/company/jobs/new/page.tsx`             | 1076  |
| 6   | `src/app/(dashboard)/recruit/jobs/new/page.tsx`             | 1076  |
| 7   | `src/app/(dashboard)/agency/pipeline/page.tsx`              | 1041  |
| 8   | `src/app/(dashboard)/agency/clients/page.tsx`               | 878   |
| 9   | `src/app/(dashboard)/candidate/profile/page.tsx`            | 856   |
| 10  | `src/app/(public)/page.tsx`                                 | 766   |
| 11  | `src/app/(public)/privacy/page.tsx`                         | 702   |
| 12  | `src/types/index.ts`                                        | 699   |
| 13  | `src/app/(public)/terms/page.tsx`                           | 689   |
| 14  | `src/app/(dashboard)/recruit/jobs/[id]/feedback/page.tsx`   | 657   |
| 15  | `src/app/(dashboard)/recruit/applications/page.tsx`         | 645   |
| 16  | `src/app/(dashboard)/messages/page.tsx`                     | 631   |
| 17  | `src/app/(public)/pricing/page.tsx`                         | 581   |
| 18  | `src/app/(public)/product/page.tsx`                         | 549   |
| 19  | `src/app/(auth)/login/LoginClient.tsx`                      | 527   |
| 20  | `src/lib/services/whatsapp.ts`                              | 525   |

Full list: run `node scripts/size-check.mjs` (fails with full output). **Strategy:** Extract subcomponents, custom hooks, or pure functions into separate files; keep pages as thin orchestrators.

---

## 4. Security — Zod at API boundaries (50 → 95)

**Mutating routes without Zod** (add `z.object(...).parse(body)` or `safeParse` at the top of the handler):

Run `node scripts/validate-schemas.mjs` for the full list. Examples to fix first (high-traffic or critical):

- `src/app/api/apply/route.ts`
- `src/app/api/auth/register/route.ts` (likely has Zod — verify)
- `src/app/api/auth/login/route.ts`
- `src/app/api/billing/checkout/route.ts` (if present)
- `src/app/api/jobs/parse-jd-url/route.ts`
- `src/app/api/agency/upload-profile/route.ts`
- `src/app/api/agency/upload-profile/bulk/route.ts`
- `src/app/api/webhooks/stripe/route.ts` (validate payload or event shape)

Then batch the rest (cron, admin, debug) so **≥80% of mutating routes** use Zod → Security pillar and overall score rise.

---

## 5. Security — Error logging (reportError in catch)

**Gap:** 51 of 95 API route files that use `catch` do not use `reportError` in the same file (audit heuristic: file has `catch` and has `reportError`).

**Fix:** In every route that has `try/catch`, ensure the `catch` block calls `reportError(err, { route: "METHOD /api/..." })` before returning 4xx/5xx. No bare `catch { return jsonError(...) }` without logging.

**Locate:** Search `src/app/api` for `catch` and ensure matching files also import and use `reportError`.

---

## 6. Target by iteration

| Iteration | Actions                                                            | Expected overall          |
| --------- | ------------------------------------------------------------------ | ------------------------- |
| Done      | Typecheck fixed                                                    | 65                        |
| 1         | Lint --fix + Prettier --write                                      | ~72–75                    |
| 2         | Fix k6 lint warning; remove/fix `any`                              | ~78                       |
| 3         | Split 5–10 largest files (e.g. mock/data, recruit/jobs pages)      | ~82–85                    |
| 4         | Add Zod to 10–15 critical API routes; add reportError in 20 routes | Security 70+, overall 80+ |

---

## Commands

```bash
# Re-run rating (fast)
npm run rate -- --skip-coverage

# Re-run and save report
npm run rate -- --skip-coverage --output=docs/ELITE-RATING-REPORT.md

# Gate (typecheck + lint 0 warnings + format + validate + size-check)
npm run gate
```

See [ELITE-CODE-REVIEW-CHECKLIST.md](./ELITE-CODE-REVIEW-CHECKLIST.md) and [ELITE-ENGINEERING-STANDARD-V2.md](./ELITE-ENGINEERING-STANDARD-V2.md) for full criteria.
