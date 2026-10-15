# Intake channels and environment acceptance matrix

Use this matrix for sign-off that each candidate entry path behaves as designed. Link each row to owners in your release checklist.

## Legend

| Column            | Meaning                                          |
| ----------------- | ------------------------------------------------ |
| **Entry**         | How the candidate (or relay) reaches TigerHire   |
| **Auth / env**    | Secrets and configuration required               |
| **Happy path**    | Minimum success criteria                         |
| **Failure modes** | Representative HTTP or UX outcomes               |
| **Persistence**   | Tables / records you should see (admin Supabase) |

---

## 1. Email intake (CV to job address)

| Field             | Detail                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entry**         | `POST /api/intake/email` (typically wired from Resend/inbound email relay) with `to: jobs+<jobUuid>@in.tigerhire.com` or explicit `jobId`, plus `resumeBase64` (PDF/DOC). |
| **Code**          | [`src/app/api/intake/email/route.ts`](../src/app/api/intake/email/route.ts) → [`savePublicApplication`](../src/lib/agents/public-apply.ts) with `source: "email_intake"`. |
| **Auth / env**    | `EMAIL_INTAKE_SECRET` — send as `x-intake-secret` or `Authorization: Bearer <secret>`.                                                                                    |
| **Happy path**    | `201` with `candidateId`, `jobId`, `source: "email_intake"`. Candidate visible under org/job.                                                                             |
| **Failure modes** | `401` missing/wrong secret; `400` missing job id or empty file; `404` unknown job; `422` schema validation.                                                               |
| **Persistence**   | Candidate row; application/fit pipeline per `savePublicApplication` behaviour.                                                                                            |

---

## 2. Public web apply (form)

| Field             | Detail                                                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entry**         | Browser: `/apply/<organisationSlug>?job=<optionalJobId>` → `POST /api/apply` (`multipart/form-data`: `file`, `slug`, optional `jobId`, `name`, `phone`, `email`, `ref`, `source`).                                        |
| **Code**          | [`src/app/(public)/apply/[slug]/page.tsx`](<../src/app/(public)/apply/[slug]/page.tsx>), [`src/app/api/apply/route.ts`](../src/app/api/apply/route.ts) → [`processPublicApplication`](../src/lib/agents/public-apply.ts). |
| **Auth / env**    | Public; CSRF via allowed `Origin`/`Referer` ([`validateOrigin`](../src/lib/security/csrf.ts)). Rate limit key `apply:<ip>`.                                                                                               |
| **Happy path**    | `200`/`201` with outcome (`scored`, `processing`, `no_open_roles`, etc.). UI shows honest status.                                                                                                                         |
| **Failure modes** | `403` CSRF; `429` rate limit; `400` missing file/slug; validation errors.                                                                                                                                                 |
| **Persistence**   | Candidate; fit_scores when scoring completes; optional referral merge when `ref` present.                                                                                                                                 |

---

## 3. WhatsApp (CV, consent, numeric apply)

| Field                    | Detail                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entry**                | Meta / BSP → `POST /api/webhooks/whatsapp` with signed raw body. Product webhook must receive traffic first (see [`WHATSAPP_CODE_AND_INTERAKT_FLOW_CHECK.md`](./WHATSAPP_CODE_AND_INTERAKT_FLOW_CHECK.md)).                                                                                                                                                                                           |
| **Code**                 | [`src/app/api/webhooks/whatsapp/route.ts`](../src/app/api/webhooks/whatsapp/route.ts) → [`handleInboundMessage`](../src/lib/whatsapp/handler.ts) → apply via [`application-bridge`](../src/lib/whatsapp/application-bridge.ts). Outbound: [`src/lib/services/whatsapp.ts`](../src/lib/services/whatsapp.ts).                                                                                          |
| **Auth / env**           | `WHATSAPP_META_APP_SECRET` or `META_APP_SECRET` (preferred) or `WHATSAPP_WEBHOOK_SECRET` for HMAC (`x-hub-signature-256`). GET verify: `WHATSAPP_WEBHOOK_SECRET` as `hub.verify_token`. Outbound: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`; optional `WHATSAPP_MODE=sandbox`; production hold via `OUTBOUND_NOTIFICATIONS_ENABLED`.                                                        |
| **Happy path**           | Webhook `200` `{ status: "received" }`; session advances; CV parsed; candidate can reply with job index to create application.                                                                                                                                                                                                                                                                        |
| **Failure modes**        | `401` bad signature; `400` invalid JSON; rate limit returns `200` but skips heavy processing (logged). Idempotent replay for same `wamid` returns stored response when idempotency DB available.                                                                                                                                                                                                      |
| **Persistence**          | WhatsApp session rows; message log; applications after numeric apply. Recruiter API: [`GET /api/whatsapp/flow-status`](../src/app/api/whatsapp/flow-status/route.ts) for milestones.                                                                                                                                                                                                                  |
| **Automated regression** | Route: [`tests/unit/webhooks-whatsapp-route.test.ts`](../tests/unit/webhooks-whatsapp-route.test.ts) (signature, JSON errors, idempotency key wiring, rate limit short-circuit). Handler/state: [`tests/unit/whatsapp-application-bridge.test.ts`](../tests/unit/whatsapp-application-bridge.test.ts), [`tests/unit/whatsapp-inbound-intent.test.ts`](../tests/unit/whatsapp-inbound-intent.test.ts). |

---

## 4. External job boards (distribution → apply URL)

| Field             | Detail                                                                                                                                                                                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entry**         | Jobs pushed to **Adzuna** / **Indeed** include `apply_url` pointing at `https://tigerhire.io/apply/<slug>?job=<jobId>` (see [`adzuna` connector](../src/lib/distribution/connectors/adzuna.ts)). Candidate applies through **the same web apply path** as section 2 once they land from the board. |
| **Code**          | [`src/lib/distribution/engine.ts`](../src/lib/distribution/engine.ts), org credentials via [`settings/org/integrations`](../src/app/api/settings/org/integrations/route.ts).                                                                                                                       |
| **Auth / env**    | Per-org Adzuna/Indeed API credentials stored as integration connections.                                                                                                                                                                                                                           |
| **Happy path**    | `job_distributions` row `status: pushed`; listing shows apply link; one successful submit from that URL.                                                                                                                                                                                           |
| **Failure modes** | Push `failed` with error in `job_distributions`; missing credentials skips push. **Scope:** TigerHire does not ingest “board-native applies” that never hit your URL — only the apply URL pipeline is in scope.                                                                                    |
| **Persistence**   | `job_distributions`; then same as web apply.                                                                                                                                                                                                                                                       |

---

## 5. Internal public job board (TigerHire listing)

| Field          | Detail                                                                                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entry**      | Jobs marked for public listing; candidates use public job pages / apply links as configured in product.                                                                                                                     |
| **Code**       | Visibility: [`JobListingVisibilityFields`](../src/components/dashboard/JobListingVisibilityFields.tsx); job APIs enforce at least one listing mode where required ([`jobs/[id]/route`](../src/app/api/jobs/[id]/route.ts)). |
| **Happy path** | Open role discoverable; apply link resolves to `/apply/...` or equivalent public flow.                                                                                                                                      |

---

## Cross-cutting: outbound email (Resend)

| Field          | Detail                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entry**      | Orchestrator steps, communication agent, offer send, auth emails, etc.                                                                                    |
| **Code**       | [`src/lib/services/resend.ts`](../src/lib/services/resend.ts); example orchestration: [`orchestrator-steps.ts`](../src/lib/agents/orchestrator-steps.ts). |
| **Auth / env** | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`; `EMAIL_MODE` / sandbox and production outbound hold behaviour per `env`.                                           |

---

## Owner sign-off (template)

| Channel         | Owner | Staging verified (date) | Production smoke (date) | Notes |
| --------------- | ----- | ----------------------- | ----------------------- | ----- |
| Email intake    |       |                         |                         |       |
| Web apply       |       |                         |                         |       |
| WhatsApp        |       |                         |                         |       |
| Board apply URL |       |                         |                         |       |

See also: [`docs/STAGING_INTAKE_AND_COMMS_E2E_RUNBOOK.md`](./STAGING_INTAKE_AND_COMMS_E2E_RUNBOOK.md) for execution steps.

## Automated verification (code, local)

Run the **intake-channel unit bundle** (fast, no staging secrets):

```bash
npm run test:intake-channels
```

This runs Vitest against: email intake route, WhatsApp webhook route, webhook payload normalisation, public apply API (`POST/GET`), WhatsApp flow-status route, WhatsApp application bridge, and inbound intent helpers.

Broader CI uses `npm run test:coverage` (full unit + integration coverage). For GA release smoke, use `npm run test:ga-sweep` (includes several of the suites above plus other critical routes).
