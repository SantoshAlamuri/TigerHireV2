# ADR 002: Multi-tenancy via organisation_id

## Status

Accepted.

## Context

Recruiters and hiring managers must see only their organisation’s jobs, candidates, and applications. We need a clear tenant boundary.

## Decision

- **Tenant key**: `organisation_id` on `profiles`. Every org-scoped resource (jobs, applications, unlocks, etc.) has `organisation_id`.
- **Auth**: Supabase Auth for identity; `profiles` holds `role` and `organisation_id`. API routes use `getAuthContext()` and `requireRole(..., resourceOrganisationId)` so that non–super_admin users can only access resources belonging to their org.
- **RLS**: Row-level security policies in Supabase enforce that users only read/write rows where `organisation_id` matches their profile (or they are super_admin).

## Consequences

- All list/mutation APIs must pass organisation context and validate it against the resource.
- Super_admin can cross orgs for support and analytics.
- Adding a new org-scoped table requires RLS policies and API checks.
