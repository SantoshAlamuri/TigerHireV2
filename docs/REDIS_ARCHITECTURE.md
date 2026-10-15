# Redis Architecture (Upstash)

## Overview

TigerHire uses **Upstash Redis** for serverless-friendly caching. Redis is optional: the app runs without it; when configured, it is used for cache and reported in the health check.

## Account setup (Upstash)

1. In [Upstash Console](https://console.upstash.com/), create a Redis database (e.g. name `tigerhire-production`, **Regional**, TLS on; pick a region such as `ap-south-1` for low latency to India).
2. Copy **REST URL** and **REST token** into env:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. Vercel: add both for the right environments. Local: put them in `.env.local`.
4. Verify: `GET /api/health?ready=1&deps=1` should report `deps.redis: true` when both vars are set.

**Code:** `src/lib/redis/client.ts`, `src/lib/redis/cache.ts`, `src/lib/redis/auth-profile-cache.ts`; readiness in `src/app/api/health/route.ts`.

## Configuration

- **Provider**: [Upstash](https://upstash.com/) (HTTP/REST client, no persistent TCP connections).
- **Env vars**:
  - `UPSTASH_REDIS_REST_URL` — REST API URL from Upstash console.
  - `UPSTASH_REDIS_REST_TOKEN` — REST API token.

If either is missing, Redis is disabled and all cache helpers no-op.

## Usage

- **Client**: `src/lib/redis/client.ts` — `getRedis()` (null if not configured), `checkRedis()` for health.
- **Cache helpers**: `src/lib/redis/cache.ts` — `cacheGet`, `cacheSet`, `cacheDel` with optional TTL (default 5 min). Best-effort; failures are silent.

## Health Check

`GET /api/health?ready=1&deps=1` includes `deps.redis: true/false` when dependency checks are requested. Redis is not required for readiness; the app is ready if the database is reachable.

## Use Cases (Launch)

- Session or auth caches (if added).
- Rate-limit counters (optional; DB-based rate limiting is already in place).
- Expensive query or API response caching.

## Documentation

- [Upstash Redis](https://upstash.com/docs/redis)
- [Next.js with Upstash Redis](https://upstash.com/docs/redis/tutorials/nextjs_with_redis)
