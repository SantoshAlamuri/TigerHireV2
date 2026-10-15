# ADR 005: Idempotency keys for payments and apply

## Status

Accepted.

## Context

Duplicate requests (retries, double-clicks, or network replays) can cause duplicate charges (Stripe checkout) or duplicate applications. We need a way to treat repeated requests with the same client-provided key as one logical request and return the same response.

## Decision

- Add a table `idempotency_keys` storing `(key_hash, endpoint, response_status, response_body)`. The key is hashed (SHA-256) for storage; the client sends `Idempotency-Key: <uuid or string>`.
- Use a helper `withIdempotency(request, endpoint, handler)` that: if no key, run handler; if key present, look up stored response and return it when found; otherwise run handler, store response, return it. On unique violation (concurrent duplicate), re-fetch and return stored response.
- Apply to **POST /api/billing/checkout** and **POST /api/apply**. Client should send a unique `Idempotency-Key` (e.g. UUID) per logical operation; retries use the same key.

## Consequences

- Duplicate checkout or apply requests with the same key return the first response without re-running the mutation.
- Keys are stored indefinitely unless we add TTL cleanup (e.g. delete rows older than 24h); optional follow-up.
- Frontend should generate and send `Idempotency-Key` for checkout and apply flows.
