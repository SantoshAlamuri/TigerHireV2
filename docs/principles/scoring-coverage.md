# Scoring coverage principle

## Principle

Every candidate, on every apply surface, receives the **same full scoring stack** the product exposes for that job: today that means **FitScore (hybrid v2)** with HM-approved rubric inputs; as additional layers ship per program docs (**Ideal Match**, **Market Position**, **Trust Score**), they join this stack **without per-channel exceptions**. Scoring runs when the job has an **HM-approved JD Base** (weights, thresholds, and ideal candidate profile packaged for that role). **No surface silently skips** eligible scoring; if prerequisites are not approved, the pair is **queued for later** rather than dropped.

## Covered surfaces (inventory)

Apply / ingestion entry points in this repo: **`POST /api/apply`**, **`POST /api/applications`** (+ Inngest `fit-score-single`), **`POST /api/agency/upload-profile`**, **`POST /api/agency/upload-profile/bulk`**, **`POST /api/intake/email`**; WhatsApp **`lane-a`**, **`immediate-match`**, **`job-alert`** (and **`POST /api/cron/job-alerts`**), **`role-guided-flow`**, **`triggerScoutAgent`**, **`application-bridge`** (application from existing score — no re-score). Dashboard/API ops (**`/api/fit-score`**, agency reprocess/rescore, admin FitScore test) should use the same scorer contract even though they are not apply surfaces.

**Architectural exception — agency bulk ingest:** `POST /api/agency/upload-profile/bulk` intentionally performs **storage + DB save only** in the HTTP request (many parallel files, serverless time limits, predictable UX). It is **not** exempt from the principle end-to-end: parse/score must still run via the **canonical scorer** afterward (“Score Pending” / batch reprocess). Do not fold full FitScore into that request without an explicit design review.

## Required architecture

There must be **one canonical entry point** for “score this candidate against this job,” e.g. `scoreCandidateForJob(candidateId, jobId, context)`. Every apply path invokes it (directly or via a thin wrapper). That function:

1. Loads job + candidate context.
2. Evaluates **JD Base approval** (and, when product distinguishes it, **ICP approval** within that package).
3. If approved: runs the **full scoring stack** for that job (FitScore today; additional dimensions as they land).
4. If not approved: **queues** the `(jobId, candidateId)` pair for a sweep after approval — **never silent no-op** for an eligible apply.

## Out of scope (today)

- **Ideal Match** / **Market Position** as separate BRD phases beyond what hybrid FitScore already persists (e.g. `ideal_match_pct`, market percentile where populated).
- **Trust Score** as its own workstream (not gated on every apply path in this doc).

This principle **binds now on FitScore + JD Base approval** and **extends mechanically** as new layers attach to the canonical scorer.

## Related docs

- **[FitScore entrypoints — current state](./scoring-entrypoints-current.md)** — canonical inventory (which routes call `FitScoreService`, what is fixed vs open). **Read this first** before older audits.
- [WhatsApp inbound perceived-latency](./whatsapp-inbound.md) — typing vs interim text, Lane A vs role-picker; inbound-handler UX invariants alongside scoring paths below
- [Dimensions Ontology BRD](../brds/dimensions-ontology.md) — versioned home (import from workspace `.docx`; see file header for sync steps)
- [FitScore hardening PRD](../ops/FITSCORE_HARDENING_PRD.md)
- [Dimensions Ontology / FitScore rollout control](../scoring-v2-release-control.md) — verification and rollout checklist alongside the BRD
- [Platform cost ledger hardening brief](../briefs/platform-cost-ledger-hardening.md)
