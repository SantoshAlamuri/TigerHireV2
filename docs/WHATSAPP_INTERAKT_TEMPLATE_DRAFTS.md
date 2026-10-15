# WhatsApp Interakt Templates — Drafts for All 6 Messages

**Full catalog (18+):** [WHATSAPP_RESPONSE_TEMPLATES.md](./WHATSAPP_RESPONSE_TEMPLATES.md) — this file is only the **six** with exact Interakt names and param order for first-time setup.

Create these **6 templates** in Interakt with the **exact template name** and **parameter order** below. Use language **English (en)**. WhatsApp uses `{{1}}`, `{{2}}`, etc. for variables (Interakt may show them as placeholders when you create the template).

---

## 1. tigerhire_session_expired

**When TigerHire uses it:** When the 24-hour messaging window has expired and the app needs to send a reply (any follow-up message becomes this template).

**Body parameters (in order):** 1 variable

- **{{1}}** = message text (TigerHire sends up to 200 characters)

**Draft body (copy into Interakt):**

**Recommended (Meta often accepts this mix of static + variable):**

```
This is TigerHire — your recruiting assistant. {{1}}

If you have questions, just reply in this chat.
```

The app still passes **one** body parameter: the same dynamic sentence(s) you used before, now after the static opener so the template is not “only a variable”.

**Minimal (single variable, if your BSP requires it):**

```
{{1}}
```

_Explanation:_ TigerHire can pass the full line(s) in `{{1}}` (e.g. "Reply with the number of the role you want (1 to 10)…" or "Check your matches at https://tigerhire.io") as the only parameter.

**Short static prefix (alternative one-param pattern):**

```
Message from TigerHire: {{1}}
```

---

## 2. candidate_match_alert

**When TigerHire uses it:** To notify a candidate that jobs match their profile (e.g. from a job-alert or match workflow).

**Body parameters (in order):** 4 variables

- **{{1}}** = candidate name
- **{{2}}** = match count (number as string, e.g. "5")
- **{{3}}** = top role title (e.g. "Senior Backend Engineer")
- **{{4}}** = city (e.g. "Bangalore")

**Draft body (approved-style utility copy, enough static text around variables):**

```
Hi {{1}}, you have new role matches on TigerHire. We found {{2}} job opening(s) that look relevant based on your profile. Your best match so far: {{3}} in {{4}}. Reply in this thread if you would like to shortlist a role, or type MATCHES to see a fresh list with links.

— TigerHire
```

**Footer (optional, if your BSP has a separate footer field):** `tigerhire.io — AI hiring OS`

**Button (optional URL, if you use a URL button; must be full app URL, no shorteners):** e.g. “Open TigerHire” → `https://tigerhire.io/…` (or your domain).

---

## 3. recruiter_shortlist_ready

**When TigerHire uses it:** To notify a recruiter that the FitScore shortlist for a role is ready.

**Body parameters (in order):** 3 variables

- **{{1}}** = role name (e.g. "Backend Engineer")
- **{{2}}** = top FitScore (number as string, e.g. "85")
- **{{3}}** = candidate count (number as string, e.g. "12")

**Draft body:**

```
Your FitScore shortlist is ready in TigerHire for the role: {{1}}. The top candidate in this batch scored {{2}} out of 100, and {{3}} candidate(s) are on the list for review. Open the TigerHire app to view ranked profiles, notes, and next-step actions. Reply STOP if you no longer want these alerts.
```

**Footer (optional):** `Recruiting on TigerHire`

---

## 4. candidate_profile_claimed

**When TigerHire uses it:** When a recruiter has “claimed” a candidate profile (if that feature triggers WhatsApp).

**Body parameters (in order):** 1 variable

- **{{1}}** = candidate name

**Draft body:**

```
Hi {{1}}, a verified recruiter on TigerHire has claimed your profile for an active search. This helps them keep your details on file for a specific process—nothing is shared with employers you did not opt into. Open the TigerHire app to see who claimed you and the suggested next step.
```

---

## 5. candidate_contact_unlocked

**When TigerHire uses it:** When a recruiter unlocks a candidate’s contact (e.g. to reach out).

**Body parameters (in order):** 2 variables

- **{{1}}** = candidate name
- **{{2}}** = company/organisation name

**Draft body:**

```
Hi {{1}}, {{2}} can now see your contact details in TigerHire to continue this hiring process. They may email or call you using the information you already shared. If this was not expected, open the app and check your message thread with the TigerHire team.
```

---

## 6. waitlist_confirmation

**When TigerHire uses it:** When someone joins the waitlist and we send confirmation via WhatsApp.

**Body parameters (in order):** 1 variable

- **{{1}}** = name (TigerHire sends the person’s name or "there" if unknown)

**Draft body:**

```
Hi {{1}}, thanks for joining the TigerHire waitlist. We are onboarding teams in batches. You are confirmed on the list—we will message you when your workspace is ready, with a short link to get started. No action needed from you right now. Reply WAITLIST if you want a copy of this confirmation.
```

---

## Quick reference table

| Template name              | # of body vars | Parameter order (what TigerHire sends)   |
| -------------------------- | -------------- | ---------------------------------------- |
| tigerhire_session_expired  | 1              | message text (≤200 chars)                |
| candidate_match_alert      | 4              | candidateName, matchCount, topRole, city |
| recruiter_shortlist_ready  | 3              | roleName, topScore, candidateCount       |
| candidate_profile_claimed  | 1              | candidateName                            |
| candidate_contact_unlocked | 2              | candidateName, companyName               |
| waitlist_confirmation      | 1              | name (or "there")                        |

---

## Tips for creating in Interakt

1. **Names:** Use the template names **exactly** as in the table (e.g. `tigerhire_session_expired`, not `tigerhire session expired`).
2. **Language:** Set language to **English (en)**.
3. **Body only:** These drafts use **body** only; no header or button parameters in the code. If you add a header or buttons in Interakt, the code would need `headerParams` or `buttonParams`; for now keep it body-only to match the code.
4. **Variable order:** The order of `{{1}}`, `{{2}}`, etc. in the template must match the order in the table. TigerHire sends `bodyParams` in that order.
5. **Submit for approval:** After creating, submit for WhatsApp/Meta approval so the templates are usable.

Once approved, TigerHire will be able to send these templates when the 24h window is over or when triggering match/shortlist/claim/unlock/waitlist flows.

---

## Employee referral: when an employee refers and the candidate applies via that link

When an **employee** refers a candidate from the app (e.g. “Refer a friend” with the candidate’s name and phone), TigerHire:

1. Creates an **employee referral** record.
2. Sends the **candidate** a WhatsApp message using the **tigerhire_referral_v1** template (Meta Graph API).
3. When the candidate later **replies on WhatsApp** (e.g. “Hi” or sends their CV), TigerHire treats them as referred and sends consent with **tigerhire_consent_v1** using the “referred” copy, then continues to CV → FitScore → apply.

These two templates are sent via **Meta’s API** (not Interakt), so you create them in **Meta WhatsApp Manager** (Message Templates) if you use that for referral/consent. They use the same variable order as below.

---

### 7. tigerhire_referral_v1 (Meta – employee referral invite)

**When TigerHire uses it:** Right after an employee refers a candidate from the app (POST /api/employees/refer). We send this to the candidate’s phone to invite them to apply.

**Body parameters (in order):** 2 variables

- **{{1}}** = candidate name
- **{{2}}** = referrer name (employee who referred them)

**Draft body:**

```
Hi {{1}}, {{2}} referred you to a role on TigerHire. Reply to this message with YES to get started, or send your CV (PDF) to get your FitScore against live roles.
```

---

### 8. tigerhire_consent_v1 (Meta – consent before CV)

**When TigerHire uses it:** For any new user messaging WhatsApp for the first time. We send consent; they reply YES or NO. Two variants (same template, different text in {{1}}):

- **Self sign-up:** “Welcome to TigerHire. Reply YES to consent to CV processing or NO to opt out.”
- **Referred:** “You have been referred to TigerHire. Reply YES to consent or NO to opt out.”

**Body parameters (in order):** 1 variable

- **{{1}}** = the consent message text (one of the two lines above)

**Draft body:**

```
{{1}}
```

So the template body is a single variable; TigerHire fills it with the appropriate sentence.

---

## Summary: employee refers → candidate applies via link

| Step | Who       | What                                                                                                                                                                                         |
| ---- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Employee  | Refers candidate in app (name + phone + job).                                                                                                                                                |
| 2    | TigerHire | Creates employee_referral, creates/updates WhatsApp session with referral context, sends **tigerhire_referral_v1** to candidate.                                                             |
| 3    | Candidate | Gets WhatsApp invite; later replies or sends CV.                                                                                                                                             |
| 4    | TigerHire | Sees existing session with referral context; sends **tigerhire_consent_v1** with “referred” text if consent needed; on YES, asks for CV and continues as normal (FitScore, apply by number). |

The **tigerhire_referral_v1** and **tigerhire_consent_v1** templates must be created and approved in **Meta WhatsApp Manager** (not Interakt) if you use Meta for this flow. Set `WHATSAPP_PHONE_NUMBER_ID` and use the same token as `WHATSAPP_API_KEY` (or `WHATSAPP_ACCESS_TOKEN`) for Meta.
