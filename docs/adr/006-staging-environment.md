# ADR 006: Staging environment

## Status

Accepted.

## Context

We need a non-production environment to test migrations, releases, and integrations (Stripe test mode, Supabase staging project) without affecting production.

## Decision

- Maintain a **staging** environment that mirrors production: separate Vercel project (or Preview branch) and separate Supabase project (or Supabase Branching for PRs).
- Use staging-only env vars: Stripe test keys, Resend (optional), Supabase staging URL. Never point staging at production DB or production Stripe.
- Run migrations on staging first; after verification, apply the same migrations to production. See [staging.md](../staging.md) for the checklist.

## Consequences

- Safer releases; staging catches migration and config issues.
- Requires maintaining two Supabase projects (or using Branching) and staging env config in Vercel.
