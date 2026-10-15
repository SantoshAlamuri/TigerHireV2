# WhatsApp perceived latency — 48h soak checks

Use this during the post-ship soak so you are not writing SQL from scratch on day three.  
Related product notes: `docs/principles/whatsapp-inbound.md`.

## 1) Typing indicator — warn rate (logs, not Postgres)

Successful typing calls are **not** logged (by design). Failures emit structured warns:

| `message` (JSON line)            | `event_name`                     | Typical `reason` / fields                          |
| -------------------------------- | -------------------------------- | -------------------------------------------------- |
| `whatsapp_typing_indicator_warn` | `whatsapp_typing_indicator_warn` | `meta_config_missing`, `http_error`, `fetch_error` |
| `whatsapp_webhook_rate_limited`  | `whatsapp_webhook_rate_limited`  | `phone_digits_len` only (no raw phone)             |

**Vercel / log drain:** filter production JSON logs on `message` equals `whatsapp_typing_indicator_warn`.  
**Heuristic:** if warns / inbound webhooks > ~5% over 48h, suspect Meta Graph version, token/WABA mismatch, or network — see `sendTypingIndicator` JSDoc in `src/lib/services/whatsapp.ts`.

**Denominator (approximate):** use HTTP request counts for `POST /api/webhooks/whatsapp` from your edge/host metrics, or correlate with Meta webhook delivery stats — not `wa_messages` alone (rate-limited requests never reach the handler, so no row).

## 2) Lane A vs role-picker mix (Supabase SQL)

Approximates which sessions carry **campaign-style `job_id`** (Lane A CV path) vs everything else.  
`whatsapp_sessions` has **`last_message_at`**, not `updated_at` — use `last_message_at` for “active in last 48h”.

```sql
SELECT
  CASE
    WHEN context->>'job_id' IS NOT NULL AND context->>'source' = 'campaign' THEN 'lane_a'
    ELSE 'role_picker_or_other'
  END AS path,
  COUNT(*) AS sessions,
  COUNT(*) FILTER (WHERE last_message_at >= NOW() - INTERVAL '48 hours') AS last_48h_touch
FROM whatsapp_sessions
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY 1;
```

**Read:** If Lane A is **< ~10%** of recent traffic, the Lane A–only “~60 seconds” interim is **mostly cosmetic**; the bigger retention lever is likely **role-picker / post-CV copy** (see `whatsapp-inbound.md`).

## 3) Rate-limit silent drops (logs)

When the per-phone webhook rate limit trips, the route returns **200** to Meta but **does not** schedule `after()` (no typing, no `handleInboundMessage`).

**Count:** filter logs on `message` = `whatsapp_webhook_rate_limited` **or** `event_name` = `whatsapp_webhook_rate_limited` (both are set for the same line).

If volume is material over 48h, prioritise Change 3 (e.g. one-line “catching up” text instead of fully silent) — see `docs/principles/whatsapp-inbound.md`.

## Supabase MCP

To run query (2) from Cursor: Supabase MCP **`execute_sql`** with the query above (read-only). Ensure the project matches the environment you are soaking.
