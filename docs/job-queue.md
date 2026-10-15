# Job queue (async work)

For heavy or retriable work (FitScore batch, reminder emails, webhook processing), use an async job queue instead of doing everything in the request.

## Options

| Option                        | Pros                                             | Cons                        |
| ----------------------------- | ------------------------------------------------ | --------------------------- |
| **Inngest**                   | Managed, Vercel-friendly, retries, observability | Extra service               |
| **Trigger.dev**               | Same as above, OSS option                        | Same                        |
| **Supabase pg_cron + pgmq**   | Stays inside Supabase, no new infra              | You operate queues and DLQ  |
| **Vercel background (fetch)** | No new service                                   | No retries, fire-and-forget |

## Recommendation

Use **Inngest** or **Trigger.dev** for production: both integrate with Next.js, support retries and dead-letter behaviour, and give a dashboard. Use **pg_cron + pgmq** if you want to avoid a third-party and already run Supabase.

## Usage in code

A thin abstraction lives in `src/lib/jobs/queue.ts`: you can enqueue a job by name and payload. The implementation can be wired to Inngest/Trigger.dev or to an in-process/DB queue later. Until then, the module documents the contract so route handlers can call `enqueue('fit-score-batch', { jobId })` without depending on a specific provider.
