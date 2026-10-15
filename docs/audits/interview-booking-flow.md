# Interview booking flow audit

**Brief:** 8 Phase B §B.1  
**Date:** 2026-05-17  
**Branch audited:** `dev` (post Brief 8 Phase A + Brief 9 Scope 1)  
**Scope:** End-to-end path from recruiter slot creation through candidate acceptance, calendar/notifications, status updates, and feedback. **No fix code in this document** — findings only.

---

## Product decision: ICS-first calendar (not a missing integration)

**ICS attachments via email are the intended production path**, not a half-built Google Calendar / Outlook API integration.

| Approach                          | Pros                                                                          | Cons                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **ICS in email (current)**        | No customer IT approval; works in every mail client; fits Indian SMB adoption | No server-side event ID; user must open attachment                                   |
| **Google / Outlook Calendar API** | True two-way sync, room links, updates                                        | Requires org-wide OAuth app approval — often **multi-week procurement per customer** |

OAuth calendar connections in Settings are **optional profile metadata** for future use. They must **not** gate booking. Server-side `calendar.events.create` is **out of scope** for Phase B unless product explicitly revisits the IT-procurement trade-off.

**Phase B.2 fix for calendar:** remove the mistaken recruiter-book gate that requires a connected provider (`book/route.ts`, `reschedule/route.ts`), not build Calendar API writes.

---

## Production usage snapshot (2026-05-17)

Queried production (`TigerHire` Supabase). Table is `interview_availability_slots` (not `interview_slots`).

| Metric                                           | Count |
| ------------------------------------------------ | ----- |
| Total slots                                      | 40    |
| `status = 'available'`                           | 40    |
| `status = 'booked'`                              | **0** |
| `pipeline_candidates.interview_scheduled_at` set | **0** |

**Implication:** No completed end-to-end bookings in production yet. Phase B.2 fixes are preventive; P0b notification UX can be chosen without migrating legacy booked rows.

---

## Flow overview

```mermaid
sequenceDiagram
  participant R as Recruiter
  participant API as TigerHire API
  participant DB as Postgres
  participant WA as WhatsApp
  participant Email as Resend
  participant C as Candidate

  R->>API: POST /jobs/{id}/availability (slots)
  API->>DB: interview_availability_slots (available)

  alt WhatsApp slot offer
    R->>API: POST request-interview
    API->>WA: th_interview_slots (1/2/3)
    C->>WA: reply 1|2|3
    WA->>API: scheduler handleSlotSelection
  else Self-serve link
    C->>API: POST schedule/self-serve/{token}/book
  else Recruiter dashboard book
    R->>API: POST interviews/book
  end

  API->>DB: th_book_interview_slot (booked + interview_scheduled_at)
  API->>Email: sendInterviewBooked + ICS to interviewer
  API->>WA: optional booked message
  Note over API,Email: ICS email to interviewer (intentional; no Calendar API)
```

---

## Step 1 — Slot creation

| Question              | Finding                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Code path exists?** | Yes                                                                                                                                    |
| **Entry points**      | `POST /api/jobs/[id]/availability` — `src/app/api/jobs/[id]/availability/route.ts`                                                     |
| **UI**                | `src/app/(dashboard)/recruit/jobs/[id]/interviews/page.tsx`, `CreateSlotsModal.tsx`                                                    |
| **DB**                | `interview_availability_slots` (`status`: `available` \| `booked`), optional `source` (`recruiter_manual` \| `interviewer_declared`)   |
| **Related (Phase A)** | `interviewer_availability_windows`, `GET/POST /api/me/availability`, recruiter pick from `GET /api/jobs/[id]/interviewer-availability` |
| **External systems**  | None at create time                                                                                                                    |
| **On failure**        | API returns 4xx/5xx + `logger.error`; UI shows `actionError`                                                                           |
| **Observability**     | Server logs only; no `interview_notification_attempts` row                                                                             |

**Notes:** Slots are owned by creating recruiter (`user_id`). Declared interviewer availability is advisory only until recruiter creates a bookable slot.

---

## Step 2 — Candidate acceptance

Three booking paths converge on `bookInterviewSlotAtomically` → RPC `th_book_interview_slot` (`supabase/migrations/20260428180000_interview_book_slot_atomic_rpc.sql`, `src/lib/interviews/book-slot-atomic.ts`).

### 2a — WhatsApp slot selection

| Question          | Finding                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Trigger**       | `POST /api/jobs/[id]/pipeline/request-interview` → `triggerSchedulerAgent`                                           |
| **Agent**         | `src/lib/agents/scheduler.ts` — loads ≤3 `available` slots, sends template via `onInterviewTransition("slots_sent")` |
| **Accept**        | Inbound `1`/`2`/`3` → `src/lib/whatsapp/handler.ts` → `handleSlotSelection`                                          |
| **External**      | Meta WhatsApp Graph (`sendInterviewSlotsTemplate`)                                                                   |
| **Gates**         | Dual recruiter+HM approval; feature flag `scheduler_agent`                                                           |
| **On failure**    | User-facing WA for conflict/booking errors; HTTP route may still return success if agent ran                         |
| **Observability** | `interview_notification_attempts` for `slots_sent`; `logger` in agent                                                |

### 2b — Public self-serve

| Question       | Finding                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------- |
| **UI**         | `src/app/(public)/schedule/[token]/page.tsx`                                                  |
| **API**        | `GET/POST /api/schedule/self-serve/[token]`, `.../book`                                       |
| **Core**       | `src/lib/interviews/self-serve-book.ts` — **explicitly skips** calendar/room/transcript gates |
| **On failure** | HTTP errors to UI; token claim reverted on book failure                                       |
| **Rate limit** | `checkRateLimit` on book route                                                                |

### 2c — Recruiter dashboard book

| Question       | Finding                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **API**        | `POST /api/jobs/[id]/interviews/book` — `src/app/api/jobs/[id]/interviews/book/route.ts`                                   |
| **Gates**      | Requires connected **calendar** + **room** (Daily/Zoom) + **transcript** (AssemblyAI/Deepgram) integrations (lines 63–118) |
| **On failure** | 400 if integrations missing; atomic book errors mapped to 4xx                                                              |

### 2d — Logged-in candidate portal

No dedicated candidate-dashboard slot picker found. Candidates use **self-serve link** or **WhatsApp**.

---

## Step 3 — Calendar invites (ICS-by-email, intentional)

| Question                             | Finding                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Intended delivery**                | **ICS attachment** on interviewer (and candidate) email — `buildInterviewInviteIcs` in `notifier.ts`; opens in local calendar              |
| **OAuth / settings (optional)**      | `google_calendar`, `outlook`, `teams` — profile integration only; **not required for booking**                                             |
| **Live calendar API (create event)** | **Not implemented by design** — avoids per-customer IT OAuth procurement (see product decision above)                                      |
| **Recruiter book gate (bug)**        | Dashboard book **incorrectly requires** calendar + room + transcript connections (`book/route.ts` 63–118); provider vars unused after gate |
| **Self-serve**                       | No integration gates — correct pattern (`self-serve-book.ts`)                                                                              |
| **Observability**                    | `interview_notification_attempts` with `channel: "ics"` when ICS email attempted                                                           |

**Severity: P0 (reframed)** — Gate is wrong, not integration. **Fix:** remove provider-connection requirement from recruiter book/reschedule; keep ICS path; treat OAuth as optional UI only.

---

## Step 4 — Notifications (email / WhatsApp)

| Question          | Finding                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| **Orchestrator**  | `src/lib/interviews/notifier.ts` — `onInterviewTransition(from, to, ctx)`                               |
| **State machine** | `src/lib/interviews/state-machine.ts` — `attended` / `no_show` defined; **no production callers** found |

### Transitions implemented

| Transition            | Candidate                        | Interviewer                   |
| --------------------- | -------------------------------- | ----------------------------- |
| → `slots_sent`        | WA template `th_interview_slots` | —                             |
| → `booked`            | Resend `sendInterviewBooked`     | Email + ICS; optional WA text |
| `booked` → `reminded` | Email + WA                       | Email + WA                    |
| → `rescheduled`       | Email + WA                       | Email + ICS + WA              |
| → `cancelled`         | Email + WA                       | Email + cancel ICS + WA       |

### Failure handling

| Path                                           | Behavior                                                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Recruiter `interviews/book`                    | Notifications in try/catch; **booking still succeeds**; `logger.warn` only (`book/route.ts` ~252–256) |
| Self-serve book                                | Same pattern — `logger.warn` (`self-serve-book.ts`)                                                   |
| Notifier internals                             | Per-channel `sent` \| `failed` \| `suppressed`; does not throw                                        |
| `interview_notification_attempts` insert fails | `logger.warn` only (`notification-log.ts`) — **silent to user**                                       |

### Reminders cron

| Item            | Finding                                                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route           | `GET /api/cron/interview-reminders` — `src/app/api/cron/interview-reminders/route.ts`                                                              |
| Logic           | Booked slots in next 24h, `reminder_sent_at IS NULL` on **slot** row                                                                               |
| Issue           | Sets `reminder_sent_at` even if email failed (comment ~line 113)                                                                                   |
| **vercel.json** | **Not listed** — only `interview-feedback-followups` cron present; reminders may be unscheduled in production unless configured manually in Vercel |

**External APIs:** Resend (email), Meta WhatsApp Graph.

---

## Step 5 — Status updates

| Event          | Slot (`interview_availability_slots`)          | Pipeline (`pipeline_candidates`)                                                               |
| -------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Book**       | `status=booked`, `pipeline_candidate_id` set   | `interview_scheduled_at`, `status=in_progress`, `reminder_sent_at=null`                        |
| **Cancel**     | `available`, PC cleared                        | `interview_scheduled_at` cleared — `cancel/route.ts`, RPC `th_cancel_interview_slot`           |
| **Reschedule** | Atomic swap via `th_reschedule_interview_slot` | `interview_scheduled_at` updated                                                               |
| **Reminder**   | `reminder_sent_at` on **slot** (cron)          | Column exists on PC too; book RPC clears PC `reminder_sent_at` — **dual-column inconsistency** |

### `interview_outcome`

Column exists on `pipeline_candidates` but **no write path** found in `src/` for showed/no_show/progressed/rejected. State machine `attended`/`no_show` is not wired to DB updates.

---

## Step 6 — Feedback collection

| Question            | Finding                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| **DB**              | `feedback_form_templates`, `feedback_responses` — `supabase/schema/41_interview_feedback.sql`                |
| **API**             | `POST /api/jobs/[id]/feedback` — inserts response, notifies recruiters                                       |
| **UI**              | Company/recruit interviews hubs, `InterviewerInterviewFeedbackActions`                                       |
| **Automated nudge** | `GET /api/cron/interview-feedback-followups` — **in `vercel.json`** (every 30 min)                           |
| **External**        | Resend for reminder emails                                                                                   |
| **Gap**             | Submitting feedback does **not** update `interview_outcome` or fire `onInterviewTransition("attended", ...)` |

---

## Observability summary

| Signal                               | Coverage                                                            |
| ------------------------------------ | ------------------------------------------------------------------- |
| `logger` (Sentry-adjacent)           | API routes, notifier, crons, scheduler                              |
| `interview_notification_attempts`    | Comms transitions only; service-role writes; RLS denies client read |
| User-visible booking errors          | Recruiter UI + self-serve page                                      |
| Calendar provider event ID           | **Not stored** — no provider create                                 |
| End-to-end “booking lifecycle” panel | **Does not exist** (Brief 8 §B.3)                                   |

---

## Priority findings for Phase B fixes (revised after product review)

### Approved for B.2 (pending P0b UX decision)

| ID        | Finding                                                                         | Fix                                                                     |
| --------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **P0a**   | Calendar/room/transcript **gate** blocks recruiter book without using providers | Remove gates; ICS-only booking like self-serve                          |
| **P0b**   | Notification failure after book returns HTTP 201                                | **Operator choice:** block book vs `delivery_failed` status — see below |
| **P1 #3** | `interview-reminders` not in `vercel.json`                                      | Add cron entry                                                          |

### Deferred

| ID    | Finding                               | Why defer                       |
| ----- | ------------------------------------- | ------------------------------- |
| P1 #4 | `reminder_sent_at` set on failed send | After cron is confirmed running |
| P1 #5 | Missing interviewer email hard-fail   | Lower urgency; 0 prod bookings  |
| P2    | `interview_outcome`, timezone parity  | Post-MVP                        |

### P0b — decision needed from operator

When critical notification (candidate email and/or interviewer ICS email) fails after DB book:

- **Option A — Block:** Roll back or never commit book; return 4xx/5xx to recruiter.
- **Option B — Book + flag:** Keep `status=booked` but set delivery state (e.g. slot metadata or notification log) and show recruiter **“Booked — invites failed, follow up manually.”**

**Recommendation with 0 prod bookings:** Option B is safer for ops (no lost slot holds) if recruiter sees failure clearly; Option A is stricter data integrity. Awaiting operator pick before B.2 code.

---

## Files reference (primary)

| Area               | Path                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Slot CRUD          | `src/app/api/jobs/[id]/availability/route.ts`                                                    |
| Book               | `src/app/api/jobs/[id]/interviews/book/route.ts`                                                 |
| Self-serve         | `src/lib/interviews/self-serve-book.ts`, `src/app/api/schedule/self-serve/[token]/book/route.ts` |
| WhatsApp scheduler | `src/lib/agents/scheduler.ts`, `src/lib/whatsapp/handler.ts`                                     |
| Atomic RPC         | `supabase/migrations/20260428180000_interview_book_slot_atomic_rpc.sql`                          |
| Notifications      | `src/lib/interviews/notifier.ts`, `src/lib/interviews/notification-log.ts`                       |
| Reminders cron     | `src/app/api/cron/interview-reminders/route.ts`                                                  |
| Feedback cron      | `src/app/api/cron/interview-feedback-followups/route.ts`                                         |
| Schema             | `supabase/schema/40_interview_scheduling.sql`, `41_interview_feedback.sql`                       |

---

_Phase B.2 implemented 2026-05-17: P0a gates removed, P0b delivery tracking + resend, P1 reminders cron in `vercel.json`. See `docs/product/decisions.md`._
