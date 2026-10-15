# Launch promise audit (living document)

**Purpose:** Single place to track _user-visible_ pass/fail for launch promises (per `ATS-LAUNCH-PLAN-JUNE-3` / `NEXT-STEPS-APR-24`).

_Repo work completed 2026-04-24_ does **not** replace a row in this table until a human has demo-tested the user-visible path.

| Promise                               | Code path / notes                                              | Status            | Demo tested (date) | Notes                                                                                                |
| ------------------------------------- | -------------------------------------------------------------- | ----------------- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| P1 E2E (post job → sign)              | Manual / script                                                | not tested        |                    |                                                                                                      |
| P2 WhatsApp (wa_messages + templates) | `lib/services/whatsapp`, webhooks, apply; `wa-messages-db`     | not tested        |                    | **DB:** tables applied 2026-04-24. **Still:** staging send → row.                                    |
| P3 FitScore (5 AC)                    | FitScore UI + scoring                                          | not tested        |                    |                                                                                                      |
| P4 Offers                             | Offers flow                                                    | not tested        |                    |                                                                                                      |
| P5 Self-schedule                      | `schedule/*`, `interviews/self-schedule-link`                  | not tested        |                    |                                                                                                      |
| P6 Referrals                          | Referral paths                                                 | not tested        |                    |                                                                                                      |
| P7 Inbox (WA + notes)                 | `ApplicationCommunicationsFeed`, communications API            | not tested        |                    |                                                                                                      |
| P8 Landing + signup                   | Marketing / public                                             | not tested        |                    |                                                                                                      |
| Pre-launch: SPF/Sentry/PostHog/…      | [PRE-LAUNCH-INFRA-CHECKLIST.md](PRE-LAUNCH-INFRA-CHECKLIST.md) | in progress (ops) |                    | **Code:** rate limits, secrets runbook, DPA page. **You:** DNS, Sentry/PostHog env, backups, uptime. |

**Status values:** not tested, pass, partial, fail, in progress (ops) / in progress (code) when only one side is done.

Update weekly; **do not** treat shipped infra alone as "pass" without a human demo walk.
