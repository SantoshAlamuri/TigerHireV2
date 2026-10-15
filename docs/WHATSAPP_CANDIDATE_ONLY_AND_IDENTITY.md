# WhatsApp: Candidate-Only Replies & Candidate Identity Mapping

## 1. Only candidates get WhatsApp replies

**Your understanding is correct:** WhatsApp replies and proactive messages are for **candidates only**. Recruiters do not receive WhatsApp from TigerHire for shortlists or other events.

- **Inbound:** The WhatsApp webhook responds only to whoever messages the business number. In practice that is candidates (consent, CV drop, match selection, preferences, interview slot choice, etc.).
- **Outbound:** All outbound WhatsApp flows are candidate-facing:
  - Consent, CV request, FitScore results, apply-by-number, interview scheduling, vouch questions, referral, session expired, etc.
- **Recruiters:** Shortlist-ready and other recruiter notifications are sent by **email** only (e.g. `sendFitScoreReady` in Resend). The template `recruiter_shortlist_ready` exists in code but is not used; recruiter comms stay email-only.

So: **only candidates get WhatsApp; recruiters need not (and do not) get it.**

---

## 2. How candidates are registered in the DB

Two ways a “candidate” can appear:

| Path                            | What gets created                                                     | `candidates.user_id`                                       |
| ------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------- |
| **WhatsApp (share profile/CV)** | Scout creates or updates a row in `candidates` (from CV + phone).     | `null` until the profile is “claimed” by a logged-in user. |
| **Email / LinkedIn sign-up**    | `auth.users` + `profiles` (role `candidate_free` or `candidate_pro`). | No `candidates` row until they’re linked (see below).      |

So we have:

- **`profiles`** = who is logged in (auth identity: email, LinkedIn, etc.).
- **`candidates`** = the talent profile (skills, experience, fit_scores, applications). It may or may not be linked to a user (`user_id`).

---

## 3. Mapping the same person: WhatsApp first, then email/LinkedIn login

When a candidate first shares a profile via WhatsApp and later logs in with the **same** email (or LinkedIn that resolves to the same email), we need to treat them as the same person.

- **Without mapping:** We’d have one `candidates` row from WhatsApp (`user_id = null`) and, after login, a new `candidates` row created on first in-app action (e.g. upload-resume) with `user_id` set → duplicate profile, split history.
- **With mapping:** We “claim” the existing WhatsApp-originated `candidates` row by setting `candidates.user_id = auth.users.id` when we can match the logged-in user to that row (e.g. by email).

**Matching rules (same as dedup):**

- Prefer **email**: if the auth user’s email equals a `candidates.email` (case-insensitive), and that row has `user_id = null`, we claim it.
- Optionally **phone**: if we later store the auth user’s phone (e.g. from LinkedIn or a form), we can also claim by phone (last 10 digits) for unclaimed rows.

So:

1. **Candidate shares profile on WhatsApp** → Scout creates/updates `candidates` (phone, email from CV, name), `user_id = null`.
2. **Same person signs up or logs in with email (or LinkedIn with same email)** → We ensure a `profiles` row (e.g. via ensure-profile).
3. **Claim step:** When we know the user is a candidate and we have their email, we look for an unclaimed candidate with that email and set `candidates.user_id = auth.users.id`. That links the WhatsApp-originated profile to the logged-in identity.
4. **Result:** One `candidates` row, one history (fit_scores, applications, WhatsApp session). The candidate sees the same profile whether they came from WhatsApp or the app.

Claim is performed:

- In **ensure-profile** after creating/finding the profile (for candidate roles), so the link happens at first login.
- In **upload-resume** and **GET /api/candidates/matches** when no candidate is linked yet: try claim by email first, then create a new candidate only if none was claimed.

---

## 4. Summary

| Question                                                                     | Answer                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who gets WhatsApp replies?                                                   | **Only candidates.** Recruiters do not get WhatsApp; they get email.                                                                                                                                                                                        |
| How is a candidate “registered” in the DB?                                   | Either as a **`candidates` row** (e.g. from WhatsApp/Scout) or as **auth + `profiles`** (from sign-up). They are linked when `candidates.user_id` is set.                                                                                                   |
| How do we map WhatsApp profile → same person logging in with email/LinkedIn? | **Claim by email:** when a candidate logs in, we find an unclaimed `candidates` row with the same email and set `candidates.user_id` to their `auth.users.id`. Same logic is used before creating a new candidate on upload-resume or when loading matches. |

This keeps a single candidate identity across WhatsApp and in-app (email/LinkedIn) and avoids duplicate profiles.
