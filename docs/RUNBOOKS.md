# Runbooks

Placeholder runbooks for common alerts and incidents. Expand with environment-specific details and escalation contacts.

**Production cron auth:** In production, set only `CRON_SECRET_HASH` (do not set `CRON_SECRET`) so the secret never appears in env or logs. Set `CRON_SECRET_HASH` to the SHA-256 hex digest of your cron secret. Schedulers must send the same secret in the `Authorization: Bearer` header. See env docs for how to generate the hash.

---

## Health check failing

**Symptom**: `GET /api/health` or `GET /api/health?ready=1` returns non-200 or 503.

**Checks**:

- Verify the app is deployed and the process is running (e.g. Vercel deployment status, container/process list).
- For `?ready=1`: Supabase may be unreachable or slow. Check [Supabase Status](https://status.supabase.com), project dashboard, and connection limits. Confirm `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` are set correctly.
- Review recent deployments and config changes.

**Escalation**: On-call engineer; if DB-related, escalate to platform/DB owner.

---

## Cost alert (COST_ALERT)

**Symptom**: Log message `COST_ALERT: agent run exceeded INR 50 threshold` or `COST_ALERT: daily spend exceeded INR 800`.

**Checks**:

- Query `agent_logs` (or log drain) for the time window to identify which agent and ref (job_id/candidate_id) caused the spike.
- Check for runaway or repeated agent triggers (e.g. cron misconfiguration, webhook retries).
- Review Anthropic/OpenAI usage in dashboard.

**Actions**: Disable the offending agent via `feature_flags` if needed; fix trigger (cron, webhook); notify product if expected.

**Escalation**: Engineering lead; document in incident channel.

---

## Auth / login failures

**Symptom**: Users report inability to log in or 401/403 on authenticated routes.

**Checks**:

- Confirm Supabase Auth is healthy (status page, Auth dashboard). Check for rate limiting or lockouts.
- Verify `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and cookie/session configuration. Ensure redirect URLs and site URL are correct for the environment.
- Check application logs for `Login failed` or auth-related errors; look for patterns (e.g. one provider, one region).
- If using magic link or OAuth, verify provider config and callback URLs.

**Escalation**: On-call; Supabase support if Auth service issue.
