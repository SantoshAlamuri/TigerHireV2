# Interview scheduling: where to do it and how it works

**Companion (availability + book steps):** [scheduling-interviews.md](./scheduling-interviews.md).

This guide explains **where** you schedule candidate interviews, **how the interviewer's email** is set, and **how acceptance/confirmation** is recorded.

---

## 1. Where can I schedule candidate interviews?

You can schedule in **two places**; both are under the **Recruiter** dashboard for a specific job.

### Option A: Dedicated "Interviews" tab (in-app booking)

| Step | Where to go                                        | What you do                                                                                                  |
| ---- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1    | **Recruit** → **Jobs** → open a job                | Click the job title                                                                                          |
| 2    | Job detail page → **Interview scheduling** section | You see a short summary and a link to add slots / book                                                       |
| 3    | **Interviews** tab                                 | Go to **Interviews** (in the job's sub-nav or from the job page link: `.../recruit/jobs/[jobId]/interviews`) |

**URL pattern:** `/recruit/jobs/[job-id]/interviews`

On the **Interviews** page you can:

- **Create slots** – "Create Slots" (single time range or batch: date range, start/end time, duration, weekdays only).
- **See all slots** – Available and booked, with filters (All / Available / Booked).
- **Book a candidate** – Click "Book" on an available slot → choose a pipeline candidate → confirm. That slot is then marked **Booked** and the candidate gets an email (if they have an email on file).
- **Cancel** – Cancel a booked slot to free it again.
- **Add to calendar** – After booking, use "Add to Calendar" (ICS, Google, Outlook).

So: **the tab you use to schedule candidates in-app is the "Interviews" tab for that job** (`/recruit/jobs/[id]/interviews`).

### Option B: Job detail page (quick book from slots list)

On the **job detail** page, in the **Interview scheduling** section, you see:

- A list of **available slots** (next 14 days).
- An **"Add slots"** form (start/end datetime).
- For each slot, a **"Book"** button that opens a dropdown to pick a **pipeline candidate**. Choosing one books that slot for that candidate.

So you can also schedule from the **job detail** page without opening the full Interviews tab; the flow is the same (pick slot → pick candidate → book).

---

## 2. How is the interviewer's email given?

The **interviewer is defined per pipeline stage**, not per slot. Slots are "for the job"; the **stage** says who the interviewer is.

| Step | Where                               | What to do                                                                                                                                       |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | **Recruit** → **Jobs** → [your job] | Open the job                                                                                                                                     |
| 2    | **Pipeline stages**                 | Click **"Pipeline stages"** (e.g. in the job's actions/tabs). URL: `/recruit/jobs/[job-id]/pipeline-stages`                                      |
| 3    | Edit stages                         | For each stage (e.g. "Phone screen", "Technical"), set: **Stage name**, **Order**, and optionally **Interviewer email** and **Interviewer name** |
| 4    | Save                                | Save the stages                                                                                                                                  |

- **Interviewer email** – Used for calendar invites and context (e.g. WhatsApp scheduler can use it). It's the email of the person conducting that stage.
- **Interviewer name** – Display only.

So: **the interviewer's email is set in Pipeline stages** for that job (`/recruit/jobs/[id]/pipeline-stages`). You must have at least one stage (often the first one) to use scheduling; the "first" stage by order is used when no stage is specified.

---

## 3. How is acceptance recorded and confirmed?

There are **two flows**. Acceptance/confirmation is recorded differently in each.

### Flow 1: In-app booking (Interviews tab or job page)

| What happens                                                         | Where it's recorded                                                                                                                                                        |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recruiter clicks **Book** on a slot and selects a pipeline candidate | 1. **interview_availability_slots**: `status` → `booked`, `pipeline_candidate_id` set.<br>2. **pipeline_candidates**: `interview_scheduled_at` set to the slot start time. |
| Candidate receives email                                             | `sendInterviewBooked` sends an email (if candidate has email). No "acceptance" step in-app; booking = confirmed.                                                           |
| Recruiter can add to calendar                                        | ICS download or Google/Outlook links for the same slot.                                                                                                                    |

So in this flow, **acceptance = the recruiter's booking action**. There is no separate "candidate accepted" state; once you book, the slot is confirmed and the candidate is notified by email.

### Flow 2: WhatsApp scheduler (request interview)

| Step | What happens                                                                                                                                                                                 | Where it's recorded                                                                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Recruiter triggers "Request interview" for a candidate (e.g. from approvals or pipeline). API: `POST /api/jobs/[id]/pipeline/request-interview` with `candidateId` (and optional `stageId`). | Candidate must be in **pipeline_candidates** for that job. **Shortlist approvals**: both recruiter and hiring manager must have approved (shortlist_approvals).                                             |
| 2    | **Scheduler agent** sends the candidate a WhatsApp message with **3 time options** (e.g. "Reply 1, 2, or 3").                                                                                | **whatsapp_sessions**: state `slot_selection`, context has `slots`, `job_id`, `stage_id`, `candidate_id`.                                                                                                   |
| 3    | Candidate replies **1**, **2**, or **3** on WhatsApp.                                                                                                                                        | **handleSlotSelection** (scheduler agent): updates **pipeline_candidates** → `interview_scheduled_at` = chosen slot time, `status` = `in_progress`. Sends WhatsApp confirmation. Session set to `complete`. |

So in this flow, **acceptance = the candidate's WhatsApp reply (1/2/3)**. That reply is processed by the WhatsApp webhook → scheduler agent, which updates `pipeline_candidates.interview_scheduled_at` and sends a confirmation message. There is no separate "interviewer accepted" record; the **interviewer** is determined by the **stage** (and its interviewer email) you used when requesting the interview.

---

## 4. End-to-end: recommended order for first-time setup

1. **Create the job** (Recruit → Jobs → create or open job).
2. **Add pipeline stages** (Pipeline stages tab): at least one stage, with **Interviewer email** (and name) set for the person who will run the interview.
3. **Add candidates to the pipeline** (e.g. from shortlist/approvals, or by adding to pipeline_candidates). Ensure **recruiter + hiring manager approval** if you plan to use "Request interview" (WhatsApp).
4. **Create availability slots**
   - Either on **Interviews** tab: "Create Slots" (single or batch),
   - Or on **job detail** page: "Add slots" form.
5. **Schedule the candidate**
   - **In-app:** Interviews tab (or job page) → pick an available slot → Book → select the pipeline candidate. Confirmation is immediate; candidate gets email if available.
   - **WhatsApp:** Use "Request interview" for that candidate (and stage). Candidate gets 3 options on WhatsApp; when they reply 1/2/3, their choice is saved as `interview_scheduled_at` and they get a confirmation message.

---

## 5. Quick reference

| Question                                         | Answer                                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Which tab do I use to schedule?**              | **Interviews** tab for the job: `/recruit/jobs/[job-id]/interviews`. You can also book from the job detail page's Interview scheduling section.                                 |
| **Where do I set the interviewer's email?**      | **Pipeline stages** for that job: `/recruit/jobs/[job-id]/pipeline-stages` → set **Interviewer email** (and name) on the relevant stage.                                        |
| **How is in-app booking "acceptance" recorded?** | Booking = confirmation. Slot is marked `booked`, `pipeline_candidates.interview_scheduled_at` is set, and the candidate gets an email.                                          |
| **How is WhatsApp acceptance recorded?**         | Candidate replies 1, 2, or 3. Webhook + scheduler agent update `pipeline_candidates.interview_scheduled_at` and send a confirmation; no separate "interviewer accepted" record. |

---

## See also

- [Managing pipeline stages](./managing-pipeline-stages.md)
- API: `GET/POST /api/jobs/[id]/availability`, `POST /api/jobs/[id]/interviews/book`, `POST /api/jobs/[id]/pipeline/request-interview`
