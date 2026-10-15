# Integration go-live runbooks — Recall.ai, Bolna, SpringVerify BGV, WhatsApp templates

Contract verification date: **2026-07-09** (checked against docs.recall.ai for our workspace's API
version, bolna.ai/docs, and SpringVerify India public API docs). Code lives in:

- Recall: `src/lib/integrations/notetaker/recall.ts`, `src/app/api/webhooks/recall/route.ts`, `src/lib/interviews/notetaker-dispatch.ts`
- Bolna: `src/lib/screening/voice/bolna.ts`, `src/app/api/screening/voice/webhook/route.ts`
- SpringVerify: `src/lib/integrations/springverify/client.ts` + `workflow.ts`, `src/app/api/webhooks/springverify/route.ts`, `src/app/api/integrations/springverify/initiate/route.ts`
- WhatsApp templates: `src/lib/services/whatsapp.ts`, `src/lib/whatsapp/*`, `scripts/create-whatsapp-templates.ts`, `scripts/submit-whatsapp-templates-v2.mjs`

---

## 1. Recall.ai AI notetaker

### Our side — done

- **Create Bot** `POST {RECALL_BASE_URL}/api/v1/bot/` (trailing slash required) with
  `meeting_url`, `bot_name`, `join_at`, `metadata` (carries `recording_id` for webhook
  correlation), `recording_config.transcript.provider.meeting_captions` (platform captions —
  free, no transcription surcharge) and `automatic_leave` COGS guardrails
  (5 min waiting-room / no-one-joined, 10 min not-recording, `RECALL_MAX_RECORDING_MINUTES`
  cap, default 90).
- **Webhook** `/api/webhooks/recall` handles Svix-delivered bot status events
  (`bot.joining_call`, `bot.in_call_recording`, `bot.call_ended`, `bot.done`, `bot.fatal`, …);
  payload parsed from `data.data.code` / `data.bot.id` / `data.bot.metadata.recording_id`.
  Only `bot.done` is treated as media-ready (per docs `bot.call_ended` is not). Idempotent via
  `webhook_event_try_acquire` keyed on the Svix message id.
- **Signature verification**: Svix scheme (HMAC-SHA256 of `id.timestamp.body` with the base64
  part of `whsec_…`), accepting both `svix-*` and `webhook-*` header aliases (workspaces created
  after 2025-12-15 use a workspace verification secret with `webhook-*` headers).
- **Artifacts**: `GET /api/v1/bot/{id}/` → transcript from
  `recordings[0].media_shortcuts.transcript.data.download_url` (the legacy
  `/bot/{id}/transcript` endpoint no longer exists), video from
  `media_shortcuts.video_mixed.data.download_url`, duration from the recording's
  `started_at`/`completed_at`. Transcript text is persisted to Supabase storage
  (`screening-audio/interview-transcripts/{org}/{recording}.txt`) — the Recall download URLs are
  pre-signed and expire, so the stored `recording_url` is best-effort.
- Env on Vercel prod: `RECALL_API_KEY`, `RECALL_BASE_URL=https://us-west-2.recall.ai`,
  `RECALL_WEBHOOK_SECRET`. DB migration + `interview_recordings` table live on prod.
- Dispatch is gated by global flag `notetaker_recall` (currently **OFF**), per-org
  `organisations.notetaker_enabled`, presence of `meeting_url` on the slot, and a monthly INR
  cap (`notetaker_monthly_cap_inr`, converted at `USD_TO_INR_RATE`, default 85).

### Operator must do (one-time)

1. **Repoint the webhook** in the Recall dashboard
   (us-west-2 → Webhooks: `https://us-west-2.recall.ai/dashboard/webhooks/`) to
   `https://tigerhire.io/api/webhooks/recall`. It currently points at a stale June-25 branch
   preview URL. Subscribe to bot status change events.
2. **Sync the signing secret**: after editing/re-creating the endpoint, copy its signing secret
   (`whsec_…`) — or the workspace verification secret from Developers → API Keys — into
   `RECALL_WEBHOOK_SECRET` on Vercel prod and redeploy if it changed.
3. In the dashboard, enable **webhook failure email alerts** (endpoint is auto-disabled after
   5 days of failures).
4. Flip the `notetaker_recall` flag ON in `/admin/feature-flags` when ready.
5. Optional tuning: `RECALL_MAX_RECORDING_MINUTES` (default 90),
   `RECALL_INTERNAL_COST_USD_PER_HOUR` (default 0.50).

### Customer org must do (per-org / ongoing)

- Ask us to set `organisations.notetaker_enabled = true` (and optionally
  `notetaker_monthly_cap_inr`) for their org.
- Interview slots must carry a real meeting link (Google Meet / Zoom / Teams).
- The meeting host must **admit the bot** from the lobby (it leaves after 5 min if stuck) and
  have **platform captions enabled** — meeting-caption transcription depends on host/org
  settings (Zoom: "Automated captions" on; Teams: live captions allowed; Meet: on by default).
  If captions are disabled the recording succeeds but the transcript is empty.
- Tell interviewers the bot will join, and disclose recording to candidates (see compliance).

### First smoke test

1. Enable `notetaker_recall` + `notetaker_enabled` for an internal test org.
2. Book an interview slot with a real Google Meet link ~5 min out; confirm an
   `interview_recordings` row appears with `status=queued` → `joining`.
3. Join the meeting, admit the bot, speak a few exchanges with captions on, end the call.
4. Within a few minutes the `bot.done` webhook should land: row goes `done`, transcript file in
   the `screening-audio` bucket, `summary_json` populated (Claude scorecard), `cost_usd` set.
5. Cross-check in the Recall dashboard: bot page → "View Webhooks" shows deliveries with 2xx.
6. Failure drill: end a meeting without admitting the bot → expect `no_show` within ~5 min.

### Costs & compliance notes

- **Cost**: Recall Pay-as-you-go ≈ **$0.50 per recording-hour**, prorated; meeting-caption
  transcription is free (we deliberately avoid the ~$0.15/hr AI-transcription surcharge).
  Guardrails: automatic-leave timeouts, 90-min recording cap, per-org monthly INR cap.
- **DPDP (India)**: an interview recording is personal data of the candidate _and_ interviewers.
  Obtain notice + consent before the bot joins — recommended: a disclosure line in the interview
  invite email/calendar entry, plus the bot's visible name ("TigerHire Notetaker") in the call.
  Recall processes/stores media in the US (us-west-2) — cover cross-border transfer in the
  privacy notice. Recall media auto-expires (see `expires_at` on recordings; Delete Bot Media
  API available for erasure requests); our durable copies (transcript, summary) live in Supabase
  Mumbai and are covered by candidate-deletion flows.

---

## 2. Bolna voice screening

### Our side — done

- **Start call** `POST https://api.bolna.ai/call` (Bearer auth) with the documented contract:
  `agent_id`, `recipient_phone_number`, optional `from_phone_number`, and `user_data` carrying
  our dynamic variables (`webhook_correlation_id`, `candidate_name`, `company_name`,
  `role_title`, `req_location`, `screening_system_prompt`, `screening_fallback_questions`,
  `screening_max_duration_seconds`, `script_version`). Undocumented top-level fields
  (`metadata`, `context`, bare `webhook_correlation_id`) were removed. Response `execution_id`
  is stored as `bolna_call_id`.
- **Artifacts** `GET https://api.bolna.ai/executions/{execution_id}` — reads documented fields:
  `transcript`, `conversation_duration` (float seconds) / `telephony_data.duration`,
  `telephony_data.recording_url`, `status`. `busy` and `no-answer` map to `no_answer`.
- **Webhook** `/api/screening/voice/webhook`: Bolna fires it on _every_ status transition with
  an execution-shaped payload; in-flight statuses (`scheduled`, `queued`, `rescheduled`,
  `initiated`, `ringing`, `in-progress`, `call-disconnected`) are acknowledged without touching
  the screening job. Terminal: `completed` → fetch artifacts, persist audio + transcript to the
  `screening-audio` bucket, Claude summary + recommendation, `cost_inr`; `no-answer`/`busy` →
  `no_response`; everything else (`failed`, `canceled`, `stopped`, `error`, `balance-low`) →
  `failed`. Correlation id is read from `context_details` (where `user_data` comes back) with
  legacy fallbacks. Idempotent via `webhook_event_try_acquire`.
- **Webhook auth**: Bolna does **not** sign webhooks (their guidance is IP allowlisting only),
  so production auth is a shared secret in the webhook URL query string
  (`?secret=<BOLNA_WEBHOOK_SECRET>`); an HMAC check stays first in case Bolna ships signatures.
- Hard kill switch: `initiateBolnaCall` refuses to dial unless the `voice_screening_bolna`
  feature flag is ON for the org (flag is seeded **OFF** on both DBs).
- Env on Vercel prod: `BOLNA_API_KEY`, `BOLNA_AGENT_ID`, `BOLNA_WEBHOOK_SECRET`.

### Operator must do (one-time)

1. **Set `BOLNA_FROM_PHONE_NUMBER` on Vercel prod** (currently missing; the client throws in
   production without it). Must be E.164 (e.g. `+91…`) and must be a number purchased in /
   connected to the Bolna account.
2. In the Bolna Playground → agent → **Analytics tab**, set the webhook URL to
   `https://tigerhire.io/api/screening/voice/webhook?secret=<BOLNA_WEBHOOK_SECRET>`
   (same value as the Vercel env var).
3. Verify the Bolna agent's prompt references the variables we send via `user_data`
   (`{candidate_name}`, `{company_name}`, `{role_title}`, `{req_location}`,
   `{screening_system_prompt}`, …) so they are injected into the conversation.
4. Optional hardening: allowlist Bolna's webhook egress IP `13.203.39.153` at the edge.
5. Keep the Bolna account balance topped up (calls fail with `balance-low` otherwise).
6. Flip `voice_screening_bolna` ON in `/admin/feature-flags` when ready.
7. Optional tuning: `BOLNA_INTERNAL_COST_INR_PER_MINUTE` (default 6).

### Customer org must do (per-org / ongoing)

- Candidate phone numbers must be reachable and stored with country code (E.164). Indian
  numbers are the primary path.
- Candidates should be told (e.g. in the application/WhatsApp flow) that an automated screening
  call will follow — improves pickup rate and satisfies consent expectations.
- Screening questions / script are configured per job by the recruiter; voice mode must be
  selected on the screening job.

### First smoke test

1. Enable `voice_screening_bolna` for an internal test org only.
2. Trigger a voice screening against your own phone number; confirm a `screening_jobs` row in
   `mode=voice` with `bolna_call_id` set after dispatch.
3. Answer the call, complete the conversation, hang up.
4. Watch webhook deliveries: in-flight transitions should return `{status: "in_flight"}` (job
   untouched), then the `completed` event should persist transcript + audio in the
   `screening-audio` bucket and set `summary_json`, `recommendation`, `cost_inr`,
   `completed_at`.
5. Negative auth test: POST to the webhook URL **without** `?secret=` — expect 401.
6. No-answer drill: trigger a screening to a phone you don't answer — job should end
   `no_response`, not `failed`.

### Costs & compliance notes

- **Cost**: Bolna bills per conversation minute (see `cost_breakdown` / `total_cost` on the
  execution). We record an internal estimate of ₹6/min (`BOLNA_INTERNAL_COST_INR_PER_MINUTE`)
  into `screening_jobs.cost_inr`. Max call duration is capped by the script
  (`max_duration_seconds`, default 360s).
- **DPDP (India)**: the call audio + transcript are candidate personal data. The agent script
  must disclose at the start of the call that it is an AI assistant and that the call is
  recorded for hiring purposes, and give the candidate an easy out. Recordings are fetched from
  Bolna's storage (S3, US) and copied into Supabase Mumbai — cover the cross-border hop in the
  privacy notice; include voice recordings in candidate-deletion/erasure flows.
- **Telecom hygiene**: keep Bolna's calling-time guardrails ON (do not send
  `bypass_call_guardrails`), only dial candidates who applied/opted in (TRAI unsolicited
  commercial communication rules), and honour "do not call me again" requests by marking the
  candidate accordingly.

---

## 3. SpringVerify BGV (India / SpringRole)

**Docs are public** (verified 2026-07-09). Two generations exist:

- **Current ("external/v1")** — support.springworks.in KB article "SpringVerify India - APIs
  Documentation" + Postman collection `documenter.getpostman.com/view/3927563/2s8YswRX6z`.
  Base URLs: prod `https://api-sa.in.springverify.com`, stage
  `https://api-acceptance-2-sa.in.springverify.com`. **Our client targets this one.**
- Legacy ("/v1") — `springverify-india.readthedocs.io` (`api.in.springverify.com/v1/candidate`,
  per-check document upload endpoints). Do not use unless onboarding says otherwise.

### Verified contract (what our client now sends)

- **Create case**: `POST {base}/external/v1/candidate/add`
- **Auth**: `Authorization: Bearer <token>` — token generated in the SpringVerify dashboard
  (Profile → Settings → API → "Generate token"; has a name + expiry).
- **Body** (built in `buildSpringVerifyCreateCaseBody`):

  ```json
  {
    "candidate": {
      "name": "…",
      "email": "…",
      "phone": "…",
      "meta_data": {
        "external_reference": "tigerhire:application:<applicationId>",
        "application_id": "<applicationId>",
        "organisation_id": "…",
        "initiated_by": "…",
        "source": "api|offer_accept"
      }
    },
    "package": { "package_id": 16, "subtype_id": 22, "config": {} }
  }
  ```

  `meta_data` is a documented free-form correlation object (Postman example uses
  `meta_data.uuid`). The `package` block is included only when `SPRINGVERIFY_PACKAGE_ID` +
  `SPRINGVERIFY_SUBTYPE_ID` are both set; IDs are account-specific — fetch via
  `GET {base}/external/v1/candidate/packages`.

- **Read-side** (not yet wired; available for polling if webhooks disappoint):
  `GET {base}/external/v1/candidate/details?candidate_id=…&include_check_status=0|1` and
  `GET {base}/external/v1/candidate/report/pdf?candidate_id=…`.
- Old **assumed** flat payload (`name/email/phone/external_id/meta` at top level) was wrong and
  has been replaced (2026-07-09).

### Our side — done

- Create-case client with documented payload + Bearer auth; refuses to run unconfigured
  (`not_configured` → HTTP 400 at the initiate route, not 502).
- Workflow (`initiateSpringVerifyForApplication`): org-boundary check, candidate email required,
  `BGV_INITIATED` / `BGV_INITIATE_FAILED` audit events on the latest offer (SpringVerify's raw
  response — including any candidate id — is stored in the audit metadata).
- Webhook `POST /api/webhooks/springverify`: returns 501 until `SPRINGVERIFY_WEBHOOK_SECRET` is
  set; constant-time secret check against `x-tigerhire-webhook-secret`, `x-webhook-secret`, or
  `Authorization: Bearer`; tolerant extractors pull `applicationId` from `meta_data`
  (root / `candidate` / `data`, via `application_id` or the `tigerhire:application:` external
  reference) plus legacy key guesses, and a status string from
  `status/case_status/check_status/verification_status/result/decision`; logs + records
  `BGV_WEBHOOK_RECEIVED` audit event when it can correlate.
- Unit tests: `tests/unit/springverify-{client,workflow,webhook-route,credentials}.test.ts`.
- **Per-org credentials (BYO account, 2026-07-10)**: each organisation can connect its own
  SpringVerify account under Company Settings → Integrations → "Background verification
  (SpringVerify)" (API token, create-case URL, optional package/subtype IDs + webhook secret).
  Stored in `integration_connections` (scope=organisation, provider=springverify): token behind
  `secret_ref` (Vault or AES-256-GCM fallback), webhook secret encrypted in
  `config.webhook_secret_enc`. Resolution (`getSpringVerifyCredentials` in
  `src/lib/integrations/springverify/credentials.ts`): org connection first, `SPRINGVERIFY_*`
  env vars only as platform fallback for testing. The webhook maps the inbound case → org via
  `meta_data.application_id` → application → organisation and verifies against that org's
  webhook secret, still accepting the env secret as fallback.

### Operator must do (one-time)

1. Sign the SpringVerify contract / get workspace access (no self-serve signup for API use).
2. Generate an API token (dashboard → Profile → Settings → API → Generate token). Note the
   **expiry** you set — diarise rotation.
3. `GET https://api-sa.in.springverify.com/external/v1/candidate/packages` with the token; pick
   the package/subtype that matches the purchased BGV bundle.
4. Set Vercel prod env (all currently unset):
   - `SPRINGVERIFY_CREATE_CASE_URL=https://api-sa.in.springverify.com/external/v1/candidate/add`
   - `SPRINGVERIFY_API_KEY=<dashboard token>`
   - `SPRINGVERIFY_PACKAGE_ID` / `SPRINGVERIFY_SUBTYPE_ID` (from step 3)
   - `SPRINGVERIFY_WEBHOOK_SECRET=<random 32+ chars>` (only once webhook delivery is agreed —
     see vendor questions; the route 501s until set, which is fine)
5. **Ask SpringVerify onboarding** (webhooks are NOT in the public docs):
   - Do you push status webhooks? If yes: how do we register our URL
     (`https://tigerhire.io/api/webhooks/springverify`), and can you attach a static header
     (`x-tigerhire-webhook-secret: <secret>`) or do you sign payloads (HMAC? which header)?
     If neither, we front it with a proxy that injects the header, or fall back to polling
     `candidate/details`.
   - Exact webhook payload schema — in particular: is `candidate.meta_data` (our correlation
     object) echoed back? What id field references the candidate (`candidate_id`?)
   - The **status enum** for candidate + per-check status (`check_status` values, e.g.
     in-progress / insufficiency / clear / discrepancy — exact strings needed; we lowercase and
     store whatever arrives).
   - Is the `package` block mandatory on `candidate/add`, and what does `config: {}` accept?
   - Consent flow: with `invite: false`-style API adds, who collects candidate consent — do we
     need `is_consent_undertaking_letter: true` or a consent-doc upload?
   - Whether `resume`, `employee_id`, `uan_number`, `tags`, `category_id` are required for our
     package; current client omits them.
   - Rate limits + IP allowlisting requirements, and stage-environment credentials for testing.
6. After answers: adjust `extractApplicationIdFromSpringVerifyPayload` /
   `extractSpringVerifyStatus` key lists if the real webhook shape differs (they are
   deliberately tolerant, so most shapes already land).

### Customer org must do

- Nothing to configure. Candidates must have an **email** on file (initiation hard-fails with
  `candidate_email_missing` otherwise); phone is passed when present.
- BGV is triggered from the offer flow (`source: offer_accept`) or explicitly via
  `POST /api/integrations/springverify/initiate` (recruiter, org-scoped).
- Ensure offer/consent language covers a third-party background check (DPDP: SpringVerify is a
  processor; candidate notice should name background verification as a purpose).

### Smoke test (stage first, then prod)

1. Point `SPRINGVERIFY_CREATE_CASE_URL` at the **stage** base
   (`https://api-acceptance-2-sa.in.springverify.com/external/v1/candidate/add`) in a preview
   env with a stage token; initiate for a test application; expect HTTP 2xx and a
   `BGV_INITIATED` audit row whose metadata contains SpringVerify's response (save the returned
   candidate id).
2. Verify the candidate appears in the SpringVerify stage dashboard with the right package.
3. Webhook drill (works even before SpringVerify wiring): `curl -X POST
https://<preview>/api/webhooks/springverify -H 'x-tigerhire-webhook-secret: <secret>'
-H 'content-type: application/json' -d '{"candidate":{"meta_data":{"application_id":"<appId>"},"status":"CLEAR"}}'`
   → 200 with `applicationId` echoed and a `BGV_WEBHOOK_RECEIVED` audit event; repeat with a bad
   secret → 401; unset secret → 501.
4. Flip env to prod base URL + prod token; re-run step 1 against a real (internal) application.

---

## 4. Meta WhatsApp templates — submission inventory

Meta only delivers **approved** templates; an unapproved name fails at send time (error 132001)
and, where wired, we fall back (e.g. `th_screening_invite` → `th_application_received`, which is
why the prescreen invite currently arrives with generic copy). Template approval is an
**operator manual step** in Meta Business Manager / via Graph API — code cannot self-approve.

### Ground truth first

`whatsapp_template_status` (prod DB) only tracks templates submitted since the webhook landed —
today it holds a single row: `th_shortlist_screening` (APPROVED, and currently **unused by
code**). The real WABA state must be pulled from Meta:

```bash
node scripts/audit-whatsapp-templates.mjs   # needs WHATSAPP_ACCESS_TOKEN + WABA/PHONE id in .env.local
```

Run this before submitting anything — several names below may already exist as
APPROVED/REJECTED on the WABA (known: `th_application_received`, `th_shortlisted`,
`tigerhire_consent_v2` deliver in prod; `th_screening_invite` is missing — 1 failed send
observed 2026-07; the pre-v6 `th_job_match_result`-era names were REJECTED for INVALID_FORMAT,
hence the `_v6` names).

### How to submit

- Bulk (preferred): `node --env-file=.env.local scripts/submit-whatsapp-templates-v2.mjs
[--only <name>] [--dry-run]` (18 curated templates incl. `th_screening_invite`), and
  `npm run create:templates` (`scripts/create-whatsapp-templates.ts`, the wider v1 set).
- Single, from prod env: `POST /api/admin/whatsapp-templates` (platform admin; defaults to
  `th_screening_invite`).
- Manually: WhatsApp Manager → Message templates → Create (copy bodies below **exactly**;
  variable order must match — it is the order of `bodyParams` in code).
- Approval status flows back via the `message_template_status_update` webhook into
  `whatsapp_template_status`; typical review time is 1–3 hours (up to 3 business days).

### Submission table — templates with LIVE senders (submit all that the audit shows missing)

All language `en` unless noted. Category = what we gate on in
`src/lib/whatsapp/template-categories.ts` (MARKETING is blocked to cold numbers until consent).

| Template                          | Cat.                     | Vars           | Body (exact)                                                                                                                                                                                                                                                         | Known prod status                                       | Sender                                                                                                                                                        |
| --------------------------------- | ------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `th_application_received`         | UTILITY                  | 3              | Hi {{1}}, your application for {{2}} at {{3}} has been received. We will review your profile and get back to you shortly.                                                                                                                                            | **WORKS**                                               | apply ack; prescreen invite fallback; referral first contact                                                                                                  |
| `th_shortlisted`                  | UTILITY                  | 3              | Hi {{1}}, congratulations! You have been shortlisted for the {{2}} position at {{3}}. Our team will share next steps with you shortly. Reply here if you have any questions.                                                                                         | **WORKS**                                               | shortlist notify; post-shortlist prescreen invite; re-nudge                                                                                                   |
| `tigerhire_consent_v2`            | MARKETING                | 1              | Hi! I'm TigerHire — I match your CV against live roles in minutes. I need a quick consent first so I can process your CV and share matches on WhatsApp. {{1}} Reply YES to continue or NO to opt out. Privacy: https://tigerhire.io/privacy                          | **APPROVED**                                            | consent request (CV drop / referred)                                                                                                                          |
| `th_screening_invite`             | UTILITY                  | 2              | Hi {{1}}, {{2}} would like to ask a few quick screening questions to match you with the right role. Reply YES to start or NO to skip.                                                                                                                                | **MISSING — submit**                                    | plan pilot screening invite (falls back to `th_application_received`)                                                                                         |
| `th_referrer_offer_update`        | UTILITY                  | 4              | Hi, great news — {{1}} has received an offer for {{2}} at {{3}}. Your referral bonus of {{4}} is pending confirmation.                                                                                                                                               | **MISSING — submit**                                    | `referrer-notifications.ts` (offer)                                                                                                                           |
| `th_referrer_rejection_update`    | UTILITY                  | 2              | Hi, an update on your referral — {{1}} was not selected for the {{2}} role this time. Thank you for referring.                                                                                                                                                       | **MISSING — submit**                                    | `referrer-notifications.ts` (rejection)                                                                                                                       |
| `th_not_selected`                 | UTILITY                  | 3              | Hi {{1}}, thank you for your interest in the {{2}} role at {{3}}. After careful review, the team has decided to move forward with other candidates at this time. We will keep your profile active for future roles that match your skills.                           | verify                                                  | reject notify; screening review                                                                                                                               |
| `th_offer`                        | UTILITY                  | 3              | Hi {{1}}, exciting news! {{2}} is extending an offer for the {{3}} position. Offer details have been sent to your email. Feel free to reply here with any questions.                                                                                                 | verify                                                  | offer notify                                                                                                                                                  |
| `screening_questions_v6`          | UTILITY                  | 2 + URL button | Hi {{1}}, please complete your screening questions for {{2}} on TigerHire. Tap the button below to open the form. We will message you here when it is done. — Button: URL `https://tigerhire.io/{{1}}`                                                               | verify                                                  | screening link (primary; legacy `screening_questions` via `WHATSAPP_SCREENING_TEMPLATE_NAME`)                                                                 |
| `th_job_match_result_v6`          | UTILITY                  | 5              | Hi {{1}}, we scored your profile against a role on TigerHire. The position is {{2}} based in {{3}}. Your FitScore for this match is {{4}} out of 100. Our quick summary for you: {{5}}. Reply here if you want to discuss next steps or have questions for our team. | verify                                                  | CV-flow match result (falls back to `th_job_match_result`, likely REJECTED)                                                                                   |
| `th_job_no_match`                 | UTILITY                  | 2              | Hi {{1}}, thanks for your interest. Your profile is not a strong match for {{2}} on TigerHire right now — we will keep you in mind for better-fit roles.                                                                                                             | verify                                                  | CV-flow no-match                                                                                                                                              |
| `tigerhire_referred_candidate_v1` | UTILITY                  | 2              | Hi {{1}}, {{2}} referred you on TigerHire. Reply YES to continue, or send your CV as a PDF and we will share your FitScore against live roles in about 2 minutes. Privacy: https://tigerhire.io/privacy                                                              | verify (wamid but poor delivery — last-resort fallback) | referral first contact fallback                                                                                                                               |
| `tigerhire_referral_v1`           | UTILITY                  | 2              | Hi {{1}}, {{2}} referred you to a role on TigerHire. Reply YES to get started, or send your CV in PDF to get your FitScore.                                                                                                                                          | verify                                                  | referral invite (then `tigerhire_referral_v2`, MARKETING)                                                                                                     |
| `th_interview_slots`              | UTILITY                  | 5              | Hi {{1}}, a recruiter wants to interview you for {{2}}. Please pick a time that works for you: 1) {{3}} 2) {{4}} 3) {{5}}. Reply with 1, 2, or 3 to confirm.                                                                                                         | verify                                                  | interview scheduling (notifier)                                                                                                                               |
| `th_interview_slot_picker`        | UTILITY                  | 5              | _(no copy in scripts — draft, adjust before submitting)_ Hi {{1}}, let's schedule your interview for {{2}}. Available slots: 1) {{3}} 2) {{4}} 3) {{5}}. Reply with the slot number that works for you.                                                              | verify                                                  | slot picker — **caveat:** code sends 3–5 params; Meta templates have a fixed count, so sends with <5 will fail. Pad to 5 in code or submit a 3-slot template. |
| `th_interview_reminder`           | UTILITY                  | 3              | Hi {{1}}, this is a reminder that your interview for {{2}} is scheduled at {{3}}. Good luck! Reply here if you need to reschedule.                                                                                                                                   | verify                                                  | interview reminder (has free-text fallback)                                                                                                                   |
| `th_interview_rescheduled`        | UTILITY                  | 3              | Hi {{1}}, your interview for {{2}} has been rescheduled to {{3}}. Reply here if this does not work for you.                                                                                                                                                          | verify                                                  | reschedule notify                                                                                                                                             |
| `th_interview_cancelled`          | UTILITY                  | 3              | _(no copy in scripts — draft, adjust before submitting)_ Hi {{1}}, your interview for {{2}} scheduled at {{3}} has been cancelled. We will share updated next steps here shortly.                                                                                    | verify                                                  | cancel notify (has free-text fallback)                                                                                                                        |
| `th_preference_matches`           | MARKETING                | 3              | Hi {{1}}! We found {{2}} role(s) matching your preferences: {{3}}. Reply to learn more on TigerHire.                                                                                                                                                                 | verify                                                  | preference matches                                                                                                                                            |
| `th_no_match_subscribed`          | MARKETING                | 3              | Hi {{1}}! No strong match for {{2}} in {{3}} yet, but you are subscribed — we will alert you when better roles appear.                                                                                                                                               | verify                                                  | no-match + subscribed                                                                                                                                         |
| `th_new_role_alert`               | MARKETING                | 4              | Hi {{1}}! New match: {{2}} in {{3}}. FitScore {{4}}/100. Open TigerHire to apply or ask questions here.                                                                                                                                                              | verify                                                  | job alert cron                                                                                                                                                |
| `candidate_profile_claimed`       | UTILITY                  | 1              | Hi {{1}}, your profile was claimed by a recruiter on TigerHire. Check the app for next steps.                                                                                                                                                                        | verify                                                  | profile claim                                                                                                                                                 |
| `waitlist_confirmation`           | MARKETING                | 1              | Hi {{1}}, you are on the TigerHire waitlist. We will notify you as soon as your account is ready.                                                                                                                                                                    | verify                                                  | waitlist                                                                                                                                                      |
| `th_sourcing`                     | MARKETING                | 5              | Hi {{1}}, {{2}} is hiring for {{3}} in {{4}}. CTC range: {{5}}. Interested? Reply YES to get started, or send your CV in PDF to get a FitScore in 2 minutes.                                                                                                         | verify                                                  | sourcing campaign                                                                                                                                             |
| `th_referral_drive`               | MARKETING                | 4              | Hi {{1}}, {{2}} is looking for a {{3}}. Know someone great? Share this referral link with a friend: {{4}}. Thank you for helping spread the word on TigerHire.                                                                                                       | verify                                                  | referral drive                                                                                                                                                |
| `th_referral_drive_multi`         | MARKETING                | 4              | Hi {{1}}, {{2}} has multiple open roles on TigerHire: {{3}}. View all roles and refer candidates: {{4}} Thank you for spreading the word on TigerHire.                                                                                                               | verify                                                  | referral drive (multi)                                                                                                                                        |
| `th_referral_drive_urgent`        | MARKETING                | 4              | Hi {{1}}, urgent hire at {{2}}: {{3}}. Multiple roles are open — refer great candidates: {{4}} Thank you for helping on TigerHire.                                                                                                                                   | verify                                                  | referral drive (urgent)                                                                                                                                       |
| `th_referrer_otp`                 | AUTHENTICATION (`en_US`) | 1 (code)       | Meta OTP layout: security-recommendation body + 10-min expiry footer + COPY_CODE button (no custom text allowed). UTILITY variant (en): Your TigerHire verification code is {{1}}. Valid for 10 minutes. Do not share this with anyone.                              | verify                                                  | referrer login OTP                                                                                                                                            |
| `th_referrer_vouch_request`       | UTILITY                  | 1              | Hi! {{1}} just applied via your referral link on TigerHire. We have 5 quick questions to vouch for them — takes 3 minutes.                                                                                                                                           | verify                                                  | vouch agent                                                                                                                                                   |

`plan-stage-dispatch.ts` sends whatever `th_*` name a recruitment-plan stage's comms config
holds — keep plan configs limited to names in this table.

### Defined in code/scripts but NOT currently sent (submit only when enabling the flow)

- Improved-copy alternates (new names, in `submit-whatsapp-templates-v2.mjs`; switching
  requires a code change to the constant): `th_referrer_offer_update_v2`,
  `th_referrer_rejection_update_v2`, `th_job_no_match_v2`, `th_no_match_subscribed_v2`,
  `th_reengagement_v2`, `th_post_hire_pulse_v2`, `tigerhire_employee_invite_v2`,
  `tigerhire_session_expired_v2`, `tigerhire_fitscore_v2`, `tigerhire_referral_v2`,
  `tigerhire_consent_v3_with_bonus`.
- Wrappers with no active caller: `th_profile_incomplete`, `th_reengagement`,
  `th_post_hire_pulse`, `th_referral_program_invite`, `tigerhire_employee_invite_v1`,
  `tigerhire_fitscore_v2` (send fn unused), `tigerhire_interview_v1`, `tigerhire_reminder_v1`,
  `tigerhire_session_expired`, `th_referrer_magic_link`, registry-only names in
  `wa-template-registry.ts` (`application_received`, `interview_invite`, `offer_ready`,
  `rejection`, legacy `screening_questions`).
- Deliberately disabled (log-only, no send): `candidate_match_alert`,
  `recruiter_shortlist_ready`, `candidate_contact_unlocked`, `th_recruiter_new_candidates`.
- Approved but unused: `th_shortlist_screening` (candidate: rename prescreen invite to this
  already-approved name, or submit `th_screening_invite`).

### Operator must do

1. Run `node scripts/audit-whatsapp-templates.mjs` against the prod WABA; record which live-path
   names above are APPROVED / REJECTED / missing.
2. Submit the three known-missing templates first (`th_screening_invite`,
   `th_referrer_offer_update`, `th_referrer_rejection_update`), then every other live-path name
   the audit shows missing: `node --env-file=.env.local scripts/submit-whatsapp-templates-v2.mjs
--only <name>` / `npm run create:templates <name>`. For `th_interview_slot_picker` and
   `th_interview_cancelled`, finalize the draft copy above before submitting.
3. Watch approvals land in `whatsapp_template_status` (webhook) or WhatsApp Manager; REJECTED →
   fix copy and resubmit under a **new name** (Meta blocks re-review edits in practice — that is
   why `_v2`/`_v6` names exist).
4. Category discipline: if Meta re-categorizes a template (UTILITY→MARKETING), mirror it in
   `src/lib/whatsapp/template-categories.ts`, or cold-number gating will be wrong.

### Customer org must do

- Nothing — templates live on the platform WABA. Orgs only supply the display values (company
  name, job titles) that flow into the variables.

### Smoke test

1. After `th_screening_invite` approval: move a candidate to phone*screen on a job with
   screening questions → cold number should receive the \_screening invite* copy (not the
   application-received fallback); `wa_messages` row shows `template_name=th_screening_invite`,
   delivery status `delivered`.
2. After referrer templates approve: drive a referred application to offer + rejection in a test
   org → referrer WhatsApp receives both; `notifications_log` rows have `send_success=true`.
3. Re-run `scripts/audit-whatsapp-templates.mjs` — zero live-path names missing.

## 5. Email intake (forward resumes into TigerHire)

**Our side — done (2026-07-09):** `POST /api/intake/email` accepts
`jobs+<job-uuid>@<any intake domain>` addressing (secret-protected via
`EMAIL_INTAKE_SECRET`, set on all Vercel envs). New bridge
`POST /api/webhooks/resend-inbound` verifies Resend's svix signature,
downloads the resume attachment via `GET
api.resend.com/emails/receiving/{email_id}/attachments/{id}` →
`download_url` (contract verified against Resend docs), and forwards it to
the intake pipeline (candidate create + FitScore).

**Operator must do (one-time, ~15 min in Resend dashboard):**

1. Add receiving domain `in.tigerhire.io` under Resend → Domains/Receiving;
   copy the MX host it shows and add it via
   `npx vercel dns add tigerhire.io in MX <host> 10`.
2. Create a webhook subscribed to `email.received` pointing at
   `https://tigerhire.io/api/webhooks/resend-inbound`; copy its signing
   secret → `npx vercel env add RESEND_INBOUND_WEBHOOK_SECRET production`.
3. Flip `ack_email_intake_enabled` if the ack notifier should confirm
   receipt to the sender.
4. Smoke: email any PDF resume to `jobs+<real job uuid>@in.tigerhire.io`;
   candidate should appear scored within ~2 min.

**Customer must do (ongoing):** forward resume emails to their job's
address (shown in job settings), or set a mailbox auto-forward rule
(e.g. Gmail filter: has:attachment from:naukri → forward). No OAuth, no
mailbox access granted.
