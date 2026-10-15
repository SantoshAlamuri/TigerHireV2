# TigerHire Sprint 2 — Candidate Screening v1 (Cursor Handoff)

**Status:** Spec, ready to build
**Owner:** Sam (solo dev via Cursor)
**Target stack:** Next.js 14 (App Router), Supabase (Postgres + RLS), TypeScript, Tailwind, shadcn/ui
**External services:** Bolna AI (voice), WhatsApp Cloud API (already configured), Razorpay (billing — already in stack), Anthropic Claude Haiku 4.5 (summary extraction)
**Estimated effort:** 11 working days
**Repo location:** `/docs/specs/screening-v1.md` — reference from `.cursorrules`
**Depends on:** Jobs page v2 must be live (role_category classifier is reused here)

---

## 1. Context

We are building TigerHire's first screening pipeline. The system replaces the recruiter's first-round screening step — either fully (voice mode) or partially (WhatsApp mode) — and lands structured candidate intelligence in the recruiter's dashboard.

**The unifying principle: one pipeline, four modes.** Whether a candidate is screened by AI voice call, AI WhatsApp questionnaire, manually by the recruiter, or not screened at all — the data model, API contract, and dashboard UI are identical. Only the data source and billing implication differ.

**The product strategy this serves:**

- Base subscribers (₹25k/month) get **WhatsApp screening included** — every shortlisted candidate auto-answers a 5–7 question text questionnaire, structured summary lands in the dashboard. This is the default mode.
- Voice screening is a **paid add-on** at ₹99 per billable candidate (first 10/month free per tenant). Tenants toggle it on per-account; recruiters can override per-candidate.
- "No screening" remains a valid mode — recruiters can skip the auto-screen for specific candidates or roles.

**Three strategic decisions are locked. Do not negotiate during build:**

1. **WhatsApp screening is the default, not a fallback.** It must be a genuinely valuable product on its own. The voice mode is an upgrade, not a rescue.
2. **One unified `screening_jobs` table, `mode` field drives behavior.** No separate `voice_screening_jobs` and `whatsapp_screening_jobs`. The recruiter UI is identical across modes.
3. **Billing fires only on `mode = 'voice'` and only after `status = 'completed'`.** Failed calls, no-answers, and cancellations are never billed.

---

## 2. In Scope (this sprint)

- Schema migration: `screening_jobs` table + tenant settings columns
- WhatsApp screening pipeline (AI-led 5–7 question text questionnaire per role)
- Bolna voice integration (outbound calls, webhook handler, audio storage)
- LLM summary extraction (single prompt, works for both voice and text transcripts)
- Conversation scripts for 5 role categories (Backend, Frontend, Data/ML, Product, DevOps)
- Per-candidate recruiter overrides (switch mode, skip screening)
- Settings page with three-mode selector and usage meter
- Dashboard candidate card with mode-aware screening section
- Monthly billing cron with Razorpay line-item creation
- Compliance scaffolding: AI disclosure, recording consent, calling-hours guardrails

## Out of Scope (defer)

- Sales / Design / Finance conversation scripts (v1.1, after the 5 tech roles validate)
- Hindi / multilingual scripts (v1.1 — English-only for first launch)
- Inbound voice calls (v2)
- Live recruiter takeover mid-call (v2)
- Custom screening question editor in UI (recruiters get the role-default script; customization is v1.2)
- Tiered pricing (₹99 flat for v1; volume tiers when usage data justifies them)
- HuskyVoice / Tough Tongue / other voice providers (Bolna only for v1)

---

## 3. Data Model

### 3.1 Tenant settings additions

```sql
alter table tenants
  add column screening_default_mode text not null default 'whatsapp'
    check (screening_default_mode in ('off', 'whatsapp', 'voice')),
  add column voice_screening_enabled boolean default false,
  add column voice_screening_enabled_at timestamptz,
  add column voice_screening_free_credits_per_month int default 10,
  add column voice_screening_monthly_cap_inr numeric(10,2),  -- nullable; spend cap
  add column screening_fitscore_threshold int default 75
    check (screening_fitscore_threshold between 0 and 100),
  add column screening_calling_hours_start time default '10:00:00',  -- IST
  add column screening_calling_hours_end time default '19:00:00',    -- IST
  add column screening_auto_trigger boolean default true;             -- false = recruiter approves each one
```

### 3.2 The unified `screening_jobs` table

```sql
create table screening_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  req_id uuid not null references requisitions(id) on delete cascade,

  -- Mode determines behavior throughout the pipeline
  mode text not null check (mode in ('voice', 'whatsapp', 'manual', 'none')),

  -- State machine — see §6
  status text not null default 'queued'
    check (status in (
      'queued',           -- created, not yet started
      'awaiting_consent', -- WhatsApp sent / call scheduling DM sent; waiting for candidate
      'in_progress',      -- call ongoing OR questionnaire in flight
      'completed',        -- finished with usable data
      'no_response',      -- candidate didn't engage within SLA
      'failed',           -- technical failure (Bolna error, etc.)
      'cancelled',        -- recruiter cancelled before completion
      'skipped'           -- mode='none', no screening attempted
    )),

  -- Voice mode fields (nullable)
  bolna_call_id text,
  audio_url text,
  duration_seconds int,

  -- WhatsApp mode fields (nullable)
  whatsapp_thread_id text,
  whatsapp_message_count int,

  -- Shared fields (populated post-completion regardless of mode)
  transcript_url text,        -- both modes produce a transcript
  summary_json jsonb,         -- structured output from LLM extraction
  recommendation text check (recommendation in ('shortlist', 'reject', 'review', 'no_data')),

  -- Lifecycle timestamps
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Billing fields (only populated when mode='voice')
  billable boolean default false,
  billed_at timestamptz,
  cost_inr numeric(10,2),       -- our COGS for this call (Bolna + LLM)
  charge_inr numeric(10,2),     -- what we charge the tenant (₹99 or free)

  -- Recruiter overrides + audit
  triggered_by text check (triggered_by in ('auto', 'recruiter_manual')),
  overridden_from_mode text,    -- if recruiter changed mode, original mode logged here
  recruiter_id uuid              -- who triggered/overrode
);

create index sj_tenant_status_idx on screening_jobs(tenant_id, status);
create index sj_billing_idx on screening_jobs(tenant_id, billed_at)
  where billable = true and mode = 'voice';
create index sj_candidate_idx on screening_jobs(candidate_id);
create index sj_req_idx on screening_jobs(req_id);

-- RLS: standard tenant isolation
alter table screening_jobs enable row level security;
create policy screening_jobs_tenant_isolation on screening_jobs
  for all using (tenant_id = current_tenant_id());
```

### 3.3 Sync logs (extend existing or create)

If `sync_logs` from Sprint 1 doesn't already support non-job-sync operations, add a `pipeline` column:

```sql
alter table sync_logs add column if not exists pipeline text default 'jobs_sync';
-- New runs for this sprint use pipeline = 'screening_billing' for monthly billing cron
```

---

## 4. Mode Behaviors — The Core Contract

This table is authoritative. All UI and pipeline code derives behavior from `mode`.

| Behavior                    | `voice`                | `whatsapp`           | `manual`                   | `none`           |
| --------------------------- | ---------------------- | -------------------- | -------------------------- | ---------------- |
| Triggered automatically     | yes (if enabled)       | yes (default)        | no                         | no               |
| Candidate channel           | Phone call via Bolna   | WhatsApp text thread | None (recruiter handles)   | None             |
| Produces audio              | yes                    | no                   | optional                   | no               |
| Produces transcript         | yes                    | yes (chat log)       | optional                   | no               |
| Produces summary_json       | yes                    | yes                  | optional (recruiter notes) | no               |
| Billable                    | yes (after 10 free/mo) | never                | never                      | never            |
| Default for new tenants     | no                     | **yes**              | available always           | available always |
| Recruiter can override into | from any mode          | from any mode        | from any mode              | from any mode    |

---

## 5. Trigger Logic (auto-fire path)

When a candidate application is created and FitScore completes:

```
function onCandidateApplicationScored(application, fitscore) {
  if (fitscore < tenant.screening_fitscore_threshold) {
    // Below threshold — no screening, lands in "below threshold" bucket
    return;
  }

  if (!tenant.screening_auto_trigger) {
    // Recruiter wants to approve each one manually
    createScreeningJob({ mode: 'none', status: 'queued', triggered_by: 'auto' });
    notifyRecruiter('Candidate awaiting screening approval');
    return;
  }

  const mode = resolveMode(tenant, candidate, req);

  if (mode === 'voice') {
    if (overMonthlyCap(tenant)) {
      // Voice capped this month — fall through to WhatsApp
      createScreeningJob({ mode: 'whatsapp', ... });
      return;
    }
    createScreeningJob({ mode: 'voice', status: 'awaiting_consent' });
    sendWhatsAppCallSchedulingPrompt(candidate);
  } else if (mode === 'whatsapp') {
    createScreeningJob({ mode: 'whatsapp', status: 'awaiting_consent' });
    sendWhatsAppQuestionnairePrompt(candidate);
  } else {
    createScreeningJob({ mode: 'none', status: 'skipped' });
  }
}

function resolveMode(tenant, candidate, req): Mode {
  // Per-req override beats tenant default
  if (req.screening_mode_override) return req.screening_mode_override;
  return tenant.screening_default_mode;
}
```

**Calling hours guardrail:** If `mode === 'voice'` and current IST time is outside `tenant.screening_calling_hours_start` to `tenant.screening_calling_hours_end`, the WhatsApp scheduling prompt offers slots within the next available window only.

---

## 6. State Machine

```
queued
  │
  ├──[mode='none']────────────────────────────────────────► skipped (terminal)
  │
  └──[mode in (voice|whatsapp)]
        │
        ▼
   awaiting_consent
        │
        ├──[candidate replies positive, mode='voice']────► in_progress (Bolna initiates call)
        ├──[candidate replies positive, mode='whatsapp']─► in_progress (questionnaire begins)
        ├──[candidate replies negative]──────────────────► cancelled (terminal, not billable)
        ├──[24h no response]─────────────────────────────► no_response (terminal, not billable)
        │
        ▼
   in_progress
        │
        ├──[completed normally]──────────────────────────► completed (terminal, billable if mode=voice)
        ├──[technical failure: Bolna error, etc.]────────► failed (terminal, not billable)
        ├──[recruiter cancels mid-flight]────────────────► cancelled (terminal, not billable)
        │
        ▼
   completed
        │
        └─► triggers: summary extraction → dashboard update → billing flag set
```

**Recruiter override transitions allowed at any non-terminal state:**

- `awaiting_consent` or `in_progress` → recruiter clicks "Switch to manual" → status becomes `cancelled`, new job created with `mode='manual'`, `overridden_from_mode` field on new job logs the original mode
- `awaiting_consent` or `in_progress` → recruiter clicks "Skip screening" → status becomes `cancelled`, new job created with `mode='none', status='skipped'`

Override transitions never bill the cancelled job.

---

## 7. WhatsApp Screening Pipeline (default mode — build first)

### 7.1 Question script structure

Location: `lib/screening/scripts/whatsapp/{role_category}.ts`

Each script exports:

```typescript
export type WhatsAppScript = {
  role_category: RoleCategory;
  version: string; // semver — bump on edits, log version with each job
  greeting: string;
  consent_question: string;
  questions: WhatsAppQuestion[];
  closing: string;
};

export type WhatsAppQuestion = {
  id: string; // stable ID, used in summary_json
  text: string;
  expected_format?: "number" | "yes_no" | "free_text" | "enum";
  enum_values?: string[]; // for 'enum' format
  required: boolean;
  follow_up_if?: { matches: string | RegExp; ask: string }; // optional one-level follow-up
};
```

### 7.2 Backend role script (reference example — others follow same pattern)

```typescript
export const backendWhatsAppScript: WhatsAppScript = {
  role_category: "backend",
  version: "1.0.0",
  greeting:
    "Hi {candidate_name} 👋 Thanks for applying to {role_title} at {company_name}. " +
    "I'm an AI assistant — I'll ask a few quick questions to help the recruiter review your application faster. " +
    "Takes 3-4 minutes. Ready?",
  consent_question: "Reply YES to proceed, or SKIP to go straight to the recruiter queue.",
  questions: [
    {
      id: "notice_period_days",
      text: "What's your current notice period (in days)?",
      expected_format: "number",
      required: true,
    },
    {
      id: "current_ctc_lakhs",
      text: "Current CTC in lakhs (just the number, e.g. 18)?",
      expected_format: "number",
      required: true,
    },
    {
      id: "expected_ctc_lakhs",
      text: "Expected CTC in lakhs?",
      expected_format: "number",
      required: true,
    },
    {
      id: "location_preference",
      text: "Are you open to: 1) Onsite Bangalore, 2) Hybrid, 3) Remote-only? Reply 1, 2, or 3.",
      expected_format: "enum",
      enum_values: ["1", "2", "3"],
      required: true,
    },
    {
      id: "primary_stack",
      text: "What's your primary backend stack? (e.g. Python+Django, Node+Express, Java+Spring)",
      expected_format: "free_text",
      required: true,
    },
    {
      id: "system_design_example",
      text: "In 2-3 sentences, describe one backend system you've designed and shipped end-to-end.",
      expected_format: "free_text",
      required: true,
    },
    {
      id: "reason_for_change",
      text: "What's driving your job search right now?",
      expected_format: "free_text",
      required: false,
    },
  ],
  closing:
    "Thanks {candidate_name}! 🙏 Your responses are with the recruiter. We'll be in touch within 48 hours.",
};
```

### 7.3 Pipeline implementation

1. Tenant config + WhatsApp Cloud API → send `greeting` + `consent_question`
2. On positive consent (`/^yes/i` or thumbs-up reaction), status → `in_progress`, send Q1
3. On each candidate reply: validate against `expected_format`. If invalid, gentle reprompt once. If invalid twice, accept the freeform answer and move on.
4. After all required questions answered (or skipped after retries), send `closing`, status → `completed`
5. Trigger summary extraction (see §9)

**SLA:** If candidate doesn't reply within 24h at any question, status → `no_response`. Single nudge at the 6h mark: _"Still there, {name}? Take your time — your answers are saved."_

---

## 8. Voice Screening Pipeline (Bolna integration)

### 8.1 Bolna setup checklist (manual, before code)

1. Sign up at bolna.ai, get API key, set as `BOLNA_API_KEY` in Vercel
2. Configure outbound DLT registration through Bolna's onboarding (mandatory for Indian outbound voice — TRAI compliance)
3. Pick voice persona: production-grade Indian English voice (test 3 options, pick one)
4. Set webhook URL: `https://api.tigerhire.io/api/screening/voice/webhook`
5. Set webhook secret: `BOLNA_WEBHOOK_SECRET` in Vercel
6. Test with a call to your own phone before integrating

### 8.2 Voice script structure

Location: `lib/screening/scripts/voice/{role_category}.ts`

Voice scripts differ from WhatsApp scripts. Same intent, different shape — voice asks open-ended questions that require verbal fluency.

```typescript
export type VoiceScript = {
  role_category: RoleCategory;
  version: string;
  system_prompt: string; // the prompt Bolna agent uses (persona + flow)
  fallback_questions: string[]; // fixed questions if the LLM agent goes off-track
  max_duration_seconds: number; // hard cutoff, default 360 (6 min)
};
```

### 8.3 Backend voice script (reference)

```typescript
export const backendVoiceScript: VoiceScript = {
  role_category: "backend",
  version: "1.0.0",
  max_duration_seconds: 360,
  system_prompt: `
You are a professional AI recruiting assistant for {company_name}. You are calling {candidate_name} 
about the {role_title} role.

CALL FLOW (in order):
1. Greet warmly. State you are an AI assistant. Disclose the call is being recorded for the recruiter's review.
2. Confirm consent to proceed — if no, thank them and end the call.
3. Ask the following in conversational tone, ONE AT A TIME, waiting for each answer:
   - Current notice period
   - Current and expected CTC in lakhs
   - Location preference (onsite Bangalore / hybrid / remote)
   - Walk me through one backend system you designed and shipped end-to-end
   - What's your primary stack and what attracted you to it
   - Any reason you're looking to change roles
4. Ask if THEY have any questions about the role.
5. Close: thank them, confirm next step is recruiter review within 48 hours via WhatsApp.

RULES:
- Keep the candidate talking; do not lecture.
- If they ask a question you cannot answer (specific salary band, team size), say "the recruiter will cover that — let me make a note" and continue.
- If they seem rushed or stressed, offer to reschedule.
- Never make promises about hiring outcomes.
- End the call at any point if the candidate asks to stop.
  `,
  fallback_questions: [
    "What's your current notice period?",
    "What's your current and expected CTC in lakhs?",
    "Are you open to working from Bangalore — onsite, hybrid, or remote-only?",
    "Walk me through one backend system you've designed end-to-end.",
    "What's driving your job search right now?",
  ],
};
```

### 8.4 Bolna API integration (`lib/screening/voice/bolna.ts`)

```typescript
export async function initiateBolnaCall(params: {
  candidate_phone: string;
  candidate_name: string;
  company_name: string;
  role_title: string;
  script: VoiceScript;
  webhook_correlation_id: string; // our screening_job.id
}): Promise<{ bolna_call_id: string }> {
  // POST to https://api.bolna.ai/v1/calls
  // Body: agent config with interpolated system_prompt, target number, webhook callback
  // Return Bolna's call_id; persist to screening_jobs.bolna_call_id
}

export async function fetchBolnaCallArtifacts(bolna_call_id: string): Promise<{
  transcript: string;
  audio_url: string;
  duration_seconds: number;
  status: "completed" | "failed" | "no_answer";
}> {
  // GET from Bolna; called by webhook handler
}
```

### 8.5 Webhook handler

`POST /api/screening/voice/webhook`

1. Verify `X-Bolna-Signature` header against `BOLNA_WEBHOOK_SECRET`
2. Parse payload; extract `correlation_id` → look up `screening_jobs.id`
3. If status = `completed`:
   - Fetch transcript + audio via Bolna API
   - Upload audio to Supabase Storage (`screening-audio/{tenant_id}/{job_id}.mp3`)
   - Update `screening_jobs`: `transcript_url`, `audio_url`, `duration_seconds`, `ended_at`, status → `completed`
   - Trigger summary extraction (§9)
   - Set `billable = true`, `cost_inr = duration_minutes × 8` (rough COGS including LLM)
4. If status = `no_answer` or `failed`: update status accordingly, do not bill
5. Idempotent — webhook may fire twice; check existing status before updating

---

## 9. Summary Extraction (LLM, mode-agnostic)

Single function, runs after any `completed` job regardless of mode.

`lib/screening/extract-summary.ts`

```typescript
export async function extractScreeningSummary(job: ScreeningJob): Promise<SummaryJSON> {
  const transcript = job.transcript_url
    ? await fetchTranscript(job.transcript_url)
    : assembleWhatsAppTranscript(job.whatsapp_thread_id);

  const jdSummary = await getJobDescriptionSummary(job.req_id);

  const prompt = buildExtractionPrompt({
    role_title: job.req.title,
    role_category: job.req.role_category,
    jd_summary: jdSummary,
    transcript,
    mode: job.mode, // voice gets fluency/confidence scoring; whatsapp skips those
  });

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });

  return parseAndValidate(response.content[0].text);
}
```

### 9.1 Extraction prompt template

```
You are analyzing a recruitment screening {mode} transcript for the role: {role_title}.

The job requirements summary: {jd_summary}

Extract the following fields from the transcript below. If a field is not
mentioned or unclear, return null. Do not invent or infer beyond what was said.

Return JSON only, no commentary:
{
  "notice_period_days": <integer or null>,
  "current_ctc_lakhs": <number or null>,
  "expected_ctc_lakhs": <number or null>,
  "location_preference": "onsite" | "hybrid" | "remote" | "flexible" | null,
  "english_fluency": "high" | "medium" | "low" | "not_assessed",   // 'not_assessed' for whatsapp mode
  "technical_depth_signal": "strong" | "moderate" | "weak" | "not_assessed",
  "communication_clarity": "strong" | "moderate" | "weak" | "not_assessed",   // 'not_assessed' for whatsapp mode
  "confidence_signal": "high" | "medium" | "low" | "not_assessed",  // 'not_assessed' for whatsapp mode
  "red_flags": ["short flag", ...],
  "positive_signals": ["short signal", ...],
  "candidate_questions_raised": ["question 1", ...],
  "recommendation": "shortlist" | "reject" | "review" | "no_data",
  "recommendation_reason": "1-2 sentence explanation",
  "key_quote": "one verbatim quote from candidate that best captures fit signal (max 25 words)"
}

Transcript:
{transcript}
```

**Voice mode populates all signal fields. WhatsApp mode returns `not_assessed` for fluency / communication / confidence** — these require audio.

---

## 10. API Endpoints

### `POST /api/screening/trigger`

Internal — called by the application-scored hook. Creates a `screening_jobs` row and kicks off the pipeline based on resolved mode.

### `POST /api/screening/override`

Recruiter-facing — switches a non-terminal job to a different mode, or skips screening for a candidate.

- Body: `{ job_id, new_mode: 'voice' | 'whatsapp' | 'manual' | 'none', reason?: string }`
- Cancels existing job (no billing), creates new job with `triggered_by: 'recruiter_manual'`, `overridden_from_mode: <old_mode>`

### `POST /api/screening/voice/webhook`

Bolna callback. See §8.5.

### `POST /api/screening/whatsapp/reply`

WhatsApp Cloud API callback for candidate replies during active questionnaire. Advances state machine.

### `GET /api/screening/jobs/:id`

Returns full job with transcript URL, audio URL (signed), summary_json. RLS-enforced.

### `GET /api/screening/usage`

Tenant's current month: total jobs by mode, voice calls used, free credits remaining, accrued cost.

---

## 11. Frontend — Settings Page

Route: `/settings/screening`

### 11.1 Screening mode selector

```
┌─ Screening mode ─────────────────────────────────────────┐
│                                                          │
│  How should TigerHire screen new candidates by default?  │
│                                                          │
│  ○ Off                                                   │
│     No automated screening. Candidates land in your      │
│     queue with FitScore only.                            │
│                                                          │
│  ● WhatsApp screening (included)                         │
│     AI asks 5-7 questions on WhatsApp. Structured        │
│     summary lands in your dashboard. Free with plan.     │
│                                                          │
│  ○ Voice screening (₹99 per call)                        │
│     AI conducts a 5-min phone screen in English. Audio,  │
│     transcript, fluency signal. First 10 calls/month     │
│     free; ₹99 each after.                                │
│                                                          │
│  Trigger when FitScore ≥ [—75—] /100                    │
│  Calling hours (voice only): [10:00] – [19:00] IST       │
│  Monthly cap (voice only): ₹ [unlimited] or [——]         │
│  Auto-trigger: [ON] | recruiter approves each one        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 11.2 Usage meter (live)

```
┌─ This month's screening usage ──────────────────────────┐
│                                                          │
│  WhatsApp screenings: 134                                │
│  Voice calls: 23  (10 free + 13 billable)                │
│  Voice spend: ₹1,287 / unlimited                         │
│                                                          │
│  [View detailed log →]                                   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 12. Frontend — Candidate Card (Dashboard)

Single component, mode-aware rendering. Located at `components/candidates/CandidateScreeningCard.tsx`.

### 12.1 Visual states

**State: no screening yet (`mode='none'` or `status='queued'` for non-auto-trigger tenants)**

```
Screening: Not started
[Send WhatsApp questionnaire] [Voice screen — ₹99]
[Skip screening] [Schedule manually]
```

**State: screening in flight (`status in ('awaiting_consent','in_progress')`)**

```
Screening: In progress · WhatsApp mode · started 12 min ago
3 of 7 questions answered
[Switch to voice] [Cancel screening]
```

**State: completed**

```
Screening summary · WhatsApp mode · 8 min ago
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Notice: 30 days       │ English: not assessed
CTC: ₹18L → ₹24L      │ Technical depth: strong
Location: hybrid OK   │ Recommendation: Shortlist
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"Strong fundamentals on system design, salary in range,
 30-day notice acceptable"

Key quote: "I designed a queue-based ingestion system
            handling 2M events daily on AWS SQS..."

Red flags: none
Positive signals: relevant scale experience, clear comms

[View transcript] [Upgrade to voice screen — ₹99]
```

**State: completed, voice mode** — same card, with additional audio player and fluency/confidence pills.

**State: no_response / failed / cancelled**

```
Screening: Not completed (no_response after 24h)
[Retry WhatsApp] [Send voice call — ₹99] [Skip]
```

### 12.2 Behavior rules

- The action buttons at the bottom always reflect what the recruiter can do _next_ given the current state
- Mode changes mid-flight (via `/api/screening/override`) update the card optimistically; rollback on API error
- Audio playback uses signed URLs that expire in 15 minutes
- Transcript view opens in a side drawer, never replaces the candidate card

---

## 13. Billing Pipeline

### 13.1 Per-call cost & charge logic

On voice call completion in the webhook handler:

```typescript
const duration_minutes = Math.ceil(duration_seconds / 60);
const cost_inr = duration_minutes * 8; // ~₹6 Bolna + ~₹2 LLM/storage
const charge_inr = await calculateCharge(tenant_id); // see below
```

```typescript
async function calculateCharge(tenant_id: string): Promise<number> {
  const usedThisMonth = await countBillableVoiceJobsThisMonth(tenant_id);
  const freeCredits = tenant.voice_screening_free_credits_per_month;
  if (usedThisMonth < freeCredits) return 0;
  return 99;
}
```

### 13.2 Monthly billing cron

Vercel cron, 1st of each month at 02:00 IST:

```json
{ "path": "/api/billing/screening-monthly", "schedule": "30 20 1 * *" }
```

Handler:

1. Find all tenants with `voice_screening_enabled = true`
2. For each tenant, sum `charge_inr` from `screening_jobs` where `mode='voice'`, `status='completed'`, `billable=true`, `billed_at IS NULL`, and `completed_at` in previous month
3. If total > 0, create a Razorpay invoice line item: `"Voice screening — {month}: {N} billable calls × ₹99 = ₹{total}"`
4. Mark all those jobs `billed_at = now()`
5. Send recruiter an email: monthly usage summary with breakdown
6. Log to `sync_logs` with pipeline = 'screening_billing'

### 13.3 Spend cap enforcement

When `tenant.voice_screening_monthly_cap_inr` is set:

- Each new voice trigger calls `getMonthToDateSpend(tenant_id)`
- If next call's expected charge would exceed cap, fall through to WhatsApp mode and log `triggered_by: 'auto', overridden_from_mode: 'voice'`
- Email recruiter: "Voice screening cap reached for {month} — defaulting to WhatsApp until next month"

---

## 14. Compliance & Safety

Non-negotiable, code-level guardrails:

1. **AI disclosure**: Every voice call opens with "I'm an AI assistant" — enforced in script template, not optional
2. **Recording consent**: Every voice call confirms recording in the first 30 seconds — if candidate declines, call ends and status → `cancelled` (not billed)
3. **Calling hours**: Outbound calls blocked outside tenant's configured window; scheduler offers next-available slot
4. **DND scrubbing**: Before any voice trigger, check candidate's `do_not_call` flag in our DB. Bolna handles TRAI DND list scrubbing on their side, but we also track per-candidate opt-outs
5. **Opt-out**: Candidate reply of "STOP", "UNSUBSCRIBE", or "DO NOT CALL" sets `candidate.do_not_call = true` and cancels active screening
6. **Audio retention**: Audio files purged after 90 days; transcript retained indefinitely (for hiring decision audit)
7. **PII in logs**: Phone numbers and candidate names redacted in application logs; full data in `screening_jobs` only

---

## 15. Acceptance Criteria

Build is done when **all** of these are true:

1. New tenants default to `screening_default_mode = 'whatsapp'`, `voice_screening_enabled = false`
2. A candidate scoring above threshold auto-enters the WhatsApp screening pipeline within 60 seconds of FitScore completion
3. WhatsApp screening completes end-to-end for backend role on a test candidate, producing a valid `summary_json`
4. Toggling voice ON in settings exposes the voice option in the candidate card and triggers Bolna for newly-scored candidates
5. A real outbound Bolna call to Sam's phone completes, produces audio + transcript, and the summary lands in the dashboard
6. The candidate card looks visually correct in all 5 states: no-screening, in-progress, completed (whatsapp), completed (voice), failed
7. Recruiter override from voice to manual cancels the original job, creates a new manual job, and does NOT bill
8. Monthly billing cron runs successfully, only `mode='voice', status='completed', billable=true` jobs are billed, and the first 10 of the month are free
9. Spend cap triggers correctly when monthly accrual exceeds the cap; falls through to WhatsApp
10. Opt-out keywords ("STOP", "DO NOT CALL") cancel active screening and set `candidate.do_not_call = true`
11. RLS prevents cross-tenant access to `screening_jobs` rows
12. All 5 tech-role WhatsApp scripts and voice scripts ship (Backend, Frontend, Data/ML, Product, DevOps)
13. AI disclosure and recording consent are present in every voice call's first 30 seconds (test by listening to recordings)

---

## 16. Environment Variables

Add to `.env.local` and Vercel:

```
BOLNA_API_KEY=
BOLNA_WEBHOOK_SECRET=          # generate random 32-char
BOLNA_AGENT_ID=                # the persona/voice config created in Bolna dashboard
SCREENING_BILLING_CRON_SECRET= # protect the billing cron endpoint
# ANTHROPIC_API_KEY already set from Sprint 1 (used for summary extraction)
# WHATSAPP_CLOUD_API_TOKEN already set
# RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET already set
```

---

## 17. Build Order

Strict sequence. Do not parallelize until §10 contract is defined.

1. **§3 schema migration** — schema first, everything else depends on it (0.5 day)
2. **§7 WhatsApp pipeline** — default mode, build first to validate the entire flow without voice complexity (2 days)
3. **§9 summary extraction** — mode-agnostic, plug-in for WhatsApp first, voice will reuse (1 day)
4. **§12 candidate card UI** — build against WhatsApp completion data first; voice state machine extends the same component (2 days)
5. **§11 settings page** — three-mode selector + usage meter wired against the now-working WhatsApp pipeline (1 day)
6. **§8 Bolna voice integration** — bolts onto the proven WhatsApp foundation (1.5 days)
7. **§8.5 webhook handler** — once voice initiation works, complete the loop (0.5 day)
8. **§10 override endpoint** — recruiter overrides require all four modes wired (0.5 day)
9. **§13 billing cron** — last, because billing accuracy needs the rest correct (1 day)
10. **§15 acceptance test** — end-to-end with real Bolna call to Sam's phone, all 13 criteria verified (1 day)

**Total: ~11 working days** for the full feature, billing and compliance included.

---

## 18. Notes / Risks for Cursor

- **WhatsApp Cloud API rate limits**: Tenants with bursts (>50 candidates/hour) may hit Meta's rate ceilings. Add a queue with 1-msg-per-2-seconds throttling per tenant from day one.
- **Bolna webhook reliability**: Webhooks occasionally drop. Add a fallback poller: `GET /api/screening/voice/reconcile` runs every 10 min and reconciles `in_progress > 30 min` jobs by polling Bolna's GET endpoint.
- **Summary extraction failures**: If Claude returns invalid JSON twice in a row, save raw response, set `recommendation = 'no_data'`, surface in dashboard as "Manual review needed."
- **Don't fake voice signals on WhatsApp jobs**: english_fluency, communication_clarity, and confidence_signal must be `not_assessed` for `mode='whatsapp'`. The dashboard renders these as "—" not as "unknown" — empty state is the correct signal.
- **Don't add a script editor UI**: Recruiters cannot edit screening questions in v1. The role-default script is what they get. This keeps the model honest and avoids per-tenant prompt drift. Script customization is v1.2.
- **Override audit trail**: Every override writes both `overridden_from_mode` on the new job AND a log entry tying old_job_id → new_job_id. This is for recruiter trust ("show me everything that happened with this candidate") and billing disputes.
- **Test mode for Bolna**: Bolna has a sandbox that calls a test number instead of the real candidate. Use this in non-prod environments — guard with `process.env.NODE_ENV !== 'production'`.

---

_End of spec. Hand to Cursor with: "Read `/docs/specs/screening-v1.md` end to end. Execute Section 3 only (schema migration). Stop and confirm before continuing to Section 7."_
