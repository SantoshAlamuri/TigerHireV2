# Inngest deploy & sync runbook

How TigerHire's background jobs (Inngest) relate to deploys, what breaks when
sync is skipped, and how to fix it. Written after the 2026-07-06 incident where
a customer's requisition approval fired `requisition/generate-jd` before
Inngest Cloud knew the function existed — the event was silently dropped and
the requisition sat at `approved` with no JD.

## Architecture in 60 seconds

- Functions are defined in `src/inngest/functions.ts` and served from
  `src/app/api/inngest/route.ts` (client id `tigerhire`).
- App code enqueues via `enqueue()` in `src/lib/jobs/queue.ts`. It sends the
  event to Inngest Cloud when `INNGEST_EVENT_KEY` is set and is a **silent
  no-op** when it is not (dev without keys). Some hot paths (fit score,
  requisition JD) have an inline/`after()` fallback for the no-key case.
- `INNGEST_SIGNING_KEY` authenticates Inngest Cloud → `/api/inngest`
  invocations and the sync handshake. Prod has both keys.
- CI runs `npm run check:inngest-registration` — catches a function exported
  from `functions.ts` but missing from `route.ts`. It does **not** catch
  Inngest Cloud being out of sync with the deployed app.

## The failure mode this runbook exists for

Inngest Cloud only invokes functions it knows about. Knowing happens at
**sync** time, not deploy time. If a deploy adds or renames a function and no
sync happens, events for it are dropped with no error anywhere in our logs.

Symptoms: an `enqueue()` succeeds, nothing runs, no failure in Vercel or
Supabase logs. For `requisition/generate-jd` specifically: a requisition stuck
at `approved` with `assigned_job_id IS NULL`.

## Manual sync (fix it right now)

```bash
# Inspect what the live deployment serves (function_count, key presence):
curl -s https://tigerhire.io/api/inngest

# Register the live deployment's functions with Inngest Cloud:
curl -s -X PUT https://tigerhire.io/api/inngest
# → {"message":"Successfully registered","modified":true}
```

`modified: false` means Inngest already knew this exact function set — also
fine. Note (verified 2026-07-06): the PUT works unauthenticated from outside,
so Vercel Deployment Protection is not currently blocking sync on the
canonical domain. If protection is ever enabled for tigerhire.io, add a
Protection Bypass for Automation secret and configure it in the Inngest
Vercel integration settings.

Sync only fixes **future** events. Events dropped before the sync must be
replayed: app.inngest.com → Events → find the event → Replay.

## Permanent fix: Vercel integration (preferred) + CI fallback

1. **Vercel Marketplace → Inngest** → connect the tigerhire project. This
   auto-syncs on every deploy.
   - The integration wants to manage `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`;
     prod already has them — let it adopt, don't duplicate.
   - Scope `INNGEST_SERVE_ORIGIN=https://tigerhire.io` to **Production only**.
     Preview and Development must not inherit the production origin: let the SDK
     discover the deployed preview URL. An all-environment override registers
     preview functions at the production endpoint and can produce `account_mismatch`.
   - Verify: Inngest dashboard → Apps → tigerhire → "Last synced" updates on
     the next `main` deploy.
2. **CI fallback**: `.github/workflows/inngest-sync.yml` waits for the Vercel
   deployment of each `main` push to report success, then PUTs
   `https://tigerhire.io/api/inngest`. Harmless double-sync when the Vercel
   integration is also installed (the operation is idempotent).

## Checklist when adding a new Inngest function

1. Define it in `src/inngest/functions.ts`; register in
   `src/app/api/inngest/route.ts` (CI enforces this pair).
2. Add the `JobName` + event mapping in `src/lib/jobs/queue.ts` if app code
   enqueues it.
3. Decide the no-Inngest fallback: is a silent no-op acceptable in dev, or
   does the caller need an inline/`after()` fallback like
   `/api/applications` and the requisition JD path?
4. After the prod deploy, confirm the function appears in the Inngest
   dashboard (or check `function_count` via the GET above). If you deployed
   before the auto-sync was in place, run the manual PUT.

## September 2026 verification

- Production app `tigerhire` has 29 registered functions. The inspected September 26 runs show completed interview follow-ups, WhatsApp reconciliation and deadline reminders. No new production event was sent for this check.
- The `dev` branch environment `dev-ff62b755` showed `account_mismatch`, no runs in the inspected day, and the production callback URL.
- Vercel confirmed `INNGEST_SERVE_ORIGIN=https://tigerhire.io` was scoped to all environments. It was changed to Production only; production's value was preserved. A new preview deployment is required for the change to take effect.
- After the new deployment, verify that the branch app URL is the preview deployment URL and sync succeeds. If an account mismatch remains, compare the integration-owned environment/key mapping without disabling signature authentication or copying production keys into preview.
