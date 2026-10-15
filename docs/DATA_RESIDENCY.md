# Data residency and multi-region preparation

## Current state

- Application and database are single-region (e.g. Vercel + Supabase in one region).
- No geographic replication or data residency guarantees beyond provider defaults.

## Multi-region preparation (Phase 4)

1. **Document requirements**: Capture which customers need data in specific regions (e.g. EU, India) and any regulatory constraints (GDPR, local labour laws).
2. **Supabase**: Evaluate Supabase multi-region or read replicas; or separate projects per region with sync/aggregation.
3. **Vercel**: Use Edge Config for feature flags and routing; consider Vercel regions for static and API routes.
4. **Auth and sessions**: Ensure session and profile data can be scoped by region or replicated with acceptable latency.
5. **Rollout**: Prefer read replicas and edge caching first; full active-active multi-region is a later step.

## Data residency checklist

- [ ] List regulated jurisdictions (EU, India, etc.).
- [ ] Define “primary” region per tenant or global primary + replicas.
- [ ] Plan backup and restore per region.
- [ ] Document data flow (where PII is stored and processed).
