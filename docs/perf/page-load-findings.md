# Page-Load Performance — Findings & Plan

**Date:** 2026-06-16
**Source:** PostHog `$web_vitals` (autocaptured), p75, last 14 days, production.

## TL;DR

Page **loads** are slow; **interactivity is fine**. p75 LCP is in Google's "poor" band (>4s) on most dashboard routes and FCP is uniformly ~2.5–4.2s, while INP is good (<100ms) everywhere. A uniformly high FCP across nearly every route points to a **systemic server/first-byte cost**, not a single bad page — most consistent with **Supabase region latency** (prod DB in Sydney `ap-southeast-2`, users in India), amplified on data-heavy pages by **multiple per-page API calls**.

## Measured (p75, last 14 days)

| Route                                                             | LCP         | FCP       | INP  |
| ----------------------------------------------------------------- | ----------- | --------- | ---- |
| `/recruit/jobs/[id]` (job detail)                                 | 9.8s / 6.7s | 2.7s      | good |
| `/company/jobs`                                                   | 7.3s        | 3.3s      | good |
| `/profile`                                                        | 6.8s        | 3.5s      | good |
| `/apply/finstack`                                                 | 5.3s        | 2.4s      | good |
| `/` (landing)                                                     | 4.9s        | 2.8s      | good |
| `/recruit/pipeline`,`/recruit/jobs`,`/recruit/candidates`,`/home` | ~3.8–4.3s   | ~3.8–4.2s | good |
| `/login` (best)                                                   | 1.9s        | 1.6s      | good |

Thresholds: LCP good <2.5s / poor >4s; FCP good <1.8s; INP good <200ms.

## Root causes (ranked)

1. **Region latency (dominant, infra).** Prod Supabase is `ap-southeast-2` (Sydney); users are in India. Every SSR data fetch and every client API call pays a cross-region round-trip, which explains the ~3s floor on FCP across all routes. See `docs/SUPABASE_AUTH_CONNECTIVITY_INDIA.md`.
2. **Per-page API fan-out (app-level, amplifier).** The worst route, `/recruit/jobs/[id]`, fires ~5 client queries (`/api/jobs/[id]`, fit-scores, availability, pipeline, feedback-templates). They run in parallel (good) and `useApiQuery` already dedupes/caches by key (so the layout+page both requesting `/api/jobs/[id]` is a single network call), but the page's LCP is still bounded by the **slowest** of N round-trips to Sydney. More round-trips × high RTT = high LCP.
3. **Middleware per-request reads (minor — fixed).** The A3 API account-status gate did a redundant `getCachedAuthProfile` read alongside the org-activation gate. De-duped to a single read per API request (`perf(middleware): resolve auth profile once`).

## What is NOT the problem

- **JS bundle / imports** — already optimized: `next.config.ts` sets `optimizePackageImports` for `lucide-react`, `recharts`, `@sentry/nextjs`, `zod`, `posthog-js`, and `@next/bundle-analyzer` is wired (`ANALYZE=true`). Not the FCP driver.
- **Interactivity** — INP is good everywhere; no main-thread/JS-execution problem.

## Recommendations (impact order)

1. **Cut region RTT (biggest win, infra — needs operator action).** Options:
   - Move the Supabase project to an India/Singapore region (`ap-south-1` Mumbai), or add a **read replica** there and point read-heavy queries at it.
   - Pin Vercel functions to the region nearest Supabase so server↔DB hops are intra-region.
   - Edge-cache public/cacheable GETs.
2. **Reduce round-trips on data-heavy routes (app-level).** For `/recruit/jobs/[id]`, consider a single composed endpoint (or RSC server-side prefetch) returning job + scores + availability + pipeline + templates in one response, so LCP is bounded by one round-trip, not five. Same idea as the deferred **Home #2** batched tile endpoint.
3. **Prefetch/stream.** Use RSC streaming / `loading.tsx` skeletons so first paint isn't blocked by data (helps perceived LCP even before infra changes).

## Done in this pass

- De-duped the redundant middleware Redis read (one fewer round-trip per API request).
- Documented the measured baseline above so future changes can be compared against it.

## Not done (needs decisions / infra)

- Region/replica move (infra — operator).
- Composed job-detail endpoint + Home tile batching (app changes; meaningful scope — schedule separately).
