# Managing pipeline stages

Recruiters can define custom pipeline stages per job (e.g. Screen → Technical → Final) and assign an interviewer to each stage. Stages are used to track candidates and to schedule interviews.

## Where to manage stages

- From the **job** page: open a job and go to the pipeline or stages section.
- API: `GET /api/jobs/[jobId]/pipeline-stages` lists stages; `POST /api/jobs/[jobId]/pipeline-stages` creates or updates stages (body: `{ stages: [{ stage_name, stage_order, interviewer_email?, interviewer_name? }] }`).

## Creating or editing stages

1. Ensure you have recruiter, company admin, or hiring manager access to the job.
2. Send a **POST** request with a `stages` array. Each stage has:
   - **stage_name**: e.g. "Phone screen", "Technical interview"
   - **stage_order**: number for ordering (e.g. 1, 2, 3)
   - **interviewer_email** (optional): email used for calendar invites
   - **interviewer_name** (optional): display name
3. Existing stages are updated when you include their `id`; stages without `id` are created. Omitted stages are left unchanged (no automatic delete).

## Ordering

Stages are shown in ascending `stage_order`. Use 10, 20, 30 if you want to insert new stages between others later.

## Interview scheduling

When a candidate is moved into a stage that has an interviewer, you can book an interview from the availability slots for that job. The **Interview scheduling** feature uses these stages and the recruiter’s availability to offer time slots.

## See also

- [Withdrawing applications](./withdrawing-applications.md)
- API: `GET/POST /api/jobs/[id]/pipeline-stages`
