# Launch Go / No-Go — June 2026

**Decision date:** 2026-06-02
**Author:** Engineering (consolidated readiness review)
**Status:** 🔴 **NO-GO for full launch this week** · 🟡 narrow design-partner beta reachable in ~3–7 days

> **Purpose.** This document is the **single source of truth** for the June 2026 launch decision.
> It supersedes the older readiness trackers, several of which are stale or describe code that no
> longer exists. When those docs disagree with this one, **this one wins** until the launch ships.
>
> **Superseded / do-not-use-for-launch-decisions:**
>
> - `docs/REMAINING_TASKS.md` (Feb 22 — targets a passed Apr 2 date)
> - `docs/PRODUCTION_READINESS_TASKS.md` (Feb 23 — targets a passed Apr 2 date)
> - `docs/audits/scoring-path-audit.md` (describes pre-`310ed5ac` code that was deleted May 17)
> - `docs/scoring-v2-release-control.md` (governs an older flag set that is no longer shipped)
> - `docs/PRODUCTION_READINESS_AUDIT_V2.md` body (Feb; only the May 19 addendum is current)

---

## 1. Verdict

|                                                              |                                                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Full public launch this week**                             | 🔴 **NO-GO**                                                                                                        |
| **Controlled design-partner beta (≤50K users, invite-only)** | 🟡 **CONDITIONAL** — gated on §3                                                                                    |
| **Blended readiness**                                        | **~45–50%**                                                                                                         |
| **Fallback**                                                 | Move to **June 10** if §3 gates do not go green (per `PRE-LAUNCH-JUN-1.md`: "Launching broken is worse than late.") |

**The core finding:** the code is largely **built and verified in-repo** (typecheck passes clean), but
**almost no core flow has a recorded end-to-end pass**, two external approval dependencies are unconfirmed,
and the scoring engine has **never been measured for consistency**. The blocker is _proof and approvals_,
not _building_.

---

## 2. Confidence by area

| Area                                    | Confidence | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Infrastructure**                      | ~75%       | Sentry, PostHog, SPF/DKIM/DMARC, legal pages (`/terms /privacy /dpa`), rate-limits (429 proofs), secrets-rotation runbook all well-evidenced. Gap: uptime monitor + on-call still `in_progress`. PITR backups deferred for beta (accepted).                                                                                                                                                                                                        |
| **Security / multi-tenancy**            | ~45%       | Real cross-tenant data-leak bugs (candidate list/detail enumeration, storage objects, agency RLS) are **fixed in code and verified**. But app-layer `TenantScopedClient` covers only **~7 of 341 API routes** — the rest rely on RLS + hand-written checks. DR plan, admin MFA, and pre-launch pentest were flagged CRITICAL/HIGH pre-launch and show **no evidence of closure**.                                                                  |
| **Scoring engine (FitScore hybrid v2)** | ~58%       | Mechanically solid (~85%): single hybrid-v2 path (legacy three-stage scorer **deleted**, commit `310ed5ac`), deterministic math, cost guards (dedupe lock, 3-tier parse chain, deterministic fallback), typechecks. **Correctness unproven (~40%)**: no consistency baseline, no golden set, prompt-cache hit rate 72% vs 85% gate, "missing must-haves" flag unverified in UI, intent-heavy 75/25 blend with no confirmed hard-requirement floor. |
| **Comms / WhatsApp / intake**           | ~30–35%    | Code + gating correct and conservative (sends safely no-op until enabled). But **6+ Meta/Interakt templates have no confirmed APPROVED status**, every acceptance-matrix cell is blank, consent-v2 referral path is flagged OFF, and `OUTBOUND_NOTIFICATIONS_ENABLED` is a single blunt switch releasing all channels at once. "Sent" ≠ "delivered" on a cold WABA number.                                                                         |
| **Product completeness**                | ~62%       | Core flows (job create → apply → score → verdict → offer → schedule) mostly complete. One real defect: **counter-offer auto-approve correctness bug**. Design partners would hit rough edges, not walls.                                                                                                                                                                                                                                           |

**Ground truth checks (2026-06-02):**

- `npm run typecheck` → **PASS** (exit 0)
- `dev` and `main` in sync at `d181b037`; no open PRs
- Latest automated readiness run (`AUTOMATED-READINESS-LATEST.md`, 2026-05-12) → PASS, but **functional/E2E rows are infra probes, not product-flow walks**

---

## 3. Launch gates (must be GREEN before any external traffic)

These are genuine blockers, not polish. Each is verification or an external approval — **none require new architecture.**

### 🔴 GATE 1 — Record an end-to-end product walk

**Why:** `docs/launch/AUDIT.md` (P1–P8) and `VERIFICATION-CHECKLIST-P1-P11.md` are _entirely unchecked_.
The docs' own rule: shipped code ≠ pass without a recorded human demo walk. **Nobody has done it.**
**Action:** Walk the full funnel (post job → apply → FitScore → verdict → offer → self-schedule → referral)
on the live build, record it, and fill in `AUDIT.md`.
**Owner:** **\_** · **ETA:** ~1 day

### 🔴 GATE 2 — Confirm WhatsApp template approvals + one real delivery

**Why:** Outbound first-contact and post-24h sends depend on Meta-approved templates
(`th_screening_invite`, `tigerhire_session_expired`, `tigerhire_consent_v2`, `th_referrer_otp`, +others).
No APPROVED status is recorded anywhere; the acceptance matrix is blank.
**Action:** Confirm all required templates show APPROVED in Meta; execute one real send → **delivered**
receipt against `STAGING_INTAKE_AND_COMMS_E2E_RUNBOOK.md`; verify `messages` webhook field is subscribed.
**Owner:** **\_** (Ops/operator — external dependency, **start today**) · **ETA:** approval-dependent

### 🔴 GATE 3 — Scoring consistency baseline + hard-requirement floor

**Why:** Determinism only guarantees the _same answer twice_. There is **zero in-repo evidence** scores
are right or stable across re-runs. The product's whole pitch is the score.
**Action:** Force-rescore ~10 candidates 3–10× and record variance; confirm a role-relevance /
hard-requirement floor exists in the hybrid path (the old v1 floor lived in the now-deleted `signal-score.ts`);
verify "missing must-haves" surfaces in the recruiter UI.
**Owner:** **\_** · **ETA:** ~1 day

### 🟡 GATE 4 — Uptime monitor + on-call escalation

**Why:** `PRE-LAUNCH-INFRA-CHECKLIST.md` lists uptime as `in_progress`. Launching without paging on the
prod domain + `/api/webhooks/whatsapp` is an operational blocker.
**Owner:** **\_** · **ETA:** ~hours

### 🟡 GATE 5 — Fix counter-offer auto-approve bug

**Why:** The one true correctness defect found (not a missing feature) in an otherwise-complete offer flow.
**Owner:** **\_** · **ETA:** ~hours

### 🟡 GATE 6 — Promote `dev` → `main`

**Why:** Closure work must reach production. Gated on Gates 1–2 green + plan flags on production.
**Owner:** Ops · **ETA:** after Gates 1–2

---

## 4. Accepted risks for a controlled beta

These are **knowingly deferred** for an invite-only beta and revisited before GA:

- **PITR backups** — Pro plan daily-backups-7d accepted; up to 24h data-loss window. Revisit before GA.
- **App-layer tenant isolation on ~330 routes** — relies on RLS correctness. _Mitigation: independently
  confirm RLS is active on `applications`, `fit_scores`, `pipeline`, `unlocks` tables before beta._
- **Admin MFA / pentest / DR runbook** — acceptable to defer for a small invite-only cohort you control;
  **not** acceptable for open GA. Track explicitly.
- **Bias mitigation (blinding / flip-tests)** — post-beta; reputational/compliance exposure to monitor.
- **Prompt-cache hit rate below 85% gate** — higher per-score cost, not a correctness issue; re-measure on
  production volume.
- **Consent-v2 referral path OFF** — referred candidates flow through legacy consent branch until verified.

---

## 5. Decision rule

```
IF Gates 1, 2, 3 GREEN (and 4, 5 closed):
    → GO for controlled design-partner beta (invite-only, ≤50K, you control the cohort)
    → Promote dev → main (Gate 6)

ELSE IF WhatsApp approvals OR funnel walk fail:
    → NO-GO. Move launch to June 10 (per PRE-LAUNCH-JUN-1.md).
    → "Launching broken is worse than late."

Full public GA remains gated on: admin MFA, pentest, DR runbook,
scoring accuracy evidence, and full WhatsApp acceptance sign-off.
```

---

## 6. Sign-off

| Role             | Name | Go / No-Go | Date |
| ---------------- | ---- | ---------- | ---- |
| Engineering      |      |            |      |
| Product          |      |            |      |
| Ops              |      |            |      |
| Operator (final) |      |            |      |

---

_Generated from a consolidated review of the launch/readiness/security/scoring/comms/product doc clusters
plus repo ground-truth (typecheck, git state) on 2026-06-02. Confidence figures are evidence-based reads,
not guarantees — each gate above converts a read into a recorded fact._
