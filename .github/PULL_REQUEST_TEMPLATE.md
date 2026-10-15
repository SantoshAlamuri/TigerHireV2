## Pre-Submit Checklist (Blocks Merge)

Run `npm run gate` before submitting. All must pass:

- [ ] `npm run typecheck` — 0 errors
- [ ] `npm run lint -- --max-warnings 0` — 0 warnings
- [ ] `npm run format:check` — 0 unformatted files
- [ ] `npm run test` — 0 failures (coverage target per vitest.config)
- [ ] `npm run validate` — All mutating API routes use Zod
- [ ] `npm run size-check` — No file in src/ over 250 lines
- [ ] No `console.log` / `console.error` in src (use logger)
- [ ] No `@ts-ignore` without ticket link in comment (or 0)

Optional before merge: `npm run rate` for full Elite Standard score.
