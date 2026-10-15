# Notification QA — test fixtures (email + WhatsApp)

Use this when you want **real sends** to **your** inboxes and phones on a **dev / staging / preview** Supabase project — not as a substitute for unit tests.

**Warning:** This creates real `auth.users` rows and application data. Do **not** run against a production database that holds customer data unless you are deliberately doing a controlled QA exercise and understand the blast radius.

---

## 1. What the seed script does

`scripts/seed-notification-fixtures.mjs` (with service role):

| Step                                                                                                                | Purpose                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ensures organisation **Finstack** exists                                                                            | Jobs need an org                                                                                                                                                                                                                                                                                 |
| Ensures two open jobs: **`[NotifyTest] Apply Flow — QA Engineer`** and **`[NotifyTest] Status Flow — QA Engineer`** | One is clean for the real apply trigger; one is pre-seeded for status/interview testing                                                                                                                                                                                                          |
| For each candidate you configure                                                                                    | Creates or resets auth user password, `profiles` (`candidate_pro`), `candidates`, a **clean apply path** on the apply-flow job, plus `applications` (`applied`) + `fit_scores` on the status-flow job, `saved_searches` (daily digest, `last_alerted_at` null), and `email_preferences` (all on) |
| Optional recruiter email                                                                                            | New `recruiter` user attached to Finstack                                                                                                                                                                                                                                                        |

It does **not** send any email or WhatsApp by itself — you trigger those through the app, APIs, or cron as below.

---

## 2. Configure your testers

### Option A — JSON (recommended)

In `.env.local` (or the shell) set **one** variable:

```bash
NOTIFICATION_TEST_FIXTURES='[
  {"email":"you.first@yourdomain.com","phone":"919876543210","fullName":"QA Alpha"},
  {"email":"you.second@yourdomain.com","phone":"919876543211","fullName":"QA Beta"},
  {"email":"you.third@yourdomain.com","phone":"919876543212","fullName":"QA Gamma"}
]'
```

- **Max 3** candidate entries.
- **`phone`**: digits only or with `+`; stored normalized as digits (e.g. `919876543210`) for consistency with WhatsApp session lookups.

### Option B — numbered env vars

```bash
NOTIFICATION_TEST_EMAIL_1=you.first@yourdomain.com
NOTIFICATION_TEST_PHONE_1=919876543210
NOTIFICATION_TEST_NAME_1=QA Alpha

NOTIFICATION_TEST_EMAIL_2=you.second@yourdomain.com
NOTIFICATION_TEST_PHONE_2=919876543211
NOTIFICATION_TEST_NAME_2=QA Beta
```

### Recruiter inbox (optional)

```bash
NOTIFICATION_TEST_RECRUITER_EMAIL=recruiter.you@yourdomain.com
NOTIFICATION_TEST_RECRUITER_NAME=QA Recruiter
```

### Password for created / updated users

```bash
SEED_DEMO_PASSWORD='YourStrongTempPassword'
```

If unset, the script uses `NotifyTest@2026`.

---

## 3. Run the seed

From the repo root (loads `.env.local` like other scripts):

```bash
node --env-file=.env.local scripts/seed-notification-fixtures.mjs
```

Or add to `package.json` if you prefer:

```bash
npm run seed:notify-fixtures
```

The script prints JSON with `userId`, `candidateId`, `applyJobId`, `statusJobId`, `applicationId`, etc., for debugging.

---

## 4. Environment checklist (dev / preview)

| Integration  | What to set                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Resend**   | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` on the same deploy that runs the app                                           |
| **WhatsApp** | `WHATSAPP_API_KEY`, webhook secret, templates per [WHATSAPP_TESTING_NEXT_STEPS.md](./WHATSAPP_TESTING_NEXT_STEPS.md) |
| **Cron**     | `CRON_SECRET` for `POST /api/cron/job-alerts` and interview reminder crons                                           |
| **App URL**  | `NEXT_PUBLIC_APP_URL` / base URL so links in emails point at your dev host                                           |

---

## 5. Manual test matrix (after seed)

Run these while logged in as the right persona. Use the **candidate** accounts for candidate-targeted emails; use an existing Finstack recruiter (or your **NOTIFICATION_TEST_RECRUITER_EMAIL** user) for recruiter actions.

| #   | Flow                                   | How to trigger                                                                                           | Expect                                                     |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | Candidate applies                      | Log in as a seeded candidate and apply to **`[NotifyTest] Apply Flow — QA Engineer`**                    | Real application gets created and confirmation email fires |
| 2   | Job alert digest                       | `POST /api/cron/job-alerts` with `Authorization: Bearer $CRON_SECRET`                                    | Candidate receives digest (saved search + open jobs)       |
| 3   | Application status                     | As recruiter: move the pre-seeded **status-flow** application to shortlisted / rejected / hired          | Email and WhatsApp go to the candidate                     |
| 4   | Interview booked / cancel / reschedule | Use interview booking APIs or dashboard for the pre-seeded **status-flow** application                   | Candidate gets interview notifications                     |
| 5   | In-app message email                   | Create conversation + send message as other party                                                        | Recipient email notification                               |
| 6   | Org invite                             | Invite a **disposable** address from team settings                                                       | Invite email                                               |
| 7   | Contact form                           | `POST /api/contact`                                                                                      | Internal email to hello@…                                  |
| 8   | WhatsApp inbound / outbound            | Message business number from each test phone; optional `POST /api/test-whatsapp` in **development** only | Templates + session messages per docs                      |

**FitScore “shortlist ready”** and other orchestrator emails depend on running the real scoring pipeline — not created by this seed alone. Use your normal shortlist/score flow after CV ingestion, or keep that as a separate manual test.

---

## 6. Cleanup

When finished:

- Delete or close the jobs **`[NotifyTest] Apply Flow — QA Engineer`** and **`[NotifyTest] Status Flow — QA Engineer`** from the dashboard, or remove rows via SQL if you prefer.
- Remove test `auth.users` for the test emails from the Supabase Auth UI if you do not need them anymore.

---

## 7. Example file (copy, don’t commit secrets)

See `docs/examples/notification-test-fixtures.env.example` for a template you can copy to `.env.local` and fill in locally (keep `.env.local` gitignored).
