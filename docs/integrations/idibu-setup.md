# idibu integration setup

## Who configures what

| Role              | Where                                                            | What                                                                                                                    |
| ----------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Platform ops**  | Vercel + Supabase                                                | `JOB_BOARD_CREDENTIALS_ENCRYPTION_KEY`, migrations `20260520120000_idibu_integration`, `20260603120000_job_board_idibu` |
| **Company admin** | **Company Settings → Job boards** (or Integrations → Job boards) | **Required:** App ID, App Secret, Webhook secret. **Optional:** Integration name (posting only), Default sector ID      |
| **idibu**         | idibu portal                                                     | Webhook URL + secret from TigerHire UI                                                                                  |
| **Recruiter**     | Job detail (JD base approved)                                    | Post to Job Boards iframe                                                                                               |

## Company admin steps

1. Open `/company/settings/job-boards`.
2. Configure **idibu** with **App ID**, **App Secret**, and **Webhook secret** → Save (status: Connected).
3. Expand the card and copy **Webhook URL** into idibu (Settings → Webhooks).
4. Set the same **Webhook secret** in idibu as in TigerHire.
5. **Integration name** and **Default sector ID** are optional (only needed for **Post to Job Boards** from TigerHire).

Webhook URL format:

```text
https://<app-host>/api/webhooks/idibu/<organisation-uuid>
```

## Recruiter flow

1. Approve Ideal Profile (JD base) on the job.
2. Use **Post to Job Boards** on the job page.
3. idibu uses the TigerHire **job UUID** as vacancy reference — applications must return that same reference.

## Platform env fallback (optional)

Only if `ALLOW_JOB_BOARD_GLOBAL_FALLBACK=true`:

- `IDIBU_APP_ID`, `IDIBU_APP_SECRET`, `IDIBU_INTEGRATION_NAME`, `IDIBU_WEBHOOK_SECRET`, `IDIBU_DEFAULT_SECTOR`

Prefer per-organisation Job boards UI in production.

## Smoke test

```bash
export WEBHOOK_URL="https://<host>/api/webhooks/idibu/<org-uuid>"
export WEBHOOK_SECRET="<secret from job boards>"
export JOB_ID="<open job uuid>"
./scripts/test-idibu-webhook.sh
```
