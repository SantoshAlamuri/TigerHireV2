# Access-Audit Write Fail Policy (PII-005)

**Scope:** `src/lib/security/access-audit.ts` — `writeAccessAuditEvent` and
`writeAccessAuditBatch`, used by the unlock, signed-url, export, and DSAR
data-export routes.

## Background

Access-audit writes previously swallowed failures (and did not even inspect the
Supabase `{ error }` result), so a failed audit write was invisible while the
underlying PII access still proceeded (silent fail-open).

## Decision

| Action sensitivity | Actions                             | Behavior on audit-write failure                                                                                                                                                                                                                                                                    |
| ------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **High**           | `view_pii`, `download_cv`, `unlock` | Bounded retry (3 attempts, small backoff); on final failure log at **error** level (alertable). Default remains **fail-open** (PII access still served). Callers may opt into **fail-closed** by passing `{ failClosed: true }`, which throws `AuditWriteError` so the caller can deny the access. |
| **Other / low**    | n/a currently                       | Bounded retry; on failure log at **warn** level; fail-open.                                                                                                                                                                                                                                        |

### Why fail-open by default (during beta)

Flipping high-sensitivity routes to fail-closed means a transient
`access_audit_log` outage would block legitimate candidate unlocks, resume
downloads, and DSAR exports for all users. During beta that availability cost
outweighs the gap of a small number of unrecorded access events, **provided the
failure is loud**. The change therefore guarantees:

1. Insert failures are now actually detected (the `{ error }` result is checked).
2. High-sensitivity failures are escalated to error-level logs for alerting.
3. Writes are retried before being declared failed.
4. A `failClosed` opt-in exists so individual routes can tighten when warranted.

### Consistency

All audited routes share these two helpers, so the retry + detection + alerting
behavior is uniform. `failClosed` is currently left off everywhere (fail-open)
for the reason above; revisit per-route before GA.

## Follow-up (deferred)

- Durable queue / DLQ for failed high-sensitivity audit rows to _guarantee_
  eventual recording across process death (in-request retry does not).
- Re-evaluate enabling `failClosed` on `download_cv` / `unlock` at GA once
  `access_audit_log` availability is proven.
