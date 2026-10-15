# Interview management: roles and API access

This document summarizes **who can do what** for interview-related APIs and main dashboard routes. It reflects route guards in `src/app/api/jobs/[id]/**` as of the last audit; re-check handlers if behavior changes.

## Role shorthand

**Scheduling set** (used for availability, booking pipeline, scheduling helpers):

- `super_admin`
- `company_admin`
- `recruiter`
- `agency`
- `hiring_manager`

## API: scheduling and slots

| Capability                                    | Route(s)                                              | Allowed roles  | Notes                                                                                          |
| --------------------------------------------- | ----------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| List / manage availability                    | `GET`/`POST`/`DELETE` `/api/jobs/[id]/availability`   | Scheduling set |                                                                                                |
| Book slot                                     | `POST` `/api/jobs/[id]/interviews/book`               | Scheduling set | Also requires org integrations (calendar, room provider, transcription) configured per handler |
| Cancel booking                                | `POST` `/api/jobs/[id]/interviews/cancel`             | Scheduling set |                                                                                                |
| Reschedule                                    | `POST` `/api/jobs/[id]/interviews/reschedule`         | Scheduling set |                                                                                                |
| Calendar ICS                                  | `GET` `/api/jobs/[id]/interviews/ics`                 | Scheduling set |                                                                                                |
| Self-schedule link                            | `POST` `/api/jobs/[id]/interviews/self-schedule-link` | Scheduling set |                                                                                                |
| Request interview (scheduler / WhatsApp flow) | `POST` `/api/jobs/[id]/pipeline/request-interview`    | Scheduling set |                                                                                                |

## API: feedback

| Capability      | Route                            | Allowed roles                         | Notes                                                                                                                             |
| --------------- | -------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| List feedback   | `GET` `/api/jobs/[id]/feedback`  | Scheduling set only                   | `interviewer` is **not** included                                                                                                 |
| Submit feedback | `POST` `/api/jobs/[id]/feedback` | Scheduling set **plus** `interviewer` | For `interviewer`, extra checks apply: assigned stage interviewer must match the signed-in user’s email (see `feedback/route.ts`) |

## Dashboard UI (high level)

| Area                      | Typical path                                          | Roles with nav access (see `sidebar-nav-groups`)                                                    |
| ------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Company interviews / prep | `/company/interviews`, `/company/interview-prep`      | `interviewer`, `company_admin`, `hiring_manager`                                                    |
| Recruiter hiring workflow | `/recruit/interview-prep`, pipeline, jobs, candidates | `recruiter`, `company_admin`, `super_admin` (and other personas where routes are explicitly shared) |

Exact page access also depends on **middleware** (`src/proxy.ts`) and **job-level** checks (e.g. `assertJobAccess`).

## Tests

Unit tests for interview booking mock `createSupabaseAdmin()` because the book handler uses the service client for `pipeline_stages` and atomic RPC (`th_book_interview_slot`). See `tests/helpers/mock-interview-book-admin.ts`.
