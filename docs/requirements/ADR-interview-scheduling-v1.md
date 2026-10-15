# ADR: Stage-Linked Interview Scheduling v1

**Status:** Accepted  
**Date:** 2026-04-17  
**Supersedes:** Nothing — this ADR extends the current job-wide slot model. Legacy rows remain valid until a later deprecation release.

## Context

Interview availability today is job-wide and creator-centric: slots live on `interview_availability_slots` with `job_id` + `user_id` (creator). Pipeline stages carry `interviewer_name` / `interviewer_email`, but the booking flow does not bind slots to a stage or require the named interviewer to confirm.

The result: "agreed slots" is implicit. Recruiters cannot tell which round a slot belongs to, which interviewer has actually signed off, or whether a booked slot represents real availability.

v1 closes this gap for the common SMB case: **one interviewer per stage**, recruiter-driven proposal, **email-based confirmation** (magic link) for interviewers, **72h token TTL**, **soft confirmation** with **link-based** “Add to calendar” (TigerHire page; no `.ics` attachment). **Candidates** receive scheduling comms on **WhatsApp first** when opted in via `tigerhire_consent_v1`, with **silent email fallback**.

**Legacy flow runs in parallel:** slots with `stage_id IS NULL` keep pre-ADR semantics until deprecated in UI and removed in a later release.

## Decisions

### 1. Identity — magic link against stage email

v1 uses the existing `pipeline_stages.interviewer_email` as the interviewer identity. Confirmation happens via tokenised email link; no login required.

**Rationale:** External/freelance interviewers and churn are the norm for India SMB. Requiring logins would hurt adoption. Magic links are sufficient for "intent to hold this time."

**Upgrade path:** Add nullable `interviewer_user_id` on stages later. Magic link continues when `user_id` is null; user-linked interviewers get in-app notifications and (eventually) calendar sync.

### 2. Panel semantics — single interviewer per stage in v1

A stage has **one** interviewer (`interviewer_email` / `interviewer_name`). That person is **implicitly primary**. Multi-interviewer panels are **out of scope** until a `stage_interviewers` table exists (v2).

### 3. Who proposes — recruiter only

Recruiter creates slots in `proposed` state. Interviewer confirms (→ `confirmed`) or declines (→ `declined`). Interviewer self-serve ("here are times I'm free") is v2.

### 4. Confirmation semantics — soft + link-based calendar

Confirm = contractual intent in TigerHire, **not** a write to the interviewer's calendar. Interviewer confirmation email includes a **URL** to a TigerHire page with **Add to calendar** (ICS download or deep links from that page). **No `.ics` attachment** in email. **No OAuth**, no free/busy API calls.

**Upgrade path:** When identity moves to logged-in interviewers, calendar writes become feasible.

### 5. Slot lifecycle

```text
proposed ──(interviewer confirms)──→ confirmed ──(recruiter offers)──→ offered
    │                                     │                                │
    │                                     │                   (candidate books)
    │                                     │                                │
    │                                     │                                ▼
    │                                     │                             booked
    │                                     │                                │
    ▼                                     ▼                                ▼
declined                              cancelled                        cancelled
    │                                                                    (fresh slot
    ▼                                                                     required)
expired (TTL breach, no action)
```

**Rules:**

- **`offered` → `confirmed`** when the candidate declines the offered slot (re-offerable to another candidate for that stage).
- **`booked` → `cancelled`** is **terminal** for the slot. Do **not** return to pool; context is stale. Recruiter proposes fresh slots.
- **Invariant (v1):** At most one slot per `(pipeline_candidate_id, stage_id)` may be in `offered` or `booked` at a time (enforce in application layer or DB constraint as implementation allows).

**Legacy:** Rows with `stage_id IS NULL` use statuses `legacy_available` | `booked` (see migration) and **do not** participate in `proposed` / `confirmed` / `offered` without a migration path chosen by the org.

### 6. One token, multiple slots — confirm/decline semantics

- Each issuance creates **one** `slot_confirmation_tokens` row whose `slot_ids[]` lists **all** slots included in that email.
- **v1 rule (simplest):** The magic-link **POST** applies to **the full set** of `slot_ids` on the token: `action: 'confirm'` confirms every slot still in `proposed` and listed on the token; `action: 'decline'` with optional `reason` declines **all** listed slots that are still `proposed`. Partial per-slot actions are **out of scope for v1** (avoids ambiguous UI and split states). **Product note:** if the interviewer can only honour a subset of proposed times, v1 forces either **decline all** (recruiter re-proposes a smaller, higher-confidence set) or **confirm all** (risk if candidate picks an unworkable slot)—see UI guidance in §11. **v1.1:** per-slot checkboxes that still submit one batched API action (subset of `slot_ids`); data model already supports arrays.
- **Single-use:** After `used_at` is set, the token cannot be reused. Recruiter must re-propose to issue a new token.

### 7. Magic-link page — candidate PII

**Default:** **Redact** candidate identity on the unauthenticated confirm page (job title, stage name, slot times only). Token leakage must not expose candidate names.

**v2:** Optional org-level toggle (e.g. "show candidate first name on interviewer confirm page") if dogfood demands it.

### 8. Candidate channel — WhatsApp primary, email fallback

**Scope:** Candidate-facing scheduling only (slot offer, booking confirmation, reminder, cancellation, slots re-proposed). **Interviewer-facing messages remain email-only in v1.** WhatsApp for interviewers is **out of scope** (externals resist work chat on personal WhatsApp).

**Routing:**

- **Default:** Send via **WhatsApp** when the candidate has consented via the **`tigerhire_consent_v1`** utility template / consent flag used elsewhere in the product (same gate as existing WhatsApp flows).
- **Fallback:** **Email** automatically when consent is absent **or** when a WhatsApp send fails (no consent, template not approved, Meta API error, sandbox mode, missing phone, etc.). Fallback is **silent** (no extra error toast to candidate); log server-side for support.

**WhatsApp (UTILITY category)** — templates required for v1:

| Template name                  | Purpose                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `th_slot_offer_v1`             | Slot offer; **max 3 quick-reply buttons** for slot selection (Meta button limit). |
| `th_booking_confirmed_v1`      | Booking confirmed; includes link to TigerHire **calendar / scheduling** page.     |
| `th_interview_reminder_24h_v1` | 24h reminder before interview.                                                    |
| `th_interview_cancelled_v1`    | Interview cancelled.                                                              |
| `th_slots_reproposed_v1`       | New slot options after re-propose / change.                                       |

**Constraint — more than 3 confirmed slots:** If the recruiter offers **more than 3** `confirmed` slots, the WhatsApp message presents **only the first 3** in quick-replies; a **single link** in the message opens a TigerHire page with the **full** list for selection (web continues to enforce business rules).

**`.ics` / calendar:** For candidates (and parity with §4), delivery is **link-based only** — messages point to a TigerHire page with **Add to calendar**; **no** `.ics` email attachment.

**Observability / recruiter UX:** Persist the **actual delivery channel** used per outbound (`whatsapp` | `email`) and surface it on the **candidate timeline** (and/or activity feed) so recruiters see what the candidate received.

### 9. Tokens — `slot_confirmation_tokens`

| Column              | Type                                                           | Notes                                              |
| ------------------- | -------------------------------------------------------------- | -------------------------------------------------- |
| `id`                | uuid PK                                                        |                                                    |
| `token_hash`        | text not null                                                  | SHA-256 of raw token; **never** store raw token    |
| `stage_id`          | uuid not null FK → `pipeline_stages(id)`                       |                                                    |
| `interviewer_email` | text not null                                                  | Denormalised at issuance; immutable                |
| `slot_ids`          | uuid[] not null                                                | Slots this token can confirm/decline (batch)       |
| `expires_at`        | timestamptz not null                                           | `created_at + 72 hours`                            |
| `used_at`           | timestamptz                                                    | null = unused; set once on first successful action |
| `action`            | text                                                           | `'confirmed'` \| `'declined'` \| null until used   |
| `created_by`        | uuid FK → recruiter profile / `auth.users` per repo convention |                                                    |
| `created_at`        | timestamptz default now()                                      |                                                    |

- **TTL:** **72 hours** (covers Friday afternoon → Monday morning without weekend-specific logic).
- **Rate limit (application):** Max **5** confirmation emails per `stage_id` per rolling **24h** (prevents spam from re-proposal loops).

### 10. Notifications

| Event                           | Who is notified                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Slots proposed                  | Interviewer (**email** with magic link + calendar page **link** per §4)                                                    |
| Slots confirmed                 | Recruiter (in-app + email)                                                                                                 |
| Slots declined                  | Recruiter (in-app + email; optional decline reason)                                                                        |
| Slot offered to candidate       | Candidate (**WhatsApp** if `tigerhire_consent_v1` gate passes, else **email**; see §8); on WA failure → **email** silently |
| Booking confirmed to candidate  | Candidate (`th_booking_confirmed_v1` / email equivalent; link-based calendar per §8)                                       |
| Interview reminder (e.g. 24h)   | Candidate (`th_interview_reminder_24h_v1` / email)                                                                         |
| Interview cancelled (candidate) | Candidate (`th_interview_cancelled_v1` / email)                                                                            |
| Slots re-proposed to candidate  | Candidate (`th_slots_reproposed_v1` / email)                                                                               |
| Candidate books                 | Recruiter + interviewer (**email**; calendar page **link**; no attachment)                                                 |
| Token expired                   | **Recruiter only** (do not re-ping interviewer)                                                                            |
| Booking cancelled               | Recruiter + interviewer (**email**); candidate channel per §8 (`th_interview_cancelled_v1` / email)                        |

## Schema deltas

**New table:** `slot_confirmation_tokens` (shape in §9). Align FK for `created_by` with existing patterns (`profiles`, `auth.users`, or org members — pick one in implementation to match RLS).

**Optional / recommended for §8:** A small `interview_scheduling_outbound` (or reuse an existing notifications/activities table) storing `pipeline_candidate_id`, `kind`, `channel` (`whatsapp` \| `email`), `template_name`, `provider_message_id`, `created_at` — so the candidate timeline can show actual delivery channel.

**`interview_availability_slots` — new columns (conceptual):**

- `stage_id` uuid nullable FK → `pipeline_stages(id)` — **null** = legacy job-wide slot.
- `status` text — extended enum (implementation replaces or widens existing CHECK):
  - New flow: `proposed` | `confirmed` | `declined` | `offered` | `booked` | `cancelled` | `expired`
  - Legacy: `legacy_available` (grandfathered open slot, no stage, no interviewer confirm)
- `proposed_by` uuid nullable — recruiter who proposed (null on legacy rows).
- `confirmed_at` timestamptz nullable.
- `confirmed_via` text nullable — `'magic_link'` in v1; `'in_app'` later.

**Migration / backfill (do not misrepresent interviewer intent):**

- Existing rows with `status = 'booked'` → keep **`booked`**, `stage_id` null, rest null as today.
- Existing rows with `status = 'available'` → **`legacy_available`**, `stage_id` null — explicitly **not** `confirmed` (no false audit that an interviewer agreed).
- New stage-linked slots use `proposed` → … only when `stage_id` is set.

**RLS:** New policies for `slot_confirmation_tokens` (service role or restricted insert by org recruiters; **no** broad SELECT for anonymous users — token validation happens in API with hashed lookup).

## API surface

**Correct paths (today’s app lives under `/api/jobs/[id]/…`):**

**New:**

- `POST /api/jobs/[id]/pipeline-stages/[stageId]/availability/propose` — recruiter proposes N slots for that stage; creates token(s); sends interviewer email (rate-limited) with magic link + calendar page **link** (§4).
- `GET /api/slot-confirmation/[token]` — public-ish: resolves token hash, returns slot list + job/stage metadata **without** candidate PII (redacted default).
- `POST /api/slot-confirmation/[token]` — body `{ action: 'confirm' | 'decline', reason?: string }` — v1 applies to **all** token `slot_ids` still in `proposed` (see §6); notify recruiter per §10.

**Modified:**

- `POST /api/jobs/[id]/interviews/book` — see **Booking invariants** below (one route, two explicit branches).
- `GET /api/jobs/[id]/availability` — accept optional `stage_id` query param; return legacy + new rows according to filters documented in OpenAPI/comments.

**Booking invariants** (`POST /api/jobs/[id]/interviews/book` — single endpoint, must not half-deprecate):

1. **`stage_id IS NULL` (legacy):** Allow booking only from **`legacy_available`** → **`booked`** (same as today’s `available` → `booked` after migration renames status). Reject or ignore paths that assume stage-linked states.
2. **`stage_id IS NOT NULL` (new flow):** Allow booking only from **allowed** states (e.g. **`offered`** → **`booked`** per policy). **Reject** `legacy_available` here: that status must only exist with `stage_id IS NULL`. If a row is malformed (`stage_id` set + `legacy_available`), treat as **400** / invalid state, not bookable.
3. Tests must cover both branches so existing orgs do not **500** after migration.

## UI surface

**Recruiter:**

- Stage edit (or adjacent): **"Propose availability"** CTA → date/time batch → issues magic-link email.
- Pipeline / candidate: **"Offer slot"** lists only **`confirmed`** slots for that **stage**.
- Interviews page: **"Awaiting confirmation"** tab for `proposed` slots + token age + **Resend** (respect rate limit).

**Interviewer (magic-link page):**

- No login. Job title + stage + times; **no** candidate name by default (§7).
- Confirm / Decline (+ optional reason on decline).
- Post-confirm copy: e.g. "Confirmed. You'll get details when a candidate books."

**Candidate:**

- Slot offer, confirmation, reminder, cancel, and re-propose use **WhatsApp primary / email fallback** (§8); web flow shows **full** slot list when WhatsApp shows only three quick replies.

**Deprecation:**

- Banner on legacy job-wide slot UI: stage-linked scheduling is preferred; legacy may be removed later.

### 11. Interviewer confirm UX and recruiter nudges (v1 all-or-nothing)

Because §6 is **confirm all or decline all** for the batch on the token:

- **Propose flow:** Nudge recruiters to send **2–3 high-confidence slots** per request (short helper text near batch create: e.g. fewer slots reduce decline-all churn).
- **Interviewer magic-link page:** Frame **Decline** as normal (“None of these work — we’ll ask for new times”), not punitive; optional reason reduces recruiter guesswork.
- **Post-decline:** Clear recruiter copy: “Interviewer declined; propose a new batch.”

## Out of scope (v2+)

- Panel interviews (`stage_interviewers` + per-person confirmation)
- Interviewer self-serve availability
- Calendar OAuth, free/busy, hard holds
- **v1:** Per-slot partial confirm/decline on one token (use **v1.1** — batched subset via checkboxes, single POST, same `slot_ids` model).
- Weekend-aware TTL (superseded by **72h** fixed TTL)
- Showing candidate name on magic-link page without org toggle
- **WhatsApp to interviewers** (any scheduling nudge on WA for external interviewers)

## Open questions

None for v1 — closed by this ADR.

## Tripwires — when to reopen v1 decisions

These are **concrete signals** to revise scope or write a follow-on ADR — not a roadmap. Ship v1, watch for fires, revisit when they trip.

| Signal                                                                                                                                      | Revisit                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **3+** customers (paying or serious pilot) ask for **panels** on one stage                                                                  | `stage_interviewers`, primary vs all-must-confirm, panel UX                                   |
| **5+** distinct **“interviewer double-booked themselves”** (or equivalent “slot was not actually free”) complaints in a rolling **30** days | Calendar **OAuth** / free-busy / **hard** holds — pick one documented approach                |
| WhatsApp **template rejected**, sustained **rate-limit**, or Meta blocks **UTILITY** sends for scheduling                                   | **Candidate channel:** email-first variant, alternate copy/templates, or fewer WA touchpoints |
| Recruiters **routinely** propose **5+** slots per batch (e.g. majority of batches over a month) **despite** §11 nudges                      | **v1.1** partial confirmation (per-slot checkboxes, one batched POST, same `slot_ids` model)  |
| Magic-link **abuse** or forwarded-link incidents **or** support volume on **expired / reused** tokens above informal threshold              | Shorter TTL, step-up verification, or logged-in interviewer path                              |
| **Legacy** `legacy_available` blocks adoption (orgs will not re-propose)                                                                    | Sunset / migration runbook with customer comms                                                |

When a row trips: update this ADR’s status, add a short “Revision YYYY-MM-DD” note at the top, or spawn a child ADR — avoid one-off code that contradicts v1 without recording the decision.

## References

- Current schema: [`supabase/schema/40_interview_scheduling.sql`](../../supabase/schema/40_interview_scheduling.sql)
- Current book route: [`src/app/api/jobs/[id]/interviews/book/route.ts`](../../src/app/api/jobs/%5Bid%5D/interviews/book/route.ts)
- Build execution: [`CURSOR-BUILD-interview-scheduling-v1.md`](./CURSOR-BUILD-interview-scheduling-v1.md)
