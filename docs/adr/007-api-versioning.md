# ADR 007: API versioning strategy

## Status

Accepted.

## Context

We have many REST endpoints under `/api/` with no version. When we need to make breaking changes, we must avoid disrupting existing clients.

## Decision

- Use **URL prefix versioning** (`/api/v1/...`) when we introduce a breaking change. See [API_VERSIONING_STRATEGY.md](../API_VERSIONING_STRATEGY.md) for the full migration plan.
- Do **not** add a version prefix until we have a concrete breaking change; current routes remain unversioned. When we do: create `/api/v1/*` routes (proxy or move handlers), keep or redirect old paths with deprecation headers, then migrate clients.
- Prefer backward-compatible changes (new optional fields, deprecation notices) over a new version when possible.

## Consequences

- Clear path for future breaking changes without blocking current development.
- When the time comes, frontend and any external consumers will need to switch to `/api/v1/` for the new contract.
