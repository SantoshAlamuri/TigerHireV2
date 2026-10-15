# Screening v1 Tier 1 Validation Log

Use this as a **run log** (not a script). Fill each section before moving to the next checkpoint.

---

## TIER 1 #1 — WhatsApp Screening Live Validation

- Run date:
- Environment (local/preview):
- Test tenant/org ID:
- Test candidate ID:
- Test candidate phone:
- Test req ID:
- Tester:

### CHECKPOINT 1 — Trigger fires

- Time:
- SQL run:
  ```sql
  select id, mode, status, triggered_by, created_at
  from screening_jobs
  where candidate_id = '<test_candidate_id>'
  order by created_at desc
  limit 5;
  ```
- Expected: exactly 1 new row, `mode='whatsapp'`, `status='awaiting_consent'`, `triggered_by='auto'`
- Actual:
- Anomalies:

### CHECKPOINT 2 — WhatsApp greeting arrives

- Time of message receipt:
- Interpolation correct (no literal placeholders): YES / NO
- Message text quality notes:
- Anomalies:

### CHECKPOINT 3 — Consent + question flow

- Consent reply sent:
- Status after consent:
- Q1 answer sent:
- Q2 invalid-format probe answer sent:
- Reprompt received (once): YES / NO
- Q4 invalid-enum probe answer sent:
- Enum reprompt received (once): YES / NO
- Remaining answers completed: YES / NO
- Anomalies:

### CHECKPOINT 4 — Completion + summary persistence

- Time completion observed:
- SQL run:
  ```sql
  select status, summary_json, recommendation, ended_at
  from screening_jobs
  where id = '<screening_job_id>';
  ```
- Expected:
  - `status='completed'`
  - `summary_json` populated
  - voice-only fields in WhatsApp mode are `"not_assessed"`:
    - `english_fluency`
    - `communication_clarity`
    - `confidence_signal`
- Actual:
- Anomalies:

### CHECKPOINT 5 — Dashboard render

- Candidate card shows completed summary: YES / NO
- Transcript view works: YES / NO
- Unexpected UI/state mismatches:
- Anomalies:

### EDGE CASE PROBES (WhatsApp)

#### Probe A — Duplicate-trigger guard

- Action: apply twice / refresh flow
- SQL evidence:
- Expected: no duplicate active screening job
- Actual:
- Anomalies:

#### Probe B — Consent negative path

- Action: reply `no`/`skip` at consent
- Expected: status transitions to `cancelled`, no further questions
- Actual:
- Anomalies:

#### Probe C — STOP opt-out path

- Action: reply `STOP` mid-screening
- SQL checks:
  ```sql
  select id, do_not_call from candidates where id = '<test_candidate_id>';
  ```
  ```sql
  select id, status, ended_at
  from screening_jobs
  where candidate_id = '<test_candidate_id>'
  order by created_at desc
  limit 3;
  ```
- Expected:
  - candidate opt-out true
  - active screening cancelled
  - no further outbound screening messages
- Actual:
- Anomalies:

#### Probe D — Inactivity behavior

- 6h nudge observed once: YES / NO
- 24h timeout to `no_response`: YES / NO
- SQL evidence:
- Anomalies:

---

## TIER 1 #2 — Voice Screening Live Validation

- Run date:
- Environment (local/preview):
- Test tenant/org ID:
- Test candidate ID:
- Test candidate phone:
- Test req ID:
- Tester:

### PRE-FLIGHT

- `BOLNA_API_KEY` configured: YES / NO
- `BOLNA_AGENT_ID` configured: YES / NO
- `BOLNA_WEBHOOK_SECRET` configured: YES / NO
- Webhook URL publicly reachable: YES / NO
- Voice mode enabled for tenant: YES / NO
- Calling hours set:

### CHECKPOINT 1 — Voice mode trigger + consent prompt

- SQL run:
  ```sql
  select id, mode, status, triggered_by, created_at
  from screening_jobs
  where candidate_id = '<test_candidate_id>'
  order by created_at desc
  limit 5;
  ```
- Expected: `mode='voice'`, `status='awaiting_consent'`
- Actual:
- Consent prompt received:
- Anomalies:

### CHECKPOINT 2 — Call initiation

- Consent reply sent:
- SQL run:
  ```sql
  select id, status, bolna_call_id, started_at, scheduled_at
  from screening_jobs
  where id = '<screening_job_id>';
  ```
- Expected: `bolna_call_id` populated, `status='in_progress'` (or deferred with `scheduled_at` when outside hours)
- Actual:
- Anomalies:

### CHECKPOINT 3 — Call compliance + interaction quality

- AI disclosure in first 30s: YES / NO
- Recording consent asked in first 30s: YES / NO
- Off-script question handling quality:
- Candidate question handling quality:
- Anomalies:

### CHECKPOINT 4 — Webhook completion + artifacts

- Webhook received in logs: YES / NO
- Signature validation passed: YES / NO
- SQL run:
  ```sql
  select
    status,
    audio_url,
    duration_seconds,
    transcript_url,
    summary_json,
    billable,
    cost_inr,
    charge_inr
  from screening_jobs
  where id = '<screening_job_id>';
  ```
- Expected:
  - `status='completed'`
  - `audio_url`, `transcript_url`, `summary_json` populated
  - `billable=true`
  - `cost_inr=ceil(duration_seconds/60)*8`
  - `charge_inr` per free-credit policy
- Actual:
- Anomalies:

### CHECKPOINT 5 — Audio playback + signed URL expiry

- Audio plays in dashboard: YES / NO
- Signed URL fails after expiry window: YES / NO
- Anomalies:

### EDGE CASE PROBES (Voice)

#### Probe A — No-answer path

- Action: do not pick up
- Expected: `status='no_response'`, `billable=false`
- Actual:
- Anomalies:

#### Probe B — Recruiter cancel mid-flight

- Action: cancel during in-progress state
- Expected: `status='cancelled'`, `billable=false`
- Actual:
- Anomalies:

#### Probe C — Recording consent denial

- Action: deny consent on call
- Expected: call ends, status `cancelled`, no billable charge
- Actual:
- Anomalies:

#### Probe D — Free-credit boundary

- Setup: seed/complete 10 voice jobs this month
- 11th call charge expected: `charge_inr=99`
- SQL evidence:
- Actual:
- Anomalies:

---

## FINDINGS SUMMARY

### Launch blockers found

-

### High-risk issues found

-

### Cosmetic issues found

-

### Deferred to v1.1

-

### Ship decision recommendation

- [ ] Ready for pilot demos
- [ ] Fix blockers first

### Sign-off

- Reviewer:
- Date:
