# WhatsApp Integration — Scalable Multi-Org Design & Steps

**Purpose:** Integrate WhatsApp with TigerHire so **many organisations** can share **different job specs**, **many people** can apply for **different roles**, in a **smart, scalable, efficient** way.

---

## 1. Current State (What You Already Have)

| Layer            | Status | Notes                                                                                                                        |
| ---------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Webhook**      | ✅     | Single `POST/GET /api/webhooks/whatsapp`; signature verification; rate limit per phone.                                      |
| **Sessions**     | ✅     | One row per phone in `whatsapp_sessions` (state + context). No org scoping.                                                  |
| **Flow**         | ✅     | new → consent → CV → Scout → scored → apply-by-number (1–N) → slot_selection / vouch / complete.                             |
| **Applications** | ✅     | Application is per job → per organisation; RLS and `job.organisation_id` enforce visibility.                                 |
| **Matches**      | ⚠️     | Scout scores candidate against **first 30 open jobs** (no ordering). FitScore results show top N (1–20) across **all orgs**. |
| **Outbound**     | ✅     | Interakt (session + templates); Meta for consent/referral. Single WhatsApp number.                                           |

So: **one WhatsApp number**, **one session per phone**, **applications correctly tied to job/org**. The main scaling and fairness gaps are in **which jobs** we score and show.

---

## 2. Scale Challenges (Many Orgs, Many Jobs, Many Applicants)

- **Job selection:** Today Scout uses `.eq("status", "open").limit(30)` with **no ordering**. With 100+ orgs and 1000+ jobs, 30 is arbitrary and can favour one org or be unfair.
- **Source awareness:** When a candidate comes from “Org A’s shared link” or a referral, we don’t store or use that; we can’t prioritise Org A’s jobs.
- **Efficiency:** Scoring one candidate against thousands of jobs synchronously in the webhook is slow and risky; we need a strategy (prioritised subset + optional async backfill).
- **Recruiter notifications:** WhatsApp to recruiters (e.g. shortlist ready) must stay **per-org** (only that org’s data). Your existing triggers are likely already scoped by job/org; keep it that way.
- **Idempotency & rate limits:** You already have per-phone rate limit and Scout messageId idempotency; keep these as traffic grows.

---

## 3. Target Architecture: Smart, Scalable, Multi-Org

### 3.1 Principles

1. **Single webhook, single number** — Keep one WhatsApp Business number and one webhook URL; route by session state and context (no per-org webhooks).
2. **Session stays per-phone** — One session per candidate phone; context can carry optional `source_organisation_id` or `campaign_id` when we know “where” they came from.
3. **Applications remain per-job, per-org** — No change; candidate picks role by number → application to that job → org sees it via RLS.
4. **Job selection is explicit and fair** — Replace “30 arbitrary open jobs” with a **prioritised, org-diverse** set and, at scale, **async scoring** for the rest.
5. **Recruiter WhatsApp** — Only send WhatsApp to recruiters for **their org’s** events (shortlist, new application); already implied by how you trigger notifications.

### 3.2 Job Selection Strategy (Scout)

- **Input:** Candidate id, optional `source_organisation_id` / `campaign_id` from session context (e.g. from shared link or referral).
- **Step 1 — Prioritised pool:**
  - If `source_organisation_id` is set: fetch that org’s open jobs first (e.g. up to 15), then fill up to a total cap (e.g. 30) with other orgs’ open jobs (e.g. ordered by `updated_at` desc, or round-robin by org).
  - If no source: build a **diverse** set: e.g. max 5–10 jobs per org, then by recency or “jobs that need candidates”, up to a total cap (e.g. 50–100).
- **Step 2 — Scoring:** Run FitScore for this candidate against this pool only (sync in webhook). Optionally enqueue a **background job** to score against more jobs (e.g. all open, or rest of open) and merge/notify later.
- **Step 3 — Top N:** From `fit_scores` for this candidate, take top N by score (e.g. 10–20), already limited by `TOP_MATCHES_LIMIT`. Show in WhatsApp with company name (you already do).

This gives: **source-aware prioritisation**, **org diversity**, **bounded sync work**, and optional **scale via async**.

### 3.3 Session Context (Optional but Recommended)

- Add to `whatsapp_sessions.context` when known:
  - `source_organisation_id` — e.g. when user lands from a job link that includes `?org=...` or from a referral tied to an org.
  - Optionally `campaign_id` or `job_id` (single job) for “apply to this role” deep links.
- Use in Scout to prioritise which jobs to score (as above). No schema change required; context is JSONB.

### 3.4 Shared Links (How Orgs “Share” Job Specs)

- **Today:** Candidates message your single WhatsApp number (or find it on site). No link context.
- **Target:** Shareable links that set context when the candidate later messages WhatsApp:
  - **Option A — Web bridge:** Page like `tigerhire.io/wa?org=ORG_ID` or `.../wa?job=JOB_ID`. Page shows “Message us on WhatsApp” + your number + short instructions. When they open WhatsApp and message, we don’t automatically get org/job; we could ask in first message (“Reply with the code: XYZ”) and map code → org/job in backend, then set context.
  - **Option B — Pre-fill from referral:** Referral flow already has referrer; if referrer is tied to an org, set `source_organisation_id` when creating the session for the referred candidate.
  - **Option C — Short code / QR:** Same as A: a code or QR that points to a page that shows your number and a “code” (e.g. ORG_SLUG); candidate sends first message; we could send a template asking “Reply with code XYZ to see roles from [Company]” and then set context from that code.
- Simplest first step: use **referral path** to set `source_organisation_id` when referrer has an org; then add a simple **landing page** with org (or job) in the URL and a “Reply with code X” flow to set context for non-referral.

### 3.5 Notifications (Recruiter / Candidate)

- **Candidate:** One thread per phone; matches and apply-by-number are already global (multi-org). No change.
- **Recruiter:** Any WhatsApp sent to recruiters (shortlist ready, new application) must be triggered from server with **org/job context** and only include that org’s data. Ensure all such triggers pass `organisation_id` or `job_id` and filter by it when building the message list.

### 3.6 Rate Limits and Performance

- Keep **per-phone** rate limit on webhook (e.g. 10/60s); add **global** or **per-org** limits if one org floods the system later.
- **Scout:** Keep idempotency by `whatsapp_message_id`; consider **queueing** Scout (e.g. push to a queue, return 200, process in worker) so webhook always returns quickly and scoring doesn’t block.

---

## 4. What You Should Do — Steps

### Phase 1 — Make WhatsApp Live and Correct (Current Behaviour)

1. **Env and webhook**
   - Set in production: `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_API_KEY`; optionally `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` if you use Meta for send/media.
   - In Interakt (or Meta): set **Callback URL** = `https://<your-domain>/api/webhooks/whatsapp`, **Verify token** = `WHATSAPP_WEBHOOK_SECRET`. Subscribe to **messages**.
   - Confirm GET verification works and POST receives messages (check logs).

2. **Templates**
   - In Interakt: create and approve templates listed in `docs/WHATSAPP_BUILD_AND_WORKFLOW_CONFIG.md` (§5.1) with same names and parameter order.
   - If you use Meta for consent/referral: create §5.2 templates in Meta.

3. **No extra inbound workflows**
   - Do **not** create separate Interakt workflows that handle the message first. Send **all** inbound messages to your single webhook URL so TigerHire controls state and 24h window.

4. **Test flow**
   - Run: new user → consent → CV (PDF) → wait for Scout → reply 1–N → confirm application created for the right job/org.

### Phase 2 — Smarter Job Selection (Scalable & Fair)

5. **Replace “30 arbitrary jobs” in Scout**
   - In `src/lib/agents/scout.ts`, replace the single `.from("jobs").eq("status", "open").limit(30)` with a **prioritised query**:
     - Read `source_organisation_id` from `input.session_context` (optional).
     - If present: (A) fetch that org’s open jobs (e.g. limit 15), (B) fetch other orgs’ open jobs (e.g. order by `updated_at` desc, limit 15–20, or max 2–3 per org for diversity). Combine and score.
     - If absent: fetch open jobs with **per-org cap** (e.g. max 5 per `organisation_id`) and a total cap (e.g. 50), ordered by `updated_at` desc.
   - Keep a single total cap (e.g. 50) so sync time stays bounded.

6. **Optional: env for caps**
   - Add env (or constants): e.g. `SCOUT_SOURCE_ORG_JOBS_LIMIT=15`, `SCOUT_OTHER_ORGS_JOBS_LIMIT=20`, `SCOUT_MAX_JOBS_PER_ORG=5`, `SCOUT_TOTAL_JOBS_CAP=50`. Use these in Scout instead of hardcoding.

### Phase 3 — Source Context (Org-Aware Flows)

7. **Session context**
   - When you have a “source” (referral from org, or code from landing), set `source_organisation_id` (and optionally `job_id`) in `whatsapp_sessions.context` before or when transitioning to CV flow. No DB migration; context is JSONB.

8. **Referral path**
   - When creating or updating session for a **referred** candidate, if the referrer has an `organisation_id` (profile or employer), set `context.source_organisation_id = referrer_organisation_id` so Scout prioritises that org’s jobs.

9. **Shared link / code (optional)**
   - Add a page e.g. `app/wa/[...slug]/page.tsx` or `app/apply/wa/page.tsx` that reads `org` or `job` from query. Show your WhatsApp number and a short “Reply with code: ABC123” instruction; store mapping code → org_id (or job_id) in DB or config. When the first message from that phone contains the code, set context and ask for CV. (Simpler variant: no code; just “Message us from this link” and set context when they message and you match by some other signal later; code is clearer.)

### Phase 4 — Scale and Resilience (Optional but Recommended)

10. **Queue Scout**
    - Move Scout execution off the webhook: in `handler.ts`, instead of calling `triggerScoutAgent` directly, push a job (e.g. to Vercel Queue, Inngest, or your queue) with `{ phone, document_id, session_context, whatsapp_message_id }` and return. Worker runs Scout. Ensures webhook always returns quickly and avoids timeouts with many jobs.

11. **Async backfill (optional)**
    - After Scout has scored the “prioritised” pool and sent the first WhatsApp with top matches, enqueue a job to score the same candidate against **remaining** open jobs (e.g. in batches). When done, upsert `fit_scores` and optionally send a follow-up WhatsApp (“We found more roles for you — reply MATCHES to see them”) or leave for “reply MATCHES” to show updated list. This gives full coverage at scale without slowing the first reply.

12. **Recruiter WhatsApp**
    - Audit all places that send WhatsApp to recruiters (shortlist ready, etc.). Ensure they filter by `organisation_id` / `job_id` so each org only sees its own data. Add tests or manual checks that a recruiter in Org A never receives another org’s info.

### Phase 5 — Observability and Limits

13. **Logging and metrics**
    - Log in Scout: `source_organisation_id`, number of jobs scored, time taken. Optionally metric for “matches sent per org” so you can see distribution.

14. **Rate limits**
    - If needed, add a global or per-org rate limit (e.g. max N new CVs per org per hour) to avoid one org overwhelming the system; implement in webhook or queue consumer.

---

## 5. Summary Table

| Area               | Current                                   | Target                                                  |
| ------------------ | ----------------------------------------- | ------------------------------------------------------- |
| Webhook            | Single URL, per-phone rate limit          | Same; optional queue for Scout                          |
| Sessions           | Per-phone, context has candidate_id, etc. | Add optional source_organisation_id / job_id in context |
| Job selection      | First 30 open jobs                        | Prioritised + org-diverse pool; optional async backfill |
| Applications       | Per job/org                               | Unchanged                                               |
| Shared links       | None                                      | Optional landing + code → set context                   |
| Recruiter WhatsApp | Per trigger                               | Explicitly scoped by org/job                            |

---

## 6. References

- Webhook and flow: `src/app/api/webhooks/whatsapp/route.ts`, `src/lib/whatsapp/handler.ts`
- Scout job fetch: `src/lib/agents/scout.ts` (lines ~235–240)
- Session context: `src/lib/whatsapp/sessions.ts`, `whatsapp_sessions.context`
- Application creation: `src/lib/whatsapp/application-bridge.ts`
- Config and templates: `docs/WHATSAPP_BUILD_AND_WORKFLOW_CONFIG.md`, `docs/INTEGRATION_SYSTEM_CHECK.md`

---

## 7. Confidence, Skills and “Close to Match” (Paid Service)

Jobs are shown **only** when they meet both:

- **Minimum confidence (overall FitScore)** — e.g. 60 or 70. Configurable via `FITSCORE_MIN_CONFIDENCE` (default 60).
- **Minimum skills match** — So we don’t surface jobs that hit the overall threshold on location/freshness alone. Terms like “SQL” appear in many roles (developer, QA, DBA); we require a real skills alignment. Configurable via `FITSCORE_MIN_SKILLS` (default 50); set to 0 to disable.

**Ordering:** Matches are ordered by **overall_score descending**, then **skills_score descending**, so the “closest to match” jobs appear first.

**Scorer prompt:** The FitScore AI is instructed to score Skills Match by **role context** (e.g. “SQL” for backend vs QA vs DBA), not just keyword match. See `src/lib/fitscore/scorer.ts`.

**Scout:** Runs for every CV and scores up to **SCOUT_JOBS_LIMIT** open jobs (default 50; env override, max 200). Jobs are selected by `updated_at` desc so recent roles are prioritised. Because this is a paid service, you can afford more API calls — increase `SCOUT_JOBS_LIMIT` and/or `FITSCORE_MIN_CONFIDENCE` (e.g. 70) for higher-quality, fewer but better matches.

| Env / constant            | Default | Purpose                                                                |
| ------------------------- | ------- | ---------------------------------------------------------------------- |
| `FITSCORE_MIN_CONFIDENCE` | 60      | Only show jobs with overall_score ≥ this.                              |
| `FITSCORE_MIN_SKILLS`     | 50      | Only show jobs with skills_score ≥ this (careful skillset match).      |
| `SCOUT_JOBS_LIMIT`        | 50      | Max open jobs Scout scores per CV (more = more cost, more candidates). |

---

## 8. Candidate Preferences (Show Relevant Opportunities)

Candidates can **set preferences** so only **relevant** opportunities are shown (location, remote, seniority, role type, salary range).

**Storage:** `candidate_preferences` table (one row per candidate). `preferences` jsonb: `preferred_locations[]`, `remote_preference` (remote | hybrid | onsite | any), `preferred_seniority[]`, `preferred_role_functions[]`, `salary_min_lpa`, `salary_max_lpa`.

**Scout:** When scoring jobs after a CV, we fetch the candidate’s preferences. The job list is **filtered** by these preferences (location match, `remote_allowed`, seniority, role_function, salary overlap). Only jobs that match are scored and then shown (subject to confidence/skills thresholds). If no jobs match preferences, the candidate gets a clear message and can update preferences or wait for new roles.

**In-app:** `GET/PATCH /api/candidates/me/preferences` — logged-in candidates can read/update preferences. Use this from a candidate **Profile** or **Preferences** page so they can set location, remote, salary, etc.

**WhatsApp:** Reply **PREFERENCES** (in `scored` or `complete` state) to get a link to the app to set preferences. Preferences are applied the **next** time they send a new CV (Scout uses the updated preferences).

**Code:** `src/lib/preferences/types.ts`, `job-query.ts`, `get-preferences.ts`; Scout calls `getCandidatePreferences` and `applyPreferencesToJobsQuery` before scoring.

---

## 9. Quick-Start Checklist (Copy This)

**To go live with WhatsApp (Phase 1):**

- [ ] Set env in production: `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_API_KEY` (+ optional `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`)
- [ ] In Interakt/Meta: Callback URL = `https://<your-domain>/api/webhooks/whatsapp`, Verify token = `WHATSAPP_WEBHOOK_SECRET`, subscribe to **messages**
- [ ] Create Interakt templates from `WHATSAPP_BUILD_AND_WORKFLOW_CONFIG.md` §5.1 (and Meta §5.2 if used)
- [ ] Do **not** add extra inbound workflows in Interakt — single webhook only
- [ ] Test: new user → consent → CV → Scout → reply 1–N → verify application for correct job/org

**To make it scale and fair (Phase 2):**

- [ ] In Scout: replace “30 open jobs” with SCOUT_JOBS_LIMIT (default 50), jobs by updated_at desc; optional source_organisation_id for org-prioritised pool
- [ ] Set FITSCORE_MIN_CONFIDENCE (e.g. 70) and FITSCORE_MIN_SKILLS (e.g. 50); matches ordered by overall then skills

**Candidate preferences:**

- [ ] Run migration `20250225170000_candidate_preferences.sql` so candidates can set preferences
- [ ] Add a Preferences (or Profile) UI that calls `GET/PATCH /api/candidates/me/preferences`; WhatsApp reply PREFERENCES points to `/candidate/profile`

**Optional later:**

- [ ] Set `source_organisation_id` in session context for referrals (and shared-link codes if you add that page)
- [ ] Queue Scout so webhook returns immediately; optional async backfill for more jobs
- [ ] Audit recruiter WhatsApp triggers to be strictly org-scoped
