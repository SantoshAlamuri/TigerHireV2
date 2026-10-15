# Feature flags, entitlements, and billing — audit and remediation plan

**Status:** Planning / discussion only — no implementation commitment until stakeholders align on taxonomy and commercial model.

**Audience:** Product, engineering, finance.

---

## 1. Executive summary

TigerHire currently uses **two different mechanisms** that are easy to conflate:

| Mechanism                                      | Where it lives                                                                                                                                                                                                        | What it controls                                                                                                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Runtime feature flags**                   | Postgres `feature_flags` + optional `organisation_runtime_feature_flag_overrides`; cached via Redis in `src/lib/feature-flags.ts` (`isEnabled`)                                                                       | Gradual rollout, kill switches, agent wiring, FitScore paths — **mostly operational / engineering**, not tied to Stripe line items in code today.           |
| **B. Plan entitlements (“billable features”)** | `src/lib/entitlements/config.ts` (`ENTITLEMENT_FEATURE_KEYS`), `billing_plans.limits.features`, `organisation_feature_overrides`, plus **global** rows in `feature_flags` whose keys end in `_global` (kill switches) | Nav visibility (`navigation.tsx` + `/api/entitlements`) and `getOrganisationEntitlement` in API routes — **closest thing to “what the customer paid for.”** |

**Problems observed**

1. **Cognitive overload:** Admin UI lists every row in `feature_flags`; many keys are legacy seeds, deprecated, or **not read by application code**, so toggles feel meaningless or dangerous.
2. **Naming collision:** “FitScore v2” means different things: **hybrid v2** (`fitscore_hybrid_v2`), **shadow blend** (primary vs shadow scores in `fit_scores`), **fit_scores_v2 table** + DB flags `scoring_v2_shadow_enabled` / `scoring_v2_primary`, and **`fitscore/v2/` code** — only some of these are wired.
3. **Voice screening:** There is **no** `isEnabled(...)` gate for voice in the paths reviewed; usage and spend surface via screening APIs / cost patterns — **billing and UX are decoupled from the flag system**.
4. **Billing vs defaults:** In `src/lib/services/stripe.ts`, company plans default **all** entitlement features to `true`; real differentiation is expected from **`billing_plans`** in the database. That is correct for flexibility but **opaque** in the UI unless the admin page explains it.
5. **Per-usage billing:** There is no single documented end-to-end “meter → Stripe usage record → invoice” story in this audit for arbitrary features; screening has **usage** endpoints and cost ledger concepts — extend that pattern deliberately rather than ad-hoc flags.

---

## 2. Clarify product language (FitScore and “shadow”)

Use this vocabulary internally and in UX to reduce confusion:

| Term                                                 | Meaning in this codebase                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Three-stage / v1 scoring**                         | `scoring_version` / legacy pipeline producing `overall_score`, optional `shadow_score` (20/80 vs 40/60 blends) — see `src/lib/fitscore/three-stage/`.                                                                                                                                                                                           |
| **Hybrid FitScore v2**                               | JD base documents + hybrid routes; gated by **`fitscore_hybrid_v2`** (`FEATURE_FLAG_HYBRID_V2`).                                                                                                                                                                                                                                                |
| **Hybrid execution in orchestrator / fit-score API** | Separate flag **`fitscore_hybrid_execution`** — controls whether hybrid path runs in certain flows (see `src/app/api/fit-score/route.ts`, `src/lib/agents/orchestrator-steps.ts`).                                                                                                                                                              |
| **FitScore V2 table (`fit_scores_v2`)**              | Persistence target for a parallel scoring model; helper `persistShadowV2Score` exists in `src/lib/fitscore/v2/shadow-persist.ts` but **is not referenced elsewhere in `src/`** at audit time — **DB flags `scoring_v2_shadow_enabled` and `scoring_v2_primary` are seeded but not read by production TypeScript** (only docs/tests/migrations). |
| **“Shadow” in UI**                                   | Recruiter-facing primary vs shadow **blend selection** — product behavior, not the same as DB `scoring_v2_*` flags.                                                                                                                                                                                                                             |

**Action:** Before changing any flag, decide whether `scoring_v2_*` flags are **abandoned**, **pending wiring**, or **controlled only by external jobs** — today they add noise in admin.

---

## 3. Entitlements (customer-facing “features”)

Defined in `src/lib/entitlements/config.ts`:

| Key                  | Human label (`ENTITLEMENT_LABELS`) | Global kill-switch key      | Chargeable / commercial intent (today)                                                                                                                  |
| -------------------- | ---------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agents_run`         | Agent runs                         | `agents_run_global`         | **Yes (usage-shaped)** — agents consume AI/provider cost; today gated by entitlement + org overrides, not per-call Stripe metering in this doc’s scope. |
| `fitscore_batch`     | FitScore batch                     | `fitscore_batch_global`     | **Yes (usage-shaped)** — batch scoring is cost-heavy; plan/override controls access.                                                                    |
| `assessments`        | Assessments                        | `assessments_global`        | **Yes** — premium module; nav uses `NAV_FEATURE_GATES` for company/recruit paths.                                                                       |
| `offers`             | Offers                             | `offers_global`             | **Yes** — premium module.                                                                                                                               |
| `compensation_bands` | Compensation bands                 | `compensation_bands_global` | **Yes** — sensitive / advanced HR data.                                                                                                                 |
| `interview_prep`     | Interview prep                     | `interview_prep_global`     | **Yes** — bundled as premium capability in product positioning.                                                                                         |
| `scim`               | SCIM                               | `scim_global`               | **Yes** — enterprise integration.                                                                                                                       |

**Stripe:** `getBillingPlans()` merges DB `billing_plans.limits.features` with env defaults; `COMPANY_PLANS` in code sets **all** features `true` for starter/growth/scale — **commercial differentiation is primarily in DB**, not in the committed TypeScript defaults.

**Gap:** Entitlements do **not** currently include “voice screening” or “voice agent” as a first-class key — voice is a **mode** under screening with usage reporting (`src/app/api/screening/usage/route.ts`), not a nav-gated entitlement in `ENTITLEMENT_FEATURE_KEYS`.

---

## 4. Runtime flags referenced in `src/` (engineering)

These keys appear in **`isEnabled(...)`** calls (non-exhaustive double-check against repo when implementing):

| Flag key                         | Area                                                           | Chargeable?                | Notes                                                                                                  |
| -------------------------------- | -------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `fitscore_hybrid_v2`             | FitScore hybrid APIs, JD base, batch, score routes, JobService | Indirectly (LLM/compute)   | Primary “hybrid v2” gate.                                                                              |
| `fitscore_hybrid_execution`      | `fit-score` route, orchestrator                                | Indirectly                 | Separate from hybrid v2 JD APIs — name confuses people; consider renaming in a **major** cleanup only. |
| `fitscore_budget_enforcement`    | `fitscore-agent.ts`                                            | No (cost protection)       | Internal guardrail.                                                                                    |
| `fitscore_prefilter_strict`      | `fitscore-agent.ts`                                            | No                         | Quality/cost tuning.                                                                                   |
| `orchestrator_agent_wiring_v1`   | `orchestrator-steps.ts`                                        | Indirectly                 | Controls agent side-effects from orchestrator.                                                         |
| `scout_agent`                    | `scout.ts`                                                     | Indirectly                 | **Called without `organisationId`** — behaves as a global flag only.                                   |
| `vouch_agent`                    | `vouch.ts`                                                     | Indirectly                 | Per-org when org id passed.                                                                            |
| `circular_vouch_depth_3`         | `vouch.ts`                                                     | No                         | Safety / fraud prevention.                                                                             |
| `verify_agent`                   | `verify.ts`                                                    | Indirectly                 | Background verification.                                                                               |
| `ghostbuster_authenticity_agent` | `ghostbuster-authenticity.ts`                                  | Indirectly                 | LLM authenticity.                                                                                      |
| `scheduler_agent`                | `scheduler.ts`                                                 | Indirectly                 | Scheduling automation.                                                                                 |
| `consent_flow`                   | `consent.ts`                                                   | **Compliance** — not a SKU | Critical; should never be presented as a “customer toggle” in self-serve billing UI.                   |
| `billing_provider_razorpay`      | `billing-provider.ts`                                          | N/A                        | Infra / payment rail.                                                                                  |
| `whatsapp_referral_consent_v2`   | `referral-handler.ts`                                          | No                         | WhatsApp UX variant.                                                                                   |
| `ack_*` (9 keys)                 | `acknowledgements/flags.ts`, notifier                          | Mixed                      | Operational rollout of acknowledgement pipeline; not mapped to Stripe today.                           |

**Voice:** No matching `isEnabled("...voice...")` in `src/` for the screening voice path — **voice is not behind the same flag system** as agents above.

---

## 5. Flags in DB / schema that are weakly or unused in app code

**Seeded in `supabase/schema/36_rate_limit_and_flags.sql` (examples):**  
`fitscore_agent`, `rerank_agent`, `ghostbuster`, `employee_portal`, `salary_arbitrage`, `ai_summaries`, `whatsapp_templates` — **not found** as `isEnabled("…")` in `src/` in this audit (some agent names appear as code modules, not as flag keys).

**Migrations added:**

- `scoring_phase1_wiring` — marked deprecated in migration description.
- `scoring_v2_shadow_enabled`, `scoring_v2_primary` — **no reads in `src/`**; `persistShadowV2Score` **uncalled** from other modules.

**Risk:** Super admins see toggles that **do nothing** or do something only in a forgotten code path — undermines trust.

---

## 6. UX problems (admin + customer)

1. **Admin feature flags page** (`src/app/(dashboard)/admin/feature-flags/page.tsx`): Renders all flags with title-cased keys — **no grouping**, **no “chargeable”**, **no link to docs**, **no warning** for consent/legal flags.
2. **Per-org runtime overrides** (Admin Organisations): Powerful but easy to misconfigure relative to **plan entitlements** — two knobs for “is this on?”
3. **Customer-facing settings:** If any UI exposes raw flag names, it will read as engineering jargon.

---

## 7. Target principles (agree before build)

1. **Default-on product:** The application ships with features **available**; **commercial** limits are enforced via **entitlements + metering**, not by “mystery flags default false.”
2. **Three layers (proposed):**
   - **Layer 1 — Safety / compliance:** Hard rules (consent, PII) — not merchant-toggleable for revenue.
   - **Layer 2 — Plan entitlements:** What the subscription includes (nav + coarse API guards).
   - **Layer 3 — Usage meters:** Overage and true pay-as-you-go (Stripe metered prices, invoices, or internal ledger → invoice).
3. **Single source of truth per concern:** One place defines “what we sell”; one place defines “what code checks for API access”; flags only for **rollout** and **incident response**, not permanent SKU definitions.

---

## 8. Phased plan (no code until alignment)

### Phase 0 — Stakeholder workshop (1–2 sessions)

- [ ] Confirm commercial packages: which entitlements are **included**, **add-on**, or **metered**.
- [ ] Decide fate of **voice**: entitlement key vs usage-only vs both.
- [ ] Decide fate of **`scoring_v2_*`**: implement wiring, delete flags, or hide from admin until wired.
- [ ] Policy on **scout_agent** global-only behavior — bug or intentional?

### Phase 1 — Inventory as code (engineering)

- [ ] Generate `docs/internal/feature-flag-registry.generated.md` (or JSON) from a script: **key → file:line → category → deprecated? → reads org override?**
- [ ] Mark each key: **active | deprecated | unused | dangerous**.
- [ ] Add CI check: new `isEnabled("new_key")` requires registry entry (optional).

### Phase 2 — Taxonomy and consolidation

- [ ] **Bucket A:** Rollout / kill-switch (keep in `feature_flags`, short TTL, admin-only).
- [ ] **Bucket B:** Entitlement (move to or mirror in `ENTITLEMENT_FEATURE_KEYS` + billing_plans + Stripe).
- [ ] **Bucket C:** Delete or stop seeding unused keys; migrate DB rows carefully on prod.

### Phase 3 — Billing alignment

- [ ] Document each `ENTITLEMENT_FEATURE_KEY` in Stripe Dashboard / `billing_plans` rows with **included vs overage** price IDs.
- [ ] For metered SKUs: define **unit** (e.g. agent run, FitScore call, voice minute) and **aggregation** (daily job vs real-time usage record).
- [ ] Reconcile **screening voice** spend (existing usage API / ledger) with the same model.

### Phase 4 — UX

- [ ] Admin: grouped flags, search, “operational only”, link to runbook, hide deprecated.
- [ ] Customer billing/settings: **plain English**, plan comparison, “what happens if I exceed limits”.
- [ ] Optional: internal-only “chargeable” column in admin generated from registry, not hand-maintained.

### Phase 5 — Hardening

- [ ] Audit `getOrganisationEntitlement` vs `isEnabled` on high-cost routes — ensure both align where needed.
- [ ] Logging: when a request is denied, log **reason** (plan vs kill-switch vs flag) for support.

---

## 9. Open questions (discussion checklist)

1. Should **any** runtime flag remain **default false** with missing row = false (`feature-flags.ts` today), or should product-critical paths default true with explicit kill-switch only for incidents?
2. Do we want **one admin screen** that merges “plan features” and “runtime flags” with clear sections, or **strict separation** (finance never sees `ack_*`)?
3. For **per-usage billing**, is Stripe **usage records** the canonical approach, or ledger-first with monthly true-up?
4. Should **voice** be: (a) included in a bundle, (b) add-on flat fee, (c) pure meter, or (d) hybrid?
5. **`agents_run` entitlement** vs per-agent flags — single commercial lever vs fine-grained toggles for enterprise deals?

---

## 10. References (code)

- Runtime flags: `src/lib/feature-flags.ts`
- Entitlements: `src/lib/entitlements/config.ts`, `src/lib/entitlements/index.ts`, `src/app/api/entitlements/route.ts`
- Stripe plan defaults: `src/lib/services/stripe.ts`
- Nav gating: `src/components/dashboard/navigation.tsx` (`NAV_FEATURE_GATES`)
- Hybrid v2 constant: `src/lib/fitscore/hybrid/constants.ts` (`FEATURE_FLAG_HYBRID_V2`)
- Admin flags UI: `src/app/(dashboard)/admin/feature-flags/page.tsx`
- Screening usage (voice counts): `src/app/api/screening/usage/route.ts`

---

_This document reflects repository state at audit time; re-run the Phase 1 script after significant merges._
