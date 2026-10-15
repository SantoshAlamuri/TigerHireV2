# Cursor Prompt — WhatsApp CV Flow (Practical MVP)

> **Scoring (2026-05-18):** Product paths use `src/lib/whatsapp/fitscore-routing.ts` → `FitScoreService` (hybrid v2), not `computeFitScore`. See [`principles/scoring-entrypoints-current.md`](./principles/scoring-entrypoints-current.md).

## Context

TigerHire uses WhatsApp (via Interakt) as an inbound channel for candidates.
Currently, when a CV is dropped, Scout bulk-scores up to 50 jobs — too expensive and wrong UX.
We are replacing this with two deliberate lanes based on whether inbound context exists.

The existing relevant files are:

- `whatsapp_sessions` table — `session_state` + `context` JSONB already exist; extend the state machine (do not assume a greenfield schema)
- `candidate_preferences` table — single `preferences` JSONB row per candidate (field mapping in **Schema changes** below)
- `src/lib/agents/scout.ts` — CV pipeline, job query, `FitScoreService.computeSingle` loop (Scout path)
- `src/lib/whatsapp/fitscore-routing.ts` — canonical WhatsApp scoring wrapper
- `src/lib/whatsapp/handler.ts` — inbound routing; `src/app/api/webhooks/whatsapp/route.ts` — webhook entry

---

## What to build (in order)

### Step 1 — Persist job_id / campaign_id in session context (Lane A)

When a candidate sends a CV in response to a campaign or job link, the inbound
webhook payload will contain a referral parameter or template button payload
(e.g. `job_id`, `campaign_id`, or a job slug in the message body).

- Read `job_id` or `campaign_id` from the inbound webhook payload
- Persist it to `whatsapp_sessions.context` as `{ job_id: "...", source: "campaign" }`
- In the Scout/FitScore trigger, check if `session.context.job_id` is present
- If yes: run `scoreWhatsAppJobForCandidate` ONLY for that job (or campaign's job list, max 3)
- If no: proceed to Step 2 (preference Q&A)
- Reply on WhatsApp with: role title, FitScore verdict, and a single CTA

Do NOT run bulk Scout scoring when `job_id` is present in context.

---

### Step 2 — Preference Q&A state machine (Lane B)

When a CV arrives with no context (cold drop), trigger a Q&A flow instead of scoring.

**Session state (extend, don’t replace):** `whatsapp_sessions.session_state` and `context` already exist (`new`, `awaiting_consent`, `cv_requested`, `scored`, vouch/slot/referral states, etc. — see `src/lib/whatsapp/sessions.ts`). Add new values for this flow and wire them in `handleInboundMessage` without breaking existing transitions:

```
collecting_preferences | preferences_complete | active_alerts | expired
```

(Reuse existing `opted_out` where applicable; existing `cv_received` is already used as a processing state — name new states clearly to avoid clashes, or track Q&A step in `context` if that is simpler.)

Ask the following questions in sequence, one per reply:

1. "What type of role are you looking for?" (e.g. Scrum Master, Backend Engineer)
2. "Which city or are you open to remote?" (e.g. Bangalore, Mumbai, Remote)
3. "How many years of experience do you have?"
4. "What is your expected salary range? (in LPA)"
5. "What is your notice period?"

- Each answer should be saved incrementally to `candidate_preferences`
- After all 5 answers are collected, set `session_state = preferences_complete`
- Confirm to the candidate: "Got it! We'll match you to relevant roles."
- Then immediately trigger Step 3

---

### Step 3 — Immediate match on preference completion

Right after `session_state` transitions to `preferences_complete`:

- Query open jobs filtered using the same dimensions as stored prefs (map to `preferred_role_functions`, locations/remote, seniority, salary range — see `src/lib/preferences/` and `applyPreferencesToJobsQuery`)
- Cap the candidate **job list** at 10 before FitScore (do not use full `SCOUT_JOBS_LIMIT` bulk scoring for this path)
- Run `computeFitScore` for each — keep only those above the strong-match threshold
- Surface the top 3 matches to the candidate via WhatsApp
- Message format:
  ```
  We found 3 roles that match your profile:
  1. [Title] at [Company] — [City] — FitScore: X
  2. ...
  3. ...
  Reply with a number to get more details or apply.
  ```
- If no strong matches found: reply "No strong matches right now — we'll notify you as roles open."
- Set `session_state = active_alerts` and store `alerts_expires_at = now + 6 months`

---

### Step 4 — on_job_published event trigger

When a job's status transitions to `open` or `published`:

- Fire a background job (use existing queue / Supabase edge function pattern)
- Query `candidate_preferences` / join candidates whose **JSON `preferences`** match the new job (role function, location/remote, seniority — same dimensions as Step 3)
  - Only include candidates where `session_state = active_alerts` AND `alerts_expires_at > now`
- For each matched candidate, run `computeFitScore(candidate.cv, job)`
- If score >= strong-match threshold: send WhatsApp alert via Interakt
- Rate-limit: max 1 alert per candidate per 24 hours (avoid flooding if many jobs publish at once)

---

### Step 5 — 6-month expiry and re-engagement (defer until Steps 1–4 are stable)

- Cron job runs daily, finds candidates where `alerts_expires_at < now + 7 days`
- Send re-engagement template: "Are you still looking for a job? Reply YES to continue alerts."
- If YES received: extend `alerts_expires_at` by 6 more months
- If no reply in 7 days: set `session_state = expired`

---

## Schema changes needed

```sql
-- whatsapp_sessions: session_state + context already exist (see supabase/schema/16_whatsapp_sessions.sql).
-- Add only what is missing for alerts:
ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS alerts_expires_at TIMESTAMPTZ;

-- Optional: column or table for Step 4 rate limit, e.g. last_whatsapp_job_alert_at on candidates or whatsapp_sessions
```

**`candidate_preferences` (production shape):** Table exists with `candidate_id` PK and **`preferences` JSONB** — not separate columns for role/location/seniority. Map spec concepts to `src/lib/preferences/types.ts` (`CandidateJobPreferences`):

| Spec / Q&A concept  | Store in JSON (extend types if needed)                              |
| ------------------- | ------------------------------------------------------------------- |
| Role type           | `preferred_role_functions` (and/or free-text in a new optional key) |
| City / remote       | `preferred_locations`, `remote_preference`                          |
| Years of experience | map to `preferred_seniority` or add e.g. `experience_years`         |
| Salary (LPA)        | `salary_min_lpa`, `salary_max_lpa`                                  |
| Notice period       | add e.g. `notice_period_days` to the JSON schema                    |

Use service-role upsert from WhatsApp for candidates without `user_id` (already supported by RLS design).

---

## Guardrails

- Never run bulk Scout scoring (SCOUT_JOBS_LIMIT) when `session.context.job_id` is present
- Never send more than 1 WhatsApp alert per candidate per 24 hours
- Always gate FitScore notifications behind the strong-match threshold (align with `FITSCORE_MIN_CONFIDENCE` / `FITSCORE_MIN_SKILLS` in `src/lib/whatsapp/constants.ts` and `fitscore-notify.ts`)
- STOP / PAUSE keyword handling is done by Interakt natively — do not re-implement in code
- Do not build the weekly digest cron until the event trigger (Step 4) is working
