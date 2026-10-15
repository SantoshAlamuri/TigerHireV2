# Disaster Recovery Runbook

**Owner**: Engineering Lead  
**Last updated**: 2026-09-26
**Review cadence**: Quarterly. A new isolated restore drill is required before release sign-off.

---

## 1. Recovery Objectives

| Metric                             | Target    | Justification                                                                       |
| ---------------------------------- | --------- | ----------------------------------------------------------------------------------- |
| **RPO** (Recovery Point Objective) | < 1 hour  | Supabase PITR continuous WAL archiving provides sub-minute granularity              |
| **RTO** (Recovery Time Objective)  | < 4 hours | Single-region Vercel + Supabase; includes incident detection, decision, and restore |

---

## 2. Architecture Overview

```
Users -> Vercel Edge -> Next.js (Serverless) -> Supabase Postgres (primary)
                                              -> Upstash Redis (cache, optional)
                                              -> Anthropic / OpenAI (AI agents)
                                              -> Stripe (payments)
                                              -> Resend (email)
```

**Single points of failure**: Supabase Postgres (primary), Vercel (compute). Both are managed services with their own HA guarantees.

---

## 3. Backup Strategy

### 3.1 Database (Supabase Postgres)

- **Managed database backups**: Verify actual retention and successful backups in the production Supabase project; a document or green CI job does not prove they are enabled.
- **Point-in-Time Recovery (PITR)**: Verify provisioning and the available recovery window on the production project before relying on the RPO target.
- **Migration files**: Versioned migrations are in `supabase/migrations/`. Verify restored schema and migration history.
- **Supplemental export**: `scripts/backup-database.mjs` exports nine critical tables with pagination and exact counts, plus Storage bytes and checksums. It is not a transactional database snapshot and does not replace managed backups or a full logical dump.
- **Dedicated target**: The daily workflow requires `BACKUP_SUPABASE_URL`, `BACKUP_PROJECT_REF`, and `BACKUP_SERVICE_ROLE_KEY` secrets. These must point at the intended production backup source, not the preview credentials used for CI. It fails when missing or mismatched. Do not copy preview secrets into these names.
- **Verification**: Require `summary.json` with `complete: true`; any table or Storage failure fails the job. GitHub artifact retention is 30 days. Treat artifacts as sensitive data and restrict repository/artifact access.

### 3.2 Application Code

- **Git**: All code in GitHub. Every deployment is tied to a commit hash.
- **Vercel**: Instant rollback to any previous deployment via dashboard or CLI.

### 3.3 Blob Storage

- **Supabase Storage**: CVs in `candidate-cvs` and `resumes`, plus other attachment buckets, require separate object backups. Database backups include metadata, **not file contents** ([Supabase documentation](https://supabase.com/docs/guides/platform/backups)).
- The supplemental export downloads every enumerated bucket into `storage/` with a manifest mapping original bucket/path to local file, byte size and SHA-256. Restore bytes separately and verify checksums. Exports are sequential; concurrent updates require reconciliation against the restored database.

### 3.4 Secrets

- **Vercel Environment Variables**: Stripe keys, Supabase service role key, API keys.
- **Manual backup**: Export secrets quarterly to encrypted vault (1Password/Bitwarden team vault).

---

## 4. Disaster Scenarios and Response

### Scenario A: Database Corruption / Accidental Data Loss

**Detection**: Application errors (5xx spike), Sentry alerts, user reports.

**Response**:

1. **Assess scope**: Query affected tables. Check `agent_logs` and `failed_operations` for context.
2. **Halt writes** (if ongoing corruption): Enable maintenance mode via feature flag or Vercel environment variable.
3. **Restore via PITR**:
   - Go to Supabase Dashboard > Project > Database > Backups > Point in Time.
   - Select the target timestamp (just before corruption).
   - Use the supported restore-to-new-project workflow for a drill. Confirm the destination before any restore; do not assume an in-place restore creates a separate project.
   - Update `NEXT_PUBLIC_SUPABASE_URL` and keys in Vercel to point to the restored project.
   - Verify data integrity with spot checks on `jobs`, `candidates`, `applications`, `pipeline_candidates`.
4. **Re-apply pending migrations** if the restore point predates recent schema changes.
5. **Validate**: Run `GET /api/health?ready=1&deps=1` and verify all dependencies green.
6. **Notify users** if there was visible downtime.

**Estimated RTO**: 1-3 hours.

### Scenario B: Vercel Outage (Compute Layer Down)

**Detection**: Global 5xx or DNS failures. Check [Vercel Status](https://www.vercel-status.com/).

**Response**:

1. **Confirm**: Check Vercel status page and try from multiple regions.
2. **Wait or failover**: Vercel outages are typically resolved within minutes. For prolonged outage (>1h):
   - Build locally: `npm run build && npm start`
   - Deploy to backup (e.g., Railway, Fly.io) using Docker: `docker compose up`.
   - Update DNS to point to backup.
3. **Post-resolution**: Revert DNS, confirm Vercel deployment is healthy.

**Estimated RTO**: 15 min (Vercel self-heals) to 2 hours (manual failover).

### Scenario C: Supabase Platform Outage

**Detection**: Health check reports DB unreachable. Check [Supabase Status](https://status.supabase.com/).

**Response**:

1. **Confirm**: Check status page, try direct database connection.
2. **Short outage (<30 min)**: Circuit breakers will trip; app degrades gracefully. Feature-flagged agents will stop. Wait for recovery.
3. **Extended outage (>1h)**: Contact Supabase support. Prepare to provision a new project from PITR backup if needed.
4. **Post-resolution**: Verify all RLS policies active, run health check, clear Redis cache.

**Estimated RTO**: 30 min - 4 hours.

### Scenario D: Compromised Secrets / Security Breach

**Response**:

1. **Revoke immediately**: Rotate all affected keys (Supabase service role, Stripe, Anthropic, etc.).
2. **Audit**: Check `agent_logs` and `audit_logs` for unauthorized access patterns.
3. **Redeploy**: Push new secrets to Vercel, trigger redeploy.
4. **Notify**: If user data affected, trigger GDPR breach notification process (72-hour window).
5. **Post-mortem**: Document timeline, root cause, and remediation.

### Scenario E: Redis (Upstash) Outage

**Detection**: Health check shows `deps.redis: false`.

**Response**: Redis is optional. The app continues functioning without it. Auth profile lookups fall back to database queries. Performance may degrade but no data loss occurs. Monitor for recovery.

---

## 5. Restore Drill Procedure

Run quarterly. Document results.

### Pre-drill

- [ ] Schedule 2-hour maintenance window (or use staging project).
- [ ] Ensure team has access to Supabase dashboard and Vercel.
- [ ] Note current database row counts for verification tables.

### Drill Steps

1. [ ] In an isolated drill project, create an owned test job and upload a synthetic CV; record its object path and SHA-256.
2. [ ] Note the current timestamp.
3. [ ] Delete the test record.
4. [ ] Restore into a separate isolated project at the timestamp before deletion; never run this drill against the live production project.
5. [ ] Verify the test record exists in the restored project.
6. [ ] Verify row counts, application/job relationships and score/pipeline state match the recovery point. Restore the synthetic CV bytes separately and verify download, SHA-256 and owner access.
7. [ ] Run `GET /api/health?ready=1&deps=1` against restored project.
8. [ ] Verify RLS policies are active: attempt unauthenticated PostgREST query.
9. [ ] Tear down the drill project (or keep as staging).

### Post-drill

- [ ] Record actual RTO (time from "go" to "verified healthy").
- [ ] Document any issues encountered.
- [ ] Update this runbook with lessons learned.
- [ ] File the drill report in `docs/dr-drills/YYYY-MM-DD.md`.

---

## 6. Communication Plan

| Audience                   | Channel                  | Timing                                     |
| -------------------------- | ------------------------ | ------------------------------------------ |
| Engineering team           | Slack #incidents         | Immediately on detection                   |
| Product / leadership       | Slack #incidents + email | Within 15 min of confirmed incident        |
| Affected customers         | Status page / email      | Within 1 hour of confirmed customer impact |
| Regulatory (if PII breach) | Email to DPO             | Within 24 hours (GDPR: 72h to authority)   |

---

## 7. Escalation Matrix

| Severity  | Description                              | Response Time     | Responder                           |
| --------- | ---------------------------------------- | ----------------- | ----------------------------------- |
| **SEV-1** | Full outage or data loss                 | < 15 min          | On-call engineer + Engineering Lead |
| **SEV-2** | Partial outage, degraded service         | < 30 min          | On-call engineer                    |
| **SEV-3** | Non-critical issue, workaround available | < 4 hours         | Assigned engineer                   |
| **SEV-4** | Minor issue, no user impact              | Next business day | Backlog                             |

---

## 8. Post-Incident Process

1. **Incident channel**: Create `#incident-YYYY-MM-DD-{slug}` in Slack.
2. **Timeline**: Maintain running timeline of events and actions.
3. **Resolution**: Document root cause and fix.
4. **Post-mortem** (within 3 business days):
   - What happened?
   - What was the impact?
   - What was the root cause?
   - What went well?
   - What could be improved?
   - Action items with owners and deadlines.
5. **File** post-mortem in `docs/post-mortems/YYYY-MM-DD-{slug}.md`.
