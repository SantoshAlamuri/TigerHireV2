# WhatsApp Cost Model — TigerHire

## Your Interakt Plan (ADVANCED — Active)

Rates below are for **Indian destination numbers**. Session messages = within 24h of user reply (free).

| Item                                             | Rate                 |
| ------------------------------------------------ | -------------------- |
| Platform fee                                     | ₹3,799/month         |
| Service (candidate messages first)               | **FREE (unlimited)** |
| Utility conversation                             | **₹0.140**           |
| Marketing conversation                           | **₹0.949**           |
| Auth conversation                                | ₹0.127               |
| Session messages (within 24h of candidate reply) | **FREE**             |

Plan includes: Developer APIs (sessions, incoming), 600 msgs/min API rate limit (system upgrade may apply), agent stats, campaign reports, Instagram DMs/Comments/Quick Flows.

---

## How TigerHire Messages Map to Pricing

### FREE Messages (₹0)

When a candidate messages us first, a 24h service window opens. Everything below is FREE within that window:

| Message                              | Type           |
| ------------------------------------ | -------------- |
| Consent prompt                       | Session (free) |
| Welcome / CV request                 | Session (free) |
| "Got your CV. Scoring now..."        | Session (free) |
| FitScore result + matches            | Session (free) |
| "Applied! You'll hear back soon."    | Session (free) |
| STATUS / MATCHES / PREFERENCES reply | Session (free) |
| Interview slots (if within 24h)      | Session (free) |
| Any follow-up within 24h             | Session (free) |

### Paid Templates (outside 24h window)

**Current Meta categories** (as of template approval; some re-categorized by Meta):

| Template                      | Category (Meta)                 | Cost       | Notes                                   |
| ----------------------------- | ------------------------------- | ---------- | --------------------------------------- |
| `th_shortlisted`              | Utility                         | ₹0.140     |                                         |
| `th_not_selected`             | Utility                         | ₹0.140     |                                         |
| `th_offer`                    | Utility                         | ₹0.140     |                                         |
| `th_interview_slots`          | Utility                         | ₹0.140     |                                         |
| `th_interview_reminder`       | Utility                         | ₹0.140     |                                         |
| `th_interview_rescheduled`    | Utility                         | ₹0.140     |                                         |
| `tigerhire_session_expired`   | Utility                         | ₹0.140     |                                         |
| `recruiter_shortlist_ready`   | Utility                         | ₹0.140     |                                         |
| `candidate_profile_claimed`   | Utility                         | ₹0.140     |                                         |
| `candidate_contact_unlocked`  | Utility                         | ₹0.140     |                                         |
| `th_application_received`     | Utility                         | ₹0.140     |                                         |
| `candidate_match_alert`       | **Marketing** (Changed by Meta) | **₹0.949** | Was Utility; proactive match alert.     |
| `waitlist_confirmation`       | **Marketing** (Changed by Meta) | **₹0.949** | Was Utility; waitlist signup.           |
| `th_profile_incomplete`       | **Marketing** (Changed by Meta) | **₹0.949** | Was Utility; profile nudge.             |
| `th_recruiter_new_candidates` | **Marketing** (Changed by Meta) | **₹0.949** | Was Utility; recruiter new-match alert. |
| `th_sourcing`                 | **Marketing**                   | **₹0.949** |                                         |
| `th_referral_drive`           | **Marketing**                   | **₹0.949** |                                         |
| `th_reengagement`             | **Marketing**                   | **₹0.949** |                                         |

---

## Cost Per Candidate — By Journey Type

### Journey A: Inbound Candidate (they message us first)

Candidate finds TigerHire via QR code, ad, referral link, or word of mouth and messages first.

| Step                                       | Message type                             | Cost      |
| ------------------------------------------ | ---------------------------------------- | --------- |
| 1. Candidate messages us                   | Service window opens                     | FREE      |
| 2. Consent → YES → CV → FitScore → Matches | Session messages                         | FREE      |
| 3. Applies to a role                       | Session message                          | FREE      |
| 4. Recruiter shortlists (days later)       | `th_shortlisted` (utility)               | ₹0.140    |
| 5. Interview slots sent                    | `th_interview_slots` (utility)           | ₹0.140    |
| 6. Interview reminder                      | `th_interview_reminder` (utility)        | ₹0.140    |
| 7. Offer or rejection                      | `th_offer` / `th_not_selected` (utility) | ₹0.140    |
| **Full pipeline total**                    |                                          | **₹0.56** |

Most candidates won't reach the full pipeline:

- **Drops off after FitScore** (never shortlisted): ₹0.00 (all within 24h)
- **Rejected after review**: ₹0.140 (1 utility template)
- **Shortlisted but no interview**: ₹0.140 (1 utility template)
- **Full pipeline (interview + outcome)**: ₹0.56 (4 utility templates)

**Weighted average per inbound candidate: ~₹0.14 – ₹0.20**

---

### Journey B: Outbound Sourcing (we reach out first)

We proactively message a passive candidate about a role.

| Step                                       | Message type               | Cost       |
| ------------------------------------------ | -------------------------- | ---------- |
| 1. Sourcing template sent                  | `th_sourcing` (marketing)  | **₹0.949** |
| 2. If candidate replies → 24h window opens | Session messages           | FREE       |
| 3. CV → FitScore → Matches → Apply         | Session messages           | FREE       |
| 4. Shortlisted                             | `th_shortlisted` (utility) | ₹0.140     |
| 5. Interview + reminder                    | 2× utility                 | ₹0.280     |
| 6. Outcome                                 | 1× utility                 | ₹0.140     |
| **Full pipeline total**                    |                            | **₹1.509** |

Most sourced candidates won't respond:

- **No response** (majority): ₹0.949 (just the marketing template)
- **Responds but not shortlisted**: ₹0.949 + ₹0.140 = ₹1.089
- **Full pipeline**: ₹1.509

**Weighted average per sourced candidate: ~₹0.97 – ₹1.10**

---

### Journey C: Employee Referral

Employee refers candidate from the TigerHire app.

| Step                               | Message type                      | Cost       |
| ---------------------------------- | --------------------------------- | ---------- |
| 1. Referral invite sent            | `tigerhire_referral_v1` (utility) | ₹0.140     |
| 2. Candidate replies → 24h window  | Session messages                  | FREE       |
| 3. CV → FitScore → Matches → Apply | Session messages                  | FREE       |
| 4. Shortlisted                     | `th_shortlisted` (utility)        | ₹0.140     |
| 5. Interview + reminder            | 2× utility                        | ₹0.280     |
| 6. Outcome                         | 1× utility                        | ₹0.140     |
| **Full pipeline total**            |                                   | **₹0.700** |

- **No response**: ₹0.140
- **Responds but not shortlisted**: ₹0.140 + ₹0.140 = ₹0.280
- **Full pipeline**: ₹0.700

**Weighted average per referred candidate: ~₹0.20 – ₹0.30**

---

## 1,00,000 Candidates in 3–4 Months

### Scenario 1: Realistic Mix

| Channel               | %   | Count        | First touch cost | Subtotal    |
| --------------------- | --- | ------------ | ---------------- | ----------- |
| Inbound (FREE)        | 25% | 25,000       | ₹0               | ₹0          |
| Sourcing outbound     | 55% | 55,000       | ₹0.949           | ₹52,195     |
| Employee referral     | 20% | 20,000       | ₹0.140           | ₹2,800      |
| **First touch total** |     | **1,00,000** |                  | **₹54,995** |

**Engagement funnel:**

| Channel           | Touched | Response rate | Engaged    |
| ----------------- | ------- | ------------- | ---------- |
| Inbound           | 25,000  | 100%          | 25,000     |
| Sourcing          | 55,000  | 12%           | 6,600      |
| Referral          | 20,000  | 35%           | 7,000      |
| **Total engaged** |         |               | **38,600** |

**Downstream pipeline notifications (utility ₹0.140 each):**

| Event                     | % of engaged | Count  | Templates | Cost       |
| ------------------------- | ------------ | ------ | --------- | ---------- |
| Rejection (not selected)  | 88%          | 33,968 | 1         | ₹4,756     |
| Shortlisted               | 12%          | 4,632  | 1         | ₹649       |
| Interview slots           | 4%           | 1,544  | 1         | ₹216       |
| Interview reminder        | 4%           | 1,544  | 1         | ₹216       |
| Offer                     | 1%           | 386    | 1         | ₹54        |
| Session-expired fallbacks | 10%          | 3,860  | 1         | ₹540       |
| **Downstream total**      |              |        |           | **₹6,431** |

**Platform fee:** ₹3,799 × 4 months = **₹15,196**

### Realistic Total

| Line item                      | Cost        |
| ------------------------------ | ----------- |
| Interakt platform (4 months)   | ₹15,196     |
| First touch templates          | ₹54,995     |
| Pipeline notifications         | ₹6,431      |
| **GRAND TOTAL**                | **₹76,622** |
| **Cost per candidate touched** | **₹0.77**   |
| **Cost per engaged candidate** | **₹1.99**   |

---

### Scenario 2: Heavy Inbound (best case)

If most candidates come organically (ads → QR code → "message us on WhatsApp").

| Channel         | %   | Count  | Cost        |
| --------------- | --- | ------ | ----------- |
| Inbound         | 65% | 65,000 | ₹0          |
| Sourcing        | 20% | 20,000 | ₹18,980     |
| Referral        | 15% | 15,000 | ₹2,100      |
| **First touch** |     |        | **₹21,080** |

Engaged: 65,000 + 2,400 + 5,250 = 72,650
Downstream pipeline: ~₹12,100
Platform: ₹15,196

|                        |             |
| ---------------------- | ----------- |
| **GRAND TOTAL**        | **₹48,376** |
| **Cost per candidate** | **₹0.48**   |

---

### Scenario 3: Heavy Outbound (worst case)

Aggressive sourcing, most candidates reached proactively.

| Channel         | %   | Count  | Cost        |
| --------------- | --- | ------ | ----------- |
| Inbound         | 10% | 10,000 | ₹0          |
| Sourcing        | 80% | 80,000 | ₹75,920     |
| Referral        | 10% | 10,000 | ₹1,400      |
| **First touch** |     |        | **₹77,320** |

Engaged: 10,000 + 9,600 + 3,500 = 23,100
Downstream pipeline: ~₹3,900
Platform: ₹15,196

|                        |             |
| ---------------------- | ----------- |
| **GRAND TOTAL**        | **₹96,416** |
| **Cost per candidate** | **₹0.96**   |

---

## Summary: Cost Ranges

| Scenario                                              | Total (4 months) | Per candidate | Per engaged candidate |
| ----------------------------------------------------- | ---------------- | ------------- | --------------------- |
| **Best (heavy inbound)**                              | **₹48,376**      | **₹0.48**     | ₹0.67                 |
| **Realistic (mixed)**                                 | **₹76,622**      | **₹0.77**     | ₹1.99                 |
| **Realistic + Meta re-cat (4 templates → Marketing)** | **₹93,436**      | **₹0.93**     | ₹2.42                 |
| **Worst (heavy outbound)**                            | **₹96,416**      | **₹0.96**     | ₹4.17                 |

### Comparison with alternatives:

- SMS blast (₹0.15–0.25/msg, no conversation): ~₹1,50,000 for same reach, no engagement
- Cold email (Resend/SES ₹0.05/email): ~₹5,000 but 5-10% open rate
- Job portal (Naukri/Indeed): ₹50,000–₹2,00,000/month for comparable reach
- **WhatsApp via TigerHire: ₹48K–₹96K total**, with 2-way conversation + AI scoring

---

## How to Minimize Cost

1. **Maximize inbound traffic** — QR codes on job ads, click-to-WhatsApp ads, social posts. Inbound = ₹0 first touch.
2. **Fast response within 24h** — Score CV, show matches, get application — all free while window is open.
3. **Batch recruiter actions** — If recruiter shortlists/rejects in bulk, each notification is only ₹0.140.
4. **Use session messages where possible** — If candidate has messaged in last 24h, reply with free-form text instead of template.
5. **Avoid marketing templates where utility works** — Utility is ₹0.140 vs Marketing ₹0.949 (6.8× cheaper).
6. **Don't send rejection to non-engaged** — Only send `th_not_selected` to candidates who actually applied. Sourced candidates who never responded don't need a rejection.

---

## Meta template re-categorization — impact and revised costing

Meta has re-categorized four templates from **Utility** to **Marketing** (shown as "Changed by Meta" in WhatsApp Manager). At Interakt rates that is **₹0.140 → ₹0.949** per message (~6.8×).

### Templates affected (Changed by Meta)

| Template                      | Use case                                      | Old cost | New cost |
| ----------------------------- | --------------------------------------------- | -------- | -------- |
| `candidate_match_alert`       | Proactive "new roles match you" (outside 24h) | ₹0.140   | ₹0.949   |
| `waitlist_confirmation`       | Waitlist signup confirmation                  | ₹0.140   | ₹0.949   |
| `th_profile_incomplete`       | Nudge to complete profile                     | ₹0.140   | ₹0.949   |
| `th_recruiter_new_candidates` | Recruiter: new candidates matched to role     | ₹0.140   | ₹0.949   |

### Volume assumptions (100k candidates, 4 months, realistic mix)

| Template                      | Est. count          | At Utility | At Marketing | Delta       |
| ----------------------------- | ------------------- | ---------- | ------------ | ----------- |
| `waitlist_confirmation`       | 3,000               | ₹420       | ₹2,847       | ₹2,427      |
| `candidate_match_alert`       | 10,000              | ₹1,400     | ₹9,490       | ₹8,090      |
| `th_profile_incomplete`       | 5,790 (15% engaged) | ₹811       | ₹5,490       | ₹4,679      |
| `th_recruiter_new_candidates` | 2,000               | ₹280       | ₹1,898       | ₹1,618      |
| **Total**                     |                     | **₹2,911** | **₹19,725**  | **₹16,814** |

**Revised realistic total (if all four stay Marketing):** ₹76,622 + ₹16,814 = **₹93,436** (4 months).

---

### Can we drop any or change the flow?

| Option             | Template                      | Action                                                                                                                                                         | Est. saving  | Trade-off                                                                        |
| ------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------- |
| **Drop**           | `waitlist_confirmation`       | Confirm waitlist by email/SMS or in-app only; don’t send WhatsApp template.                                                                                    | ₹2,847       | Slightly weaker welcome for waitlist.                                            |
| **Flow change**    | `candidate_match_alert`       | Send match alert **only when candidate has messaged in last 24h** → use **session message** (free). Outside 24h: skip or cap (e.g. 1 per candidate per month). | Up to ₹9,490 | Fewer proactive match pings; more reliance on them replying or checking MATCHES. |
| **Flow change**    | `th_profile_incomplete`       | Nudge **only within 24h** (session message) or skip.                                                                                                           | Up to ₹5,490 | Fewer profile-completion nudges.                                                 |
| **Drop or reduce** | `th_recruiter_new_candidates` | Use in-app/email only for “new candidates” alert, or send less frequently.                                                                                     | Up to ₹1,898 | Recruiters check app more than WhatsApp.                                         |
| **Appeal**         | All four                      | Use **Raise Appeal** in Meta for each; if reverted to Utility, no extra cost.                                                                                  | ₹16,814      | Depends on Meta’s decision; may take time.                                       |

**Recommendation:**

1. **Raise Appeal** for all four templates (no downside; can save full delta if reverted to Utility).
2. **Change flow** for `candidate_match_alert` and `th_profile_incomplete`: only send when the user is in the 24h window (session message) or cap frequency; avoid Marketing template where possible.
3. **Drop** `waitlist_confirmation` on WhatsApp if email/SMS is acceptable for waitlist.
4. **Reduce** `th_recruiter_new_candidates` to in-app/email or lower frequency if recruiter engagement is fine.

---

### Revised costing (realistic mix, 100k in 4 months)

| Scenario                                       | Pipeline (incl. 4 templates) | Total (4 months) | Per candidate |
| ---------------------------------------------- | ---------------------------- | ---------------- | ------------- |
| **Before Meta changes** (all four at Utility)  | ₹6,431                       | **₹76,622**      | ₹0.77         |
| **After Meta changes** (no flow change)        | ₹6,431 + ₹16,814 = ₹23,245   | **₹93,436**      | ₹0.93         |
| **After optimizations** (appeal + flow + drop) | ₹6,431 + ~₹0\*               | **₹76,622**      | ₹0.77         |

\*Assuming appeal succeeds for all four, or flow change/drop removes use of Marketing for these. If only flow changes (match alert + profile incomplete sent only in 24h, waitlist dropped, recruiter alert reduced): pipeline add-on ≈ ₹2,000–4,000 (residual Marketing usage), total ≈ **₹78k–80k**.

**Implementation note (flow change):** For `candidate_match_alert` and `th_profile_incomplete`, callers can check `SessionRepository.isWithin24HrWindow(supabase, phone)` before sending. If within 24h, send the same content as a **session message** via `sendWhatsAppMessage()` instead of `sendTemplateMessage()` to avoid Marketing cost. See `src/lib/services/whatsapp.ts` and `src/lib/repositories/SessionRepository.ts`.

---

## Monthly Breakdown (Realistic, 4 months)

| Month     | Candidates touched | First touch | Pipeline   | Platform    | Monthly total |
| --------- | ------------------ | ----------- | ---------- | ----------- | ------------- |
| Month 1   | 20,000             | ₹11,000     | ₹500       | ₹3,799      | ₹15,299       |
| Month 2   | 25,000             | ₹13,750     | ₹1,500     | ₹3,799      | ₹19,049       |
| Month 3   | 30,000             | ₹16,500     | ₹2,200     | ₹3,799      | ₹22,499       |
| Month 4   | 25,000             | ₹13,750     | ₹2,231     | ₹3,799      | ₹19,780       |
| **Total** | **1,00,000**       | **₹55,000** | **₹6,431** | **₹15,196** | **₹76,627**   |

Pipeline costs ramp up in months 2-4 as earlier candidates move through shortlist → interview → outcome stages.
