# Uptime monitor configuration (TigerHire production)

Use this checklist when configuring Better Uptime, Pingdom, or similar. Attach a screenshot of the monitor + escalation policy to [PRE-LAUNCH-INFRA-CHECKLIST.md](./PRE-LAUNCH-INFRA-CHECKLIST.md).

## Required monitors

| Monitor          | URL / target                                      | Expected                  | Interval | Alert               |
| ---------------- | ------------------------------------------------- | ------------------------- | -------- | ------------------- |
| Homepage         | `https://tigerhire.io/`                           | HTTP 200                  | 1–5 min  | On-call email/Slack |
| Health           | `https://tigerhire.io/api/health`                 | HTTP 200, body `ok:true`  | 1–5 min  | On-call             |
| Ready health     | `https://tigerhire.io/api/health?ready=1`         | HTTP 200                  | 5 min    | On-call             |
| WhatsApp webhook | `GET https://tigerhire.io/api/webhooks/whatsapp`  | HTTP 403 or 401 (not 5xx) | 5 min    | On-call             |
| Apply API        | `GET https://tigerhire.io/api/apply/{known-slug}` | HTTP 200 or 404 (not 5xx) | 15 min   | Email               |

## Escalation policy (template)

1. **First alert:** primary on-call (email + Slack).
2. **After 15 min down:** secondary on-call.
3. **After 30 min down:** operator phone (if configured).

## Evidence to capture

- Screenshot of monitor list with URLs above.
- Screenshot of escalation policy showing contacts and delays.
- One test alert fired and acknowledged (optional).

## Automated pre-check

```bash
npm run launch:readiness:auto
# or rate limits only:
LAUNCH_BASE_URL=https://tigerhire.io node scripts/verify-rate-limits.mjs
```
