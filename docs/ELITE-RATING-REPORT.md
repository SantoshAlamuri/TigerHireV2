# Elite Standard — Rating Report

**Generated:** 2026-03-09T18:39:50.046Z

## Overall: 65/100

| Pillar       | Score   |
| ------------ | ------- |
| Code Quality | 25/100  |
| DX           | 75/100  |
| Performance  | 100/100 |
| Security     | 50/100  |
| Scalability  | 100/100 |

## Failed checks

- **[codeQuality]** TypeScript strict (typecheck) —
  > tigerhire@0.1.0 typecheck
  > tsc --noEmit -p tsconfig.typecheck.json

src/app/api/agency/reprocess-candidates/route.ts(245,45): error TS2339: Property 'overallScore' does not exist on type 'FitScore

- **[codeQuality]** ESLint —
  > tigerhire@0.1.0 lint
  > eslint

C:\Users\santosh\Desktop\TigerHire\k6\authenticated-flow.js
3:10 warning 'SharedArray' is defined but never used @typescript-eslint/no-unused-vars
26

- **[dx]** Prettier format:check — [warn] docs/ARCHITECTURE-C4.md
  [warn] docs/ELITE-RATING-REPORT.md
  [warn] docs/NEXT-ITERATION-PRIORITY.md
  [error] docs/openapi.yaml: SyntaxError: Nested mappings are not allowed in compact mappings (10
- **[security]** API routes with catch use reportError — 51/95 routes
- **[security]** Mutating routes use Zod (≥80%) — 34% (29/85)
- **[codeQuality]** No .ts/.tsx files >400 lines — 32 file(s)

See [ELITE-CODE-REVIEW-CHECKLIST.md](ELITE-CODE-REVIEW-CHECKLIST.md) for full criteria.
