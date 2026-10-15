# WhatsApp Templates — Full HR Lifecycle

**Six “must create first” drafts** (exact names/params for Interakt): [WHATSAPP_INTERAKT_TEMPLATE_DRAFTS.md](./WHATSAPP_INTERAKT_TEMPLATE_DRAFTS.md).

All WhatsApp templates for TigerHire. Follows [Interakt template best practices](https://www.interakt.shop/resource-center/whatsapp-message-notification-template-guide/).

**Rules from Interakt guide:**

- **Name:** lowercase alphanumeric + underscores only (e.g. `th_shortlisted`)
- **Variables:** `{{1}}`, `{{2}}`, … sequential, no gaps, no special chars
- **Category:** UTILITY (transactional) or MARKETING (outbound campaigns). Note: Meta may re-categorize; check WhatsApp Manager. Current "Changed by Meta" → Marketing: `candidate_match_alert`, `waitlist_confirmation`, `th_profile_incomplete`, `th_recruiter_new_candidates` (see WHATSAPP_COST_MODEL.md).
- **Language:** English (en)
- **No shortened URLs** (no bit.ly etc.)
- **Enough static text** around variables — templates with mostly variables get rejected
- **Footer:** Optional but recommended
- **Buttons:** Optional but recommended (Quick Reply or URL)

**Code locations:**

- Interakt templates → `src/lib/services/whatsapp.ts`
- Meta templates → `src/lib/whatsapp/templates.ts`
- Interakt API → `POST https://api.interakt.ai/v1/public/message/`

---

## Interakt Templates — Copy-Paste Ready (18 total)

Open **Interakt Dashboard → Message Templates → Create Template** and fill each row. Language: **English (en)**, Header: **None** for all.

| #   | Template Name                 | Category  | Variables                                                                          | Body                                                                                                                                                                                                                                       | Footer                                  | Buttons                                     |
| --- | ----------------------------- | --------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------- |
| 1   | `tigerhire_session_expired`   | UTILITY   | {{1}} message text                                                                 | `Hey Hi, I am from TigerHire: {{1}}. Are we still connected`                                                                                                                                                                               | `Reply to continue the conversation`    | None                                        |
| 2   | `candidate_match_alert`       | UTILITY   | {{1}} candidateName, {{2}} matchCount, {{3}} topRole, {{4}} city                   | `Hi {{1}}, great news! {{2}} role(s) on TigerHire match your profile. Top match: {{3}} in {{4}}. Reply to this chat to apply or learn more.`                                                                                               | `TigerHire — AI-powered recruitment`    | Quick Reply: `Apply Now`                    |
| 3   | `candidate_profile_claimed`   | UTILITY   | {{1}} candidateName                                                                | `Hi {{1}}, your profile was claimed by a recruiter on TigerHire. Check the app for next steps.`                                                                                                                                            | `TigerHire — AI-powered recruitment`    | None                                        |
| 4   | `candidate_contact_unlocked`  | UTILITY   | {{1}} candidateName, {{2}} companyName                                             | `Hi {{1}}, {{2}} has unlocked your contact on TigerHire. They may reach out to you soon about an opportunity.`                                                                                                                             | `TigerHire — AI-powered recruitment`    | None                                        |
| 5   | `waitlist_confirmation`       | UTILITY   | {{1}} name                                                                         | `Hi {{1}}, you're on the TigerHire waitlist! We'll notify you as soon as your account is ready.`                                                                                                                                           | `TigerHire — AI-powered recruitment`    | None                                        |
| 6   | `th_shortlisted`              | UTILITY   | {{1}} candidateName, {{2}} jobTitle, {{3}} companyName                             | `Hi {{1}}, congratulations! You have been shortlisted for the {{2}} position at {{3}}. Our team will share next steps with you shortly. Reply here if you have any questions.`                                                             | `TigerHire — AI-powered recruitment`    | Quick Reply: `Thank you!`                   |
| 7   | `th_not_selected`             | UTILITY   | {{1}} candidateName, {{2}} jobTitle, {{3}} companyName                             | `Hi {{1}}, thank you for your interest in the {{2}} role at {{3}}. After careful review, the team has decided to move forward with other candidates at this time. We'll keep your profile active for future roles that match your skills.` | `TigerHire — AI-powered recruitment`    | None                                        |
| 8   | `th_offer`                    | UTILITY   | {{1}} candidateName, {{2}} companyName, {{3}} jobTitle                             | `Hi {{1}}, exciting news! {{2}} is extending an offer for the {{3}} position. Offer details have been sent to your email. Feel free to reply here with any questions.`                                                                     | `TigerHire — AI-powered recruitment`    | Quick Reply: `I accept!`                    |
| 9   | `th_interview_slots`          | UTILITY   | {{1}} candidateName, {{2}} jobTitle, {{3}} slot1, {{4}} slot2, {{5}} slot3         | `Hi {{1}}, a recruiter wants to interview you for {{2}}. Please pick a time that works for you:` `1. {{3}}` `2. {{4}}` `3. {{5}}` `Reply with 1, 2, or 3 to confirm.`                                                                      | `TigerHire — AI-powered recruitment`    | Quick Reply: `1` · `2` · `3`                |
| 10  | `th_interview_reminder`       | UTILITY   | {{1}} candidateName, {{2}} jobTitle, {{3}} interviewTime                           | `Hi {{1}}, this is a reminder that your interview for {{2}} is scheduled at {{3}}. Good luck! Reply here if you need to reschedule.`                                                                                                       | `TigerHire — AI-powered recruitment`    | Quick Reply: `I'll be there` · `Reschedule` |
| 11  | `recruiter_shortlist_ready`   | UTILITY   | {{1}} recruiterName, {{2}} roleName, {{3}} topScore, {{4}} candidateCount          | `Hi {{1}}, your FitScore shortlist for "{{2}}" is ready. Top candidate score: {{3}}/100. {{4}} candidate(s) shortlisted. View the full list in TigerHire.`                                                                                 | `TigerHire — AI-powered recruitment`    | None                                        |
| 12  | `th_sourcing`                 | MARKETING | {{1}} candidateName, {{2}} companyName, {{3}} jobTitle, {{4}} city, {{5}} ctcRange | `Hi {{1}}, {{2}} is hiring for {{3}} in {{4}}. CTC range: {{5}}. Interested? Reply YES to get started, or send your CV (PDF) to get a FitScore in 2 minutes.`                                                                              | `TigerHire — AI-powered recruitment`    | Quick Reply: `Yes, interested` · `Not now`  |
| 13  | `th_referral_drive`           | MARKETING | {{1}} employeeName, {{2}} companyName, {{3}} jobTitle, {{4}} referralLink          | `Hi {{1}}, {{2}} is looking for a {{3}}. Know someone great? Share this referral link with them: {{4}} Best`                                                                                                                               | `TigerHire — Employee Referral Program` | None                                        |
| 14  | `th_interview_rescheduled`    | UTILITY   | {{1}} candidateName, {{2}} jobTitle, {{3}} newTime                                 | `Hi {{1}}, your interview for {{2}} has been rescheduled to {{3}}. Reply here if this doesn't work for you.`                                                                                                                               | `TigerHire — AI-powered recruitment`    | Quick Reply: `Got it` · `Reschedule`        |
| 15  | `th_application_received`     | UTILITY   | {{1}} candidateName, {{2}} jobTitle, {{3}} companyName                             | `Hi {{1}}, your application for {{2}} at {{3}} has been received. We'll review your profile and get back to you shortly.`                                                                                                                  | `TigerHire — AI-powered recruitment`    | None                                        |
| 16  | `th_profile_incomplete`       | UTILITY   | {{1}} candidateName, {{2}} missingField                                            | `Hi {{1}}, your TigerHire profile is almost complete! Add your {{2}} to improve your FitScore and get better matches. Reply here if you need help.`                                                                                        | `TigerHire — AI-powered recruitment`    | Quick Reply: `Update now`                   |
| 17  | `th_recruiter_new_candidates` | UTILITY   | {{1}} recruiterName, {{2}} candidateCount, {{3}} roleName, {{4}} topScore          | `Hi {{1}}, {{2}} new candidate(s) matched your "{{3}}" role. Top FitScore: {{4}}/100. Check TigerHire to review.`                                                                                                                          | `TigerHire — AI-powered recruitment`    | None                                        |
| 18  | `th_reengagement`             | MARKETING | {{1}} candidateName, {{2}} newRoleCount                                            | `Hi {{1}}, {{2}} new role(s) have been posted on TigerHire since your last visit. Reply to see what's new or send your updated CV to refresh your FitScore.`                                                                               | `TigerHire — AI-powered recruitment`    | Quick Reply: `Show me` · `Not now`          |

---

## Meta Templates — Create in Meta WhatsApp Manager

Only needed if `WHATSAPP_PHONE_NUMBER_ID` is set. Go to **Meta Business Suite → WhatsApp Manager → Message Templates**.

| #   | Template Name           | Category | Variables                               | Body                                                                                                                         | Footer                               | Buttons                   |
| --- | ----------------------- | -------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------- |
| 19  | `tigerhire_consent_v1`  | UTILITY  | {{1}} consent text                      | `{{1}}`                                                                                                                      | None                                 | Quick Reply: `YES` · `NO` |
| 20  | `tigerhire_referral_v1` | UTILITY  | {{1}} candidateName, {{2}} referrerName | `Hi {{1}}, {{2}} referred you to a role on TigerHire. Reply YES to get started, or send your CV (PDF) to get your FitScore.` | `TigerHire — AI-powered recruitment` | Quick Reply: `YES`        |

---

## G. Session Messages (Free — No Template Needed)

These are **free-form messages** sent within the 24h window. No template approval needed.

| Trigger                                 | Message                                                                                            | Code location                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| New user (self)                         | "Hi! Welcome to TigerHire. Drop your CV (PDF) and get a FitScore against live roles in 2 minutes." | `handler.ts` → `handleNewUser()`              |
| New user (referred)                     | "Hi! {name} referred you to TigerHire. Drop your CV (PDF) and get a FitScore in 2 minutes."        | `handler.ts` → `handleNewUser()`              |
| CV requested                            | "Please send your CV as a PDF file."                                                               | `handler.ts`                                  |
| CV received                             | "Got your CV. Scoring now — takes about 2 minutes."                                                | `handler.ts` → `handleCVReceived()`           |
| CV error                                | "Sorry, we had trouble reading your CV. Please try sending it again as a PDF."                     | `handler.ts` → `handleCVReceived()`           |
| FitScore result                         | "Your FitScore: {score}/100. Top matches:\n1. Role at Company\n2. ..."                             | `scout.ts`                                    |
| Interview slots (in-window)             | "Hi {name}! Pick a time that works:\n1. Mon 10am\n2. Wed 1pm\n3. Fri 10am\nReply 1, 2, or 3."      | `scheduler.ts`                                |
| Interview confirmed                     | "Done! Your interview is booked for {datetime}. Good luck!"                                        | `scheduler.ts`                                |
| Interview reminder (in-window fallback) | "Reminder: Your interview for {role} is at {time}. Good luck, {name}!"                             | `cron/reminders`                              |
| STATUS reply                            | "Your applications:\n📩 Role A — applied\n✅ Role B — shortlisted\n..."                            | `handler.ts` → `sendApplicationStatusReply()` |
| MATCHES reply                           | "Check your matches at tigerhire.io — log in with your email."                                     | `handler.ts`                                  |
| PREFERENCES reply                       | "Set job preferences at tigerhire.io/candidate/profile"                                            | `handler.ts`                                  |
| Consent prompt                          | "Reply YES to consent to CV processing, or NO to opt out."                                         | `consent.ts`                                  |
| Opted out                               | "You have opted out. Reply 'DELETE MY DATA' to request data erasure."                              | `handler.ts`                                  |
| Data erasure                            | "Your data erasure request has been submitted. We will process it within 72 hours."                | `handler.ts`                                  |
| Referral flow                           | "Thanks! Please share the candidate's phone number."                                               | `referral-handler.ts`                         |

---

## Quick Reference — All 20 Templates

| #   | Template name                 | Platform | Category  | Variables                                                    | Buttons                        |
| --- | ----------------------------- | -------- | --------- | ------------------------------------------------------------ | ------------------------------ |
| 1   | `tigerhire_session_expired`   | Interakt | UTILITY   | {{1}} message                                                | None                           |
| 2   | `candidate_match_alert`       | Interakt | UTILITY   | {{1}} name, {{2}} count, {{3}} role, {{4}} city              | QR: Apply Now                  |
| 3   | `candidate_profile_claimed`   | Interakt | UTILITY   | {{1}} name                                                   | None                           |
| 4   | `candidate_contact_unlocked`  | Interakt | UTILITY   | {{1}} name, {{2}} company                                    | None                           |
| 5   | `waitlist_confirmation`       | Interakt | UTILITY   | {{1}} name                                                   | None                           |
| 6   | `th_shortlisted`              | Interakt | UTILITY   | {{1}} name, {{2}} role, {{3}} company                        | QR: Thank you!                 |
| 7   | `th_not_selected`             | Interakt | UTILITY   | {{1}} name, {{2}} role, {{3}} company                        | None                           |
| 8   | `th_offer`                    | Interakt | UTILITY   | {{1}} name, {{2}} company, {{3}} role                        | QR: I accept!                  |
| 9   | `th_interview_slots`          | Interakt | UTILITY   | {{1}} name, {{2}} role, {{3-5}} slots                        | QR: 1 · 2 · 3                  |
| 10  | `th_interview_reminder`       | Interakt | UTILITY   | {{1}} name, {{2}} role, {{3}} time                           | QR: I'll be there · Reschedule |
| 11  | `recruiter_shortlist_ready`   | Interakt | UTILITY   | {{1}} recruiter, {{2}} role, {{3}} score, {{4}} count        | None                           |
| 12  | `th_sourcing`                 | Interakt | MARKETING | {{1}} name, {{2}} company, {{3}} role, {{4}} city, {{5}} ctc | QR: Yes · Not now              |
| 13  | `th_referral_drive`           | Interakt | MARKETING | {{1}} empName, {{2}} company, {{3}} role, {{4}} link         | None                           |
| 14  | `th_interview_rescheduled`    | Interakt | UTILITY   | {{1}} name, {{2}} role, {{3}} newTime                        | QR: Got it · Reschedule        |
| 15  | `th_application_received`     | Interakt | UTILITY   | {{1}} name, {{2}} role, {{3}} company                        | None                           |
| 16  | `th_profile_incomplete`       | Interakt | UTILITY   | {{1}} name, {{2}} missingField                               | QR: Update now                 |
| 17  | `th_recruiter_new_candidates` | Interakt | UTILITY   | {{1}} recruiter, {{2}} count, {{3}} role, {{4}} score        | None                           |
| 18  | `th_reengagement`             | Interakt | MARKETING | {{1}} name, {{2}} roleCount                                  | QR: Show me · Not now          |
| 19  | `tigerhire_consent_v1`        | Meta     | UTILITY   | {{1}} consent text                                           | QR: YES · NO                   |
| 20  | `tigerhire_referral_v1`       | Meta     | UTILITY   | {{1}} name, {{2}} referrer                                   | QR: YES                        |

---

## HR Flow: Which Template Fires When?

```
Candidate Journey                      Template / Session Message
──────────────────────────────────     ──────────────────────────
1.  First message on WhatsApp     →   [Meta] tigerhire_consent_v1
2.  Replies YES                   →   [Session] "Welcome! Drop your CV..."
3.  Sends CV                      →   [Session] "Got your CV. Scoring..."
4.  FitScore ready                →   [Session] "Your FitScore: 82/100..."
5.  Picks a role (replies "1")    →   [Interakt] th_application_received ✉️
6.  Shortlisted by recruiter      →   [Interakt] th_shortlisted ✅
7.  Interview slots sent          →   [Interakt/Session] th_interview_slots 📅
8.  Picks slot (replies "2")      →   [Session] "Interview booked for..."
9.  Interview rescheduled         →   [Interakt] th_interview_rescheduled 🔄
10. 1hr before interview          →   [Interakt] th_interview_reminder ⏰
11. Offer extended                →   [Interakt] th_offer 🎉
11a. OR: Not selected             →   [Interakt] th_not_selected ❌
12. Types "STATUS"                →   [Session] Application status list
13. Profile incomplete nudge      →   [Interakt] th_profile_incomplete 📝
14. Re-engagement (inactive)      →   [Interakt] th_reengagement (MARKETING) 🔔

Recruiter side:
- FitScore batch complete         →   [Interakt] recruiter_shortlist_ready
- New candidates matched          →   [Interakt] th_recruiter_new_candidates

Sourcing / Referral:
- Sourcing campaign               →   [Interakt] th_sourcing (MARKETING)
- Referral drive to employees     →   [Interakt] th_referral_drive (MARKETING)
- Employee refers from app        →   [Meta] tigerhire_referral_v1
```

---

## Interakt Setup Instructions

1. Go to **Interakt Dashboard** → **Message Templates** → **Create Template**
2. For each template above:
   - **Template name:** Use the exact name from the table (e.g. `th_shortlisted`)
   - **Category:** Select as noted (UTILITY or MARKETING)
   - **Language:** English (en)
   - **Header:** Leave blank / None
   - **Body:** Copy the body text exactly, including `{{1}}`, `{{2}}` etc.
   - **Footer:** Add footer text if noted (recommended)
   - **Buttons:** Add Quick Reply buttons where noted
3. Submit for WhatsApp approval (usually 1-2 hours for UTILITY)
4. Once approved, templates are immediately usable via API

**Quick Reply buttons** are static — the text is defined in the template itself. No dynamic `buttonValues` needed in the API call, so existing code works without changes.
