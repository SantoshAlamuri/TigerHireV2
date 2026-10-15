# `sendTemplateMessage` / launch templates — Apr 24 inventory (updated)

**Rule:** `applicationId` on the `sendTemplateMessage` payload is forwarded to `logWhatsAppOutbound` so rows land in `wa_messages` and show in the application communications feed.

## P2: Launch paths wired for `applicationId` (where knowable)

| Path                                                 | How `applicationId` is supplied                                                                                                                                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Application received** (`th_application_received`) | `sendApplicationReceivedTemplate` in `public-apply.ts` after upsert: load `applications.id` for `candidate_id` + `job_id` and pass through. **Skipped** when `whatsappOptIn === false` or no phone.                                                                      |
| **Screening link** (`screening_questions`)           | `sendScreeningQuestionsTemplate` in `application-bridge.ts` when a row exists for `candidate_id` + `job_id`.                                                                                                                                                             |
| **Shortlist / reject / offer / interview**           | `notifyCandidateShortlisted`, `notifyCandidateRejected`, `notifyCandidateOffer`, interview helpers in `whatsapp.ts` accept `applicationId?`; **API route call sites** (`applications/[id]`, pipeline `candidates/[pcId]`, offer flows) pass the id when updating status. |
| **Public offer sign**                                | `offers/public/[token]/sign` paths pass `applicationId` where the offer is tied to an application.                                                                                                                                                                       |

## Optional / not application-scoped (intentional)

- **Vouch / OTP / referrer-only** messages (`vouch.ts`, `referrer-otp.ts`, some `referrer-notifications`) — no single `applications` row; often no `applicationId`.
- **Internal-only wrappers** in `whatsapp.ts` that are not part of the five launch candidate flows.

## Opt-in (apply)

- `applications.whatsapp_opt_in` (migration `20260424210000_applications_whatsapp_opt_in.sql`); public apply form sends `whatsappOptIn` and post-apply WhatsApp templates are suppressed when the candidate opts out.

Update this file when you add a new `sendTemplateMessage` or dedicated template wrapper.
