# Elite Engineering Standard — Performance Report

**Target:** 95+ Lighthouse / benchmarks | &lt;200KB initial JS | Multi-tier caching  
**Last updated:** 2025-03-09

**Run the rating:** `npm run rate` produces an overall and per-pillar score (Performance, Code Quality, Security, DX, Scalability). Use `--skip-coverage` for a faster run. See [ELITE-ENGINEERING-STANDARD.md](./ELITE-ENGINEERING-STANDARD.md#how-to-run-the-rating).

---

## 1. Current State Summary

| Metric                    | Current                                            | Target                    | Status                 |
| ------------------------- | -------------------------------------------------- | ------------------------- | ---------------------- |
| Lighthouse Performance    | Not in CI                                          | 95+                       | 🔲 Add to CI           |
| Initial JS (gzipped)      | Measure with `ANALYZE=true npm run build`          | &lt;200KB                 | 🔲 Baseline needed     |
| Time to Interactive (TTI) | —                                                  | &lt;3s                    | 🔲 Measure             |
| Test coverage (Vitest)    | Thresholds 70% lines/branches/functions/statements | 90% unit, 80% integration | ✅ Thresholds enforced |
| API p95 latency           | k6 scripts available                               | Document in runbooks      | 🟡 k6 present          |

---

## 2. Before/After Benchmarks

### 2.1 Bundle size

**How to measure:**

```bash
ANALYZE=true npm run build
```

- Opens bundle report in browser after build.
- Check `_app` / main chunks and first-load JS total.
- **Target:** First-load JS &lt;200KB gzipped; code-split by route.

**Current tooling:**

- `optimizePackageImports` in `next.config.ts` for `lucide-react`, `recharts`, `@sentry/nextjs`, `zod`, `posthog-js`.
- Bundle analyzer enabled only when `ANALYZE=true` (no CI gate yet).

**Recommended baseline:** Run once, record main chunk sizes and total initial JS; add to this doc. Add CI step to fail on e.g. &gt;250KB initial JS if desired.

---

### 2.2 Caching strategy

| Tier        | Implementation                     | Usage                                                                            |
| ----------- | ---------------------------------- | -------------------------------------------------------------------------------- |
| L1 (memory) | In-process / React cache           | Per-request or short-lived; use Next `cache()` or request memo where appropriate |
| L2 (Redis)  | `src/lib/redis/cache.ts` (Upstash) | Jobs list, auth profile; TTL-based                                               |
| L3 (CDN)    | Vercel / `Cache-Control` headers   | Static assets: `_next/static` max-age=31536000, immutable                        |

**Gaps:**

- Redis set/del failures are currently silent (log at warn/debug recommended).
- Optional: short TTL cache for hot read endpoints (e.g. applications list, candidate list) where consistency allows.

---

### 2.3 Algorithmic complexity

| Area                            | Current                                                                   | Target                             | Notes                                          |
| ------------------------------- | ------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------- |
| Candidate list / accessible IDs | Two client queries or RPC `get_accessible_candidate_ids` for org list ≥50 | O(n log n) or better               | RPC avoids N+1; cap 5000 IDs for `IN` clause   |
| Signals ingest                  | Per-signal select + insert (N+1)                                          | Batch select + batch insert or RPC | See PRODUCTION-READINESS-CODE-REVIEW § High #8 |
| Fit score pipeline              | Per-candidate scoring                                                     | Document; consider batching        | See `src/lib/fitscore/`                        |

---

### 2.4 Concurrency

- **I/O:** Supabase client and fetch are async; no blocking sync I/O in hot paths.
- **CPU-heavy:** `pdf-parse`, `mammoth`, and similar are run in Node; consider worker threads for very large batches if needed.
- **Server external packages:** `pdf-parse`, `pdfjs-dist`, `mammoth`, OpenTelemetry are in `serverExternalPackages` to avoid bundling issues.

---

## 3. Performance Budgets (CI)

| Budget          | Current                                    | Action                                                                                        |
| --------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Vitest coverage | 70% lines, branches, functions, statements | ✅ Enforced in `vitest.config.ts`                                                             |
| Bundle size     | Not enforced                               | Add step: `ANALYZE=true npm run build` and parse report or use `@next/bundle-analyzer` output |
| Lighthouse      | Not in CI                                  | Add Lighthouse CI or Vercel Speed Insights; fail on performance &lt;90                        |

---

## 4. Profiling and Observability

- **Sentry:** Errors and performance (if configured); `reportError()` for API errors.
- **OpenTelemetry:** Instrumentation present; ensure spans for critical API routes and DB calls.
- **k6:** Scripts for load, stress, spike, soak, benchmark, breakpoint, authenticated flow in `k6/`.

**Recommendation:** Run k6 against staging before releases; record p50/p95/p99 and add to runbooks or this report.

---

## 5. Before/After Log Template

Use this when making performance-related changes:

```markdown
## [Date] — [Change description]

| Metric                 | Before | After |
| ---------------------- | ------ | ----- |
| Initial JS (gzipped)   | X KB   | Y KB  |
| Lighthouse Performance | X      | Y     |
| Coverage               | X%     | Y%    |
| [Other]                | …      | …     |
```

---

## 6. References

- [PRODUCTION-READINESS-CODE-REVIEW.md](./archive/2026-q1-q2/PRODUCTION-READINESS-CODE-REVIEW.md) — N+1, caching, bundle
- [ARCHITECTURE-SECURITY-PERF.md](./ARCHITECTURE-SECURITY-PERF.md) — RPC, caps, Redis
- [REDIS_ARCHITECTURE.md](./REDIS_ARCHITECTURE.md) — Cache design
- `next.config.ts` — Bundle analyzer, optimizePackageImports, serverExternalPackages
- `vitest.config.ts` — Coverage thresholds
