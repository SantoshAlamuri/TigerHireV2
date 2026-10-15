# Database Audit — AgentDB Advanced Alignment

**Date:** 2026-03-07  
**Scope:** Current DB usage (Supabase + Redis) reviewed against AgentDB-advanced patterns. This project does **not** use AgentDB; suggestions apply the same concepts to the existing stack.

---

## Current Stack

| Layer             | Technology                            | Usage                                                                       |
| ----------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| **Primary store** | Supabase (PostgreSQL 15)              | Jobs, candidates, pipeline, auth, profiles                                  |
| **Vector search** | pgvector (ivfflat, cosine)            | `candidates.profile_embedding`, `jobs.jd_embedding`; RPC `match_candidates` |
| **Cache**         | Upstash Redis                         | Auth profile cache, GET `/api/my-pipeline` response cache                   |
| **Embeddings**    | OpenAI text-embedding-3-small (1536d) | Stored in Postgres; circuit breaker + retry in app                          |

---

## What’s Already Aligned

- **Distance metric:** pgvector uses `vector_cosine_ops` → **cosine similarity** (same as AgentDB default). Good for text embeddings.
- **Singleton clients:** Supabase admin and Redis are single-instance per process (connection-pool–style).
- **Cache key namespacing:** `auth:profile:<userId>`, `my-pipeline:<userId>` — clear domains.
- **Vector index:** ivfflat with `lists = 100`; semantic search does not full-scan candidates.

---

## Suggested Changes (by priority)

### 1. **Hybrid search (vector + metadata)**

**Concept (AgentDB):** Combine vector similarity with metadata filters (e.g. `year >= 2023`, `category = 'ml'`).

**Current:** `match_candidates` filters only by `visibility`, `profile_embedding IS NOT NULL`, similarity threshold, and optional `intent_min`.

**Suggestion:** Add optional metadata filters to semantic search so recruiter filters (e.g. location, experience band) are applied in the DB instead of in app after fetch.

- **Option A (app-level):** In `findSimilarCandidates`, fetch more candidates (e.g. 2×) and filter by `location` / `experience_years` in JS. Simple but wastes vector search slots.
- **Option B (recommended):** Extend `match_candidates` (or add `match_candidates_v2`) with optional parameters, e.g.:
  - `location_filter text DEFAULT NULL` — only candidates where `candidates.location = location_filter` or `candidates.location IS NULL`
  - `experience_min int DEFAULT NULL`, `experience_max int DEFAULT NULL`
    Then use indexes on `location`, `experience_years` and keep a single DB round-trip.

**Files:** New migration for `match_candidates` signature + `src/lib/services/embeddings.ts` to pass optional filters from callers (e.g. FitScore agent or API).

**Implemented:** `supabase/migrations/20250307120000_match_candidates_hybrid_filters.sql` adds `location_filter`, `experience_min`, `experience_max`; `findSimilarCandidates` accepts `MatchCandidatesFilters` and passes them to the RPC.

---

### 2. **Redis: retry and optional latency logging**

**Concept (AgentDB):** Production patterns — retry with backoff on transient failure, monitor latency.

**Current:** `cacheGet` / `cacheSet` / `cacheDel` catch errors and return null / no-op. No retry; no latency metrics.

**Suggestion:**

- **Retry:** On failure, retry once after a short delay (e.g. 50–100 ms) for transient network/Upstash issues.
- **Latency:** In development or when `DEBUG_CACHE=1`, log cache get/set latency and hit/miss so you can spot slow or failing Redis.

**Status:** Implemented in `src/lib/redis/cache.ts` (single retry + optional timing).

---

### 3. **Formalize cache key schema and TTLs** ✅ Implemented

**Concept (AgentDB):** Multi-DB / namespacing — clear key layout and TTL per domain.

**Current:** Keys and TTLs are in `auth-profile-cache.ts` (60s) and `my-pipeline/route.ts` (25s). No single place that documents all cache keys.

**Suggestion:** Add a small `src/lib/redis/keys.ts` (or section in existing file) that defines:

- Key prefix per domain: `auth:profile:`, `my-pipeline:`, (future: `embedding:`, etc.)
- TTL per domain and rationale (e.g. auth 60s, pipeline 25s).

Reduces key collisions and makes it obvious where to invalidate (e.g. pipeline cache on backfill).

**Implemented:** `src/lib/redis/keys.ts` (CacheDomain, CacheTTL, authProfileKey, myPipelineKey); auth-profile-cache and my-pipeline route refactored to use them.

---

### 4. **MMR (diversity) for candidate shortlist** ✅ Implemented

**Concept (AgentDB):** `useMMR: true`, `mmrLambda` — balance relevance vs diversity so results are not all nearly identical.

**Current:** FitScore agent takes top‑k by similarity only; the shortlist can be dominated by very similar profiles (e.g. same skills/location).

**Suggestion:** After `findSimilarCandidates`, optionally run a small MMR step in app: iterate results, maintain a “selected” set and a running centroid (or just use similarity to already-selected). Add the next candidate that maximizes `λ * sim(query, c) - (1-λ) * max(sim(c, s))` for already-selected `s`. Use a low `λ` (e.g. 0.3–0.5) so diversity is weighted. This keeps a single `match_candidates` call and avoids changing the RPC.

**Files:** `src/lib/agents/fitscore-agent.ts` or a shared `src/lib/embeddings/mmr.ts`.

**Implemented:** `src/lib/embeddings/mmr.ts` — `rerankBySpread()` (position-based diversity when embeddings not available); FitScore agent calls it after `findSimilarCandidates` so the shortlist is spread across the similarity-ordered list.

---

### 5. **Vector index at scale (HNSW)**

**Concept (AgentDB):** HNSW for 150× faster search in large vector sets.

**Current:** ivfflat with `lists = 100`. Docs already say: at 100k+ candidates, consider increasing `lists` (e.g. 500–1000).

**Suggestion:**

- Below ~100k candidates: keep ivfflat; optionally tune `lists` if you have growth (e.g. 200–500).
- At 100k+ or if you need lower p99 latency: add an HNSW index on `profile_embedding` (Supabase/pgvector supports HNSW). Use it for `match_candidates` and keep ivfflat for build-time if needed. Document the switch in migrations and in this audit.

---

### 6. **Where AgentDB could fit later**

- **Not required today:** Supabase + Redis already give you vector search, caching, and auth. No need to introduce AgentDB unless you have a concrete need.
- **Reasons to consider AgentDB later:**
  - **QUIC sync:** You need sub‑ms replication of vector/pattern data across multiple nodes (e.g. multi-region recruiters).
  - **ReasoningBank / pattern memory:** You want to store and retrieve “patterns” (e.g. which JD templates or question sets work best) with vector + metadata and optional learning. That could live in AgentDB while Postgres remains source of record for jobs/candidates.
- **Recommendation:** Stay on Supabase + Redis for now. Revisit AgentDB if you add multi-node sync or a dedicated pattern/reasoning store.

---

## Summary Table

| Area                | Current                         | Suggested change                                              | Status         |
| ------------------- | ------------------------------- | ------------------------------------------------------------- | -------------- |
| Distance metric     | Cosine (pgvector)               | Document in code; no change                                   | Done           |
| Hybrid search       | Vector + intent only            | Add optional location/experience params to `match_candidates` | ✅ Implemented |
| Redis               | No retry, no latency visibility | Retry once; optional DEBUG_CACHE logging                      | ✅ Implemented |
| Cache keys          | Ad-hoc prefixes                 | Key schema and TTLs in `keys.ts`                              | ✅ Implemented |
| Shortlist diversity | Top‑k by similarity only        | MMR-style spread re-rank after `findSimilarCandidates`        | ✅ Implemented |
| Vector index        | ivfflat, lists=100              | At 100k+ candidates, consider HNSW                            | Future         |
| AgentDB             | Not used                        | Optional later for QUIC sync or pattern store                 | Future         |

---

## References

- AgentDB Advanced skill: `.claude/skills/agentdb-advanced/SKILL.md`
- pgvector: `vector_cosine_ops` (cosine), ivfflat, HNSW
- Existing: `supabase/migrations/20250227130000_match_candidates_set_search_path.sql`, `src/lib/services/embeddings.ts`, `src/lib/redis/`
