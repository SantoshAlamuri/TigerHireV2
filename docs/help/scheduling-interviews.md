# How to schedule interviews

**Companion (UI locations + email/acceptance):** [interview-scheduling-flow.md](./interview-scheduling-flow.md).

Recruiters can set their availability per job and book candidates into time slots. Interviews are linked to pipeline candidates so you can track who is scheduled when.

## Overview

1. **Set your availability** – Add time slots when you’re free for interviews for a given job.
2. **Book a candidate** – Assign a pipeline candidate to one of the available slots.
3. **Reschedule or cancel** – Change or cancel a booked interview when needed.

## Prerequisites

- You must have recruiter (or company admin / hiring manager) access to the job.
- The job should have **pipeline stages** set up (see [Managing pipeline stages](./managing-pipeline-stages.md)). Candidates are moved into the pipeline when shortlisted; you then book them into a slot for a specific stage.
- Ensure the **interview scheduling** migration has been run on your Supabase project so the `interview_availability_slots` table exists (see your deployment notes or the archived [APRIL_2ND_LAUNCH_TASK_TRACKER.md](../archive/2026-q1-q2/APRIL_2ND_LAUNCH_TASK_TRACKER.md) for the original rollout plan).

## Setting availability

- **API**: `POST /api/jobs/[jobId]/availability`  
  Body: `{ "slots": [ { "start_at": "<ISO datetime>", "end_at": "<ISO datetime>", "timezone": "Asia/Kolkata" } ] }`  
  You can send multiple slots in one request. Each slot must have `end_at` after `start_at`. Default timezone is `Asia/Kolkata` if omitted.

- From the **recruiter UI**: Use the Schedule or Interviews section for the job (if available) to add blocks of time. Slots are stored per job and linked to your user.

## Viewing available slots

- **API**: `GET /api/jobs/[jobId]/availability?from=<ISO date>&to=<ISO date>`  
  Returns only slots with status `available` in the given date range. Defaults to “now” to “now + 14 days” if `from`/`to` are omitted.

- Use the same date range in the **Calendar** or **Booking** UI to see which slots are still free.

## Booking an interview

1. Identify the **pipeline candidate** (the row in the pipeline for this job + candidate).
2. Choose an **available slot** for that job.
3. **API**: `POST /api/jobs/[jobId]/interviews/book`  
   Body: `{ "slot_id": "<slot uuid>", "pipeline_candidate_id": "<pipeline_candidate uuid>" }`  
   This marks the slot as booked and sets `interview_scheduled_at` on the pipeline candidate.

- From the **UI**: In the booking flow, select the candidate and then a slot; confirm to book. The candidate’s record will show the scheduled time.

## Rescheduling

- **API**: `POST /api/jobs/[jobId]/interviews/reschedule`  
  Body: `{ "slot_id": "<currently booked slot id>", "new_slot_id": "<new available slot id>" }`  
  The old slot is freed and the candidate is moved to the new slot.

- From the **UI**: Open the booked interview and choose “Reschedule”, then pick a new slot.

## Cancelling a booked interview

- **API**: `POST /api/jobs/[jobId]/interviews/cancel`  
  Body: `{ "slot_id": "<booked slot id>" }`  
  The slot becomes available again and the candidate’s `interview_scheduled_at` is cleared.

- From the **UI**: Open the booked interview and choose “Cancel interview”.

## Notifications and calendar (planned)

- **Email notifications** and **WhatsApp reminders** for candidates and recruiters are on the roadmap.
- **Google Calendar integration** is planned so slots can sync with your calendar.

## See also

- [Managing pipeline stages](./managing-pipeline-stages.md) – Define stages and assign interviewers.
- [Withdrawing applications](./withdrawing-applications.md) – Candidate withdrawal flow.
