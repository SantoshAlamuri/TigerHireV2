# ADR 001: Supabase + Next.js for backend and auth

## Status

Accepted.

## Context

We need a backend that supports auth, relational data, real-time optional, and file storage with minimal ops. Options included: custom Node + Postgres, Firebase, Supabase, Hasura.

## Decision

Use **Supabase** for Postgres, Auth, Storage, and RLS. Use **Next.js** App Router for the frontend and API routes (serverless). API routes call Supabase via the JS client and service-role for admin operations.

## Consequences

- Single vendor for DB + Auth + Storage; RLS enforces tenant isolation at the DB layer.
- Next.js API routes are serverless (Vercel); we add timeouts, retries, and circuit breakers for external calls.
- Migrations are versioned SQL files in `supabase/schema/`; apply in order. No automatic down-migrations.
- Background work (embeddings, scoring, notifications) is currently fire-and-forget with DLQ; a proper job queue (Inngest/Trigger.dev) is planned for Phase 3.
