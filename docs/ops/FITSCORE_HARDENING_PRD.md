# FitScore Post-Preview Hardening PRD

**Purpose:** Single sequencing reference for Hybrid v2 hardening work (cost telemetry, caching, batch concurrency, evidence quotes, confidence UX).  
**Related:** `docs/ops/HYBRID_V2_ACCEPTANCE_GATES_2026-05-03.md`, `docs/ops/HYBRID_V2_CLAIM_ALIGNMENT.md`.

---

## §6 — Hardening backlog & sequencing

**Prerequisite (must complete before any §6 implementation below):** Platform cost ledger reliability — **`docs/briefs/platform-cost-ledger-hardening.md`**. Do not ship §6 items in parallel with ledger work; acceptance tests A–E there are the gate.

### Cost-reduction & model-migration status (2026-05-09)

**Deprioritized:** Haiku migration studies, token “squeeze” investigations, and related cost-only backlog items are **paused** until the business explicitly unblocks them (see `docs/ops/parked-work.md`: **TH-VISION-MODEL-EVAL**, **TH-CV-PARSER-MODEL-EVAL**).

**Ledger telemetry:** Working in production; per-profile spend is **trustworthy** at roughly **USD $0.07–0.10** (~**₹6.65–9.50**), sourced from **`platform_cost_events`** plus Anthropic Console cross-checks. **Cost is not treated as a production blocker** at this time.

**§6 sequencing implication:** Continue planning **non-cost** hardening themes below (caching, concurrency, evidence quotes, confidence UX) without waiting on model-cost experiments. Revisit cost-driven model changes when **Sonnet deprecation forces a move** (see Anthropic notice, **June 15, 2026**) or when priorities change.

### Day 0 — Ledger gate (blocking)

- Implement and verify **`platform_cost_events`** reconciliation to Anthropic Console (production API key, UTC day), Sonnet vs `fitscore_extraction_log`, attribution, cache token persistence, and upsert/logging fixes — per the brief.
- Run **measurement protocol** in that brief: 10 QA profiles, **single** hybrid pass; ledger within **1%** of Console Usage; memo per-pass cost **Haiku vs Sonnet**.
- If ledger vs Console gap **> 5%**, ledger fix is incomplete — **stop**; do not start §6 Day 1+.

### After Day 0 acceptance (order TBD by DRI; typical themes)

1. **Prompt caching** — measurable cache read / cost reduction (ledger proves delta).
2. **Batch concurrency (`p-limit`)** — align configured limit with observed high-water mark under load.
3. **Evidence quotes** — quality gates (`FF_VERDICT_CV_EVIDENCE`) once measurable.
4. **Confidence bands** — (`FF_CONFIDENCE_BAND`) once measurable.

Each item requires **before/after** unit cost from an honest ledger; otherwise sequencing is blind.

---

## Revision history

| Date       | Change                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-09 | Added §6 with **Day 0 ledger prerequisite** + brief link                                                                     |
| 2026-05-09 | §6: noted **cost-reduction deprioritized**; ledger baseline honest; resume non-cost hardening without blocking on Haiku eval |
