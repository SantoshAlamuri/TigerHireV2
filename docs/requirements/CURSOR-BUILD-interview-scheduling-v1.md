# Cursor build prompt: Stage-linked interview scheduling v1

Use this prompt (or paste its body into a Cursor agent) **after** the ADR is merged. Goal: ship v1 **only** as specified in [ADR-interview-scheduling-v1.md](./ADR-interview-scheduling-v1.md). Do **not** implement v2 items listed under "Out of scope" in the ADR.

---

## Context

TigerHire already has `interview_availability_slots` (job + creator `user_id`, statuses `available` | `booked`) and `pipeline_stages` with `interviewer_email` / `interviewer_name`. The ADR adds stage-linked slots, magic-link confirmation, new statuses including `legacy_available`, and `slot_confirmation_tokens`. **Candidate** scheduling comms use **WhatsApp first** when `tigerhire_consent_v1` applies, else **email**, with **silent email fallback** on WA failure (ADR §8). Register UTILITY templates listed in ADR §8.

## Hard constraints (do not violate)

1. **No** `stage_interviewers` table, **no** panel flows, **no** per-slot partial confirm/decline on one token (v1 = all slots on token confirmed or declined together).
2. **No** Google/Outlook OAuth or calendar write for interviewers in v1.
3. **No** candidate PII on the magic-link GET page (job title, stage name, slot times only).
4. **Parallel legacy — booking route is one handler, two branches (ADR “Booking invariants”):** If `stage_id IS NULL`, accept **`legacy_available` → `booked`**. If `stage_id IS NOT NULL`, only allow states such as **`offered` → `booked`**; **reject** `legacy_available` (and any invalid combo). Add tests for both so migration does not **500** legacy orgs.
5. Token: store **only** `token_hash` (e.g. SHA-256 of a random raw token); raw token exists once in email; **72h** `expires_at`; **single-use** via `used_at`.
6. Rate limit: **≤5** propose emails per `stage_id` per **24h** (implement in API layer with Redis or DB counter — follow existing rate-limit patterns in repo).
7. **WhatsApp slot offers:** at most **3** quick-reply buttons per message; if more slots, deep-link to TigerHire full-picker page (ADR §8).
8. **No `.ics` attachments** in outbound email for scheduling v1 — use TigerHire **calendar / add-to-calendar** page links (ADR §4, §8).
9. **Do not** send interview scheduling WhatsApp messages to **interviewers** in v1 (email only).

## Implementation checklist

### Database

- [ ] New migration (timestamp prefix under `supabase/migrations/`): create `slot_confirmation_tokens` with columns per ADR §9; indexes on `token_hash`, `stage_id`, `expires_at`.
- [ ] Alter `interview_availability_slots`: add nullable `stage_id`, `proposed_by`, `confirmed_at`, `confirmed_via`; migrate CHECK / status values per ADR §5 and migration rules (`available` → `legacy_available`, `booked` unchanged).
- [ ] RLS policies for new table; ensure anonymous **cannot** SELECT all tokens — confirmation uses route handler + hash lookup only.

### API

- [ ] `POST /api/jobs/[id]/pipeline-stages/[stageId]/availability/propose` — auth: recruiter roles per existing interview routes; validate slots belong to `job_id` and `stage_id`’s job; insert slots as `proposed`; insert token row; send interviewer email (Resend from [`src/lib/services/resend.ts`](../../src/lib/services/resend.ts)) with magic link + **calendar page URL** (no ICS attachment; ADR §4).
- [ ] `GET /api/slot-confirmation/[token]` — **no** session auth; validate hash + not used + not expired; return JSON for UI (no candidate name).
- [ ] `POST /api/slot-confirmation/[token]` — validate; apply **full-batch** confirm or decline to all `slot_ids` still `proposed`; set `used_at`, `action`; update slots to `confirmed` or `declined`; notify recruiter per ADR §10.
- [ ] Cron or lazy job: mark `proposed` slots as `expired` when `expires_at` passed **and** token unused; **email recruiter only**.
- [ ] Candidate notify helper: try WhatsApp template (`th_slot_offer_v1`, `th_booking_confirmed_v1`, `th_interview_reminder_24h_v1`, `th_interview_cancelled_v1`, `th_slots_reproposed_v1`) when consent gate passes; on any failure send **email** without surfacing error to candidate; persist **`channel`** for timeline (ADR §8). Reuse patterns from [`src/lib/services/whatsapp.ts`](../../src/lib/services/whatsapp.ts) / [`src/lib/whatsapp/templates.ts`](../../src/lib/whatsapp/templates.ts).
- [ ] Public **candidate** calendar / add-to-calendar page (auth or tokenised as appropriate) serving ICS download or Google/Outlook links — linked from templates and emails.
- [ ] Modify [`src/app/api/jobs/[id]/interviews/book/route.ts`](../../src/app/api/jobs/%5Bid%5D/interviews/book/route.ts): if `stage_id` present, enforce allowed statuses (`offered` per ADR); if legacy row, keep current rules.
- [ ] Modify [`src/app/api/jobs/[id]/availability/route.ts`](../../src/app/api/jobs/%5Bid%5D/availability/route.ts): optional `stage_id` query; include new statuses in responses as needed.

### UI

- [ ] Recruiter: "Propose availability" from stage context (pipeline-stages page or modal); resend + awaiting tab on interviews page per ADR.
- [ ] **Copy / nudges (ADR §11):** Propose UI includes short helper text: prefer **2–3** high-confidence slots per batch (all-or-nothing confirm reduces “decline everything” loops). Interviewer decline: supportive framing (“None of these times work”) + optional reason; post-decline recruiter message: propose a new batch.
- [ ] Candidate timeline / activity: show **delivery channel** (WhatsApp vs email) for each scheduling outbound (ADR §8).
- [ ] Public page under `src/app/(public)/` or similar for `GET` confirmation UI consuming token from query param (exact routing choice: match `GET /api/slot-confirmation` or use Server Component + server action — **do not** expose service role to client).
- [ ] Deprecation banner on [`src/app/(dashboard)/recruit/jobs/[id]/interviews/page.tsx`](../../src/app/%28dashboard%29/recruit/jobs/%5Bid%5D/interviews/page.tsx) for legacy slots.

### Tests

- [ ] Unit tests: token hash verification, expiry, single-use, rate limit, batch confirm/decline state transitions.
- [ ] Unit/integration: book route rejects non-`offered` stage-linked slots; legacy path still books `legacy_available`.
- [ ] Unit tests: candidate notify — consent absent → email; WA failure → email; channel persisted for timeline mocks.

## Explicitly do NOT build

- `interviewer_user_id` on stages (document only for v2).
- Interviewer self-serve propose flow.
- Panel / `stage_interviewers` / multiple emails per stage.
- OAuth calendar integration.
- Partial slot confirm within one token **in v1** (ship in **v1.1** with checkbox subset + one batched POST per ADR §6).
- Org toggle for candidate name on magic-link page.
- **WhatsApp to interviewers** for scheduling.
- More than **3** quick-reply buttons on a single WhatsApp template (use link to web for full list).

## Definition of done

- ADR state machine implemented for `stage_id IS NOT NULL` slots.
- Legacy slots unchanged in behaviour for existing orgs.
- Security review: no raw tokens in DB; no PII on public confirm page; CSRF not applicable to magic POST but validate token body size and reason length.
- Meta UTILITY templates in ADR §8 registered; candidate sends honour consent + silent email fallback; recruiter can see **channel** on candidate timeline.

## First file to read

[ADR-interview-scheduling-v1.md](./ADR-interview-scheduling-v1.md) — including **Tripwires** at the end (signals to reopen v1 scope after ship).
