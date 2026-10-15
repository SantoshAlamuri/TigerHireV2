# SantoshTODO List

Personal action items — everything platform-side is done; each item below is
blocked on Santosh's accounts/dashboards. Updated 2026-07-23.
Check items off and tell Claude "done" — each unlocks an automated follow-up.

## 🔴 This week (serves Masai's live funnel)

- [ ] **1. Top up Recall.ai balance** (2 min)
      Dashboard (ap-northeast-1) → billing. $5 ≈ 10 recording hours; Masai's
      25 screening-passed candidates are heading into interviews.

- [ ] **2. Google OAuth → Recall calendar auto-join** (~10 min)
      Google Cloud Console (same project as the existing login client): 1. Credentials → existing OAuth client → add redirect URI:
      `https://ap-northeast-1.recall.ai/api/v1/calendar/google_oauth_callback/` 2. OAuth consent screen → add scope `calendar.events.readonly`
      (userinfo.email already present) 3. Paste the SAME Client ID + Secret into Recall → Calendar Integration
      → Step 2 (Google Calendar) 4. Consent screen → Test users → add Masai interviewer emails 5. Submit the app for verification (removes the 7-day testing-token
      expiry; takes days–weeks, runs in background)
      Then tell Claude → the TigerHire-side build (connect button, webhooks,
      interview-only guardrail) is chipped and ready.

- [ ] **3. Razorpay keys** (you're mid-onboarding already)
      Razorpay dashboard → API Keys → copy `KEY_ID`, `KEY_SECRET`; Webhooks →
      create endpoint later WITH Claude (contract verification first). Paste
      the two keys to Claude → checkout/billing goes live (code ~80% exists).

      (Item 4 — GitHub Actions billing — is DONE; see "Done recently" below.)

## 🟡 This month

- [ ] **5. Resend Pro decision** ($20/mo)
      Unlocks email intake ("forward any resume email → scored candidate")
      and the Naukri-via-email story. Everything else is built; chip
      "Activate email intake" runs the moment this is paid. (Deferred by
      choice on 2026-07-10 — revisit.)

- [ ] **6. Tell Ishita (Masai)** - 8 Lead BA candidates have unreadable CVs → need re-uploads (the
      unscored rows on the screening tab) - 25 candidates passed WhatsApp screening → ready to schedule interviews - Interviewers should paste the meeting link on slots (auto-join comes
      with item 2) and ADMIT the notetaker bot when it knocks - Scores of marginal candidates will read slightly lower on new batches
      (scoring-integrity fixes — deliberate, not a bug)

- [ ] **7. Microsoft/Outlook calendar for Recall** (optional, ~10 min)
      Only when a customer runs on Outlook: Azure portal → the Entra login
      app → add Recall's Microsoft redirect URI + `Calendars.Read` scope →
      paste into Recall's Outlook tab.

## 🟢 When triggered (no action today)

- [ ] **8. SpringVerify** — when Masai wants BGV: they open their own account
      and paste token + package IDs into Settings → Integrations (built).
      Also chase SpringVerify support for the webhook contract answers
      (questions listed in docs/ops/integration-golive-runbooks.md §3).
- [ ] **9. Apna partnership call** — enterprise/ATS-integration program
      (customer-fit case: Masai's grad pipeline). LinkedIn partnership same
      bucket.
- [ ] **10. Bolna voice screening** — parked by choice; re-activate if
      WhatsApp screening engagement (~18%) becomes the bottleneck. Runbook §2.
- [ ] **11. Supabase PITR add-on** — before GA (daily backups only today;
      this week's data incident was recovered from message logs, not backups).

## Done recently (for the record)

- ✅ **GitHub Actions billing unblocked (2026-07-21)** — root cause was NOT a
  failed payment: the org (GitHub **Free** plan) had hit **100% of its Actions
  budget**, so every job aborted in ~2s with the "recent account payments have
  failed or your spending limit needs to be increased" annotation. Fixed by
  raising the Actions budget. CI, release gate and DB-backup workflows are live
  again. If it recurs, check **org → Billing → Budgets and alerts** first, not
  the card.
- ✅ **CI Actions cost cut ~65% (2026-07-22, #270)** — the full ~19-job matrix
  no longer re-runs on every merge to `dev` (PR checks + the Dev release gate
  cover it), docs-only changes skip CI, the duplicate npm-audit job was removed,
  and the heavy suite (Stress, Perf, SBOM, CodeQL, E2E, K6) now runs on merges
  to `main` instead of every PR.
- ✅ **CI Lint gate fully green (2026-07-21)** — took three fixes: Zod
  validation (#258), the 250-line size-check (#265), and a missing CSRF guard
  (#266). Also fixed a `next build` out-of-memory failure (#271) and patched
  dependency vulnerabilities (#269/#273; `npm audit` is now informational so a
  newly-published CVE can no longer wedge the build).
- ✅ Recall.ai notetaker LIVE (2026-07-10) — Tokyo region, webhook + secret
  fixed, flag on, Masai enabled, signed smoke test passed
- ✅ All WhatsApp templates approved; screening pipeline hardened end-to-end
- ✅ 24-issue review fix batch shipped (#235–#241)
- ✅ Per-org SpringVerify (BYO account) shipped
