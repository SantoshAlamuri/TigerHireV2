<!-- Imported from `TigerHire-Dimensions-Ontology-BRD.docx` (GitHub-flavored Markdown). Converted with mammoth; `pandoc` was not available in this environment—re-run locally with: `pandoc ~/Downloads/TigerHire-Dimensions-Ontology-BRD.docx -t gfm -o docs/brds/dimensions-ontology.md` if you prefer pandoc output. Risk and timeline sections were manually table-formatted after import. -->

**TigerHire — Dimensions Ontology Upgrade**

Business Requirements Document

**Status**

Draft for execution

**Owner**

Santosh

**Audience**

Engineering, Product

**Companion document**

Dimensions Ontology PRD (execution detail)

**Reference**

Codebase audit (file paths and risk classification)

## 1. Executive summary

TigerHire's scoring layer (FitScore) is the product's defensible-decisions engine. A recent codebase audit revealed that several capabilities the system advertises — role-specific scoring across 121 templates, dynamic dimension weights, transparent rationale — are coded but only partially wired in production.

This document defines the business intent, scope, success criteria, and risk envelope for an upgrade to the dimensions layer that closes that gap and lays the foundation for Layer 2 (Ideal Profile) and Layer 3 (Market Position). The companion PRD specifies the phased execution.

## 2. Problem statement

The audit surfaced five concrete issues between what the product narrates and what the runtime does:

- The generic rubric runs in production for the three-stage scoring path. The 121-role library exists in code but is not selected at runtime; the smarter selectRubric is unwired.
- Several callers bypass the hybrid pipeline even when a JD Base is approved — meaning approved per-JD weights are not always honored on the live path.
- The dimensions_json column exists but is not populated by the active scorer. The detail view that hiring managers see is built on top of data that isn't actually written.
- Blend math (signal/grade) is hardcoded in Stage 3, not configurable. A rubric weight validator exists but is unwired.
- FitScore is a single number with no confidence band. A score from rich evidence and a score from thin evidence look identical to a hiring manager.

The Sireesha case illustrates the cumulative effect. A Scrum Master profile scores 95+ regardless of whether the role calls for technical depth (Docker, CI/CD, security) or pure process leadership — because the LLM defaults to a textbook reading of "Scrum Master" and the dimension granularity is too coarse to detect specific gaps. The score is internally consistent; it is just not specific to the role being hired for.

The cumulative effect: the system produces verdicts that look defensible but are less role-specific than the product narrative claims, and that hiring managers cannot yet challenge with evidence.

## 3. Business objectives

In priority order:

1. Bring runtime behavior in line with the product narrative: every scored candidate evaluated against a role-specific rubric, with per-JD weights when an HM has approved a JD Base.
2. Make scoring decisions inspectable and configurable: dimensions, weights, and blend math live in data, not code.
3. Introduce confidence bounds so a verdict carries its own credibility signal — preventing thin-evidence Strong Fits from masquerading as confident calls.
4. Lay the substrate for Layer 2 (Ideal Profile must-haves) and Layer 3 (market percentile) without re-architecting the scoring core when those phases land.
5. Do all of the above without scoring regressions visible to existing customers.

## 4. Success metrics

### Phase 1 — Plumbing

- 100% of newly scored candidates use a role-specific rubric where one exists in the library; generic-rubric usage rate drops from current near-100% to under 10%.
- 100% of new fit_scores rows have dimensions_json populated.
- Zero regressions on the labeled regression set within numeric noise tolerance (±0.5 on 0–100 scale).

### Phase 2 — Structure

- Sub-signal taxonomy and evidence-type tables present and backfilled for all active rubrics.
- Blend constants readable from config table; runtime continues using current defaults until a flag flips in Phase 3.

### Phase 3 — Shadow

- V2 scores agree with V1 within tolerance on at least 80% of labeled candidates, OR disagree in ways aligned with HM verdicts on the disagreement set.
- Confidence bands available on V2 scores; correlate with evidence depth in expected direction.
- Cost per scored candidate increase contained within 2.5x V1 baseline.

### Phase 4 — Promote

- V2 promoted as primary; V1 sunset after 2-week safety window.
- Customer-visible label changes communicated; no support ticket spike from confused customers.

### Ongoing health metrics

- Score variance across same-role candidates: meaningful spread, not bunched at 90+.
- HM verdict alignment: at least 75% of HM Strong Hires score in top quartile.
- Cost per scored candidate tracked from Phase 1 baseline through Phase 3 ramp.

## 5. Scope

### In-scope

- Layer 1 FitScore upgrades: role-specific rubric selection, sub-signal composition, composition operators, evidence reliability priors, confidence bounds.
- Schema changes for dimensions, sub-signals, evidence types, and rubric versioning.
- Rubric version snapshotting on every score.
- Eval harness and observability sufficient to gate phase boundaries.

### Out-of-scope (explicit)

- Phase 2 HM approval gate (separate workstream — coordinated, not built here).
- Layer 2 Ideal Profile generation (downstream; lands after Phase 4).
- Layer 3 Market Position percentile (downstream; lands after Phase 4).
- Trust-risk signals ontology (separate domain; coordinates on shared evidence taxonomy in Phase 2).
- Roles ontology beyond what's required to attach sub-signals.
- Verdict engine changes (depends on Layers 2 and 3).
- Public marketing copy reconciliation (marketing workstream; coordinated, not built here).

## 6. Dependencies and coordination

- **Phase 2 HM approval gate workstream:** Not blocking, but the Sireesha-class problem is jointly fixed by the HM approval gate plus Layer 2 must-haves. This BRD coordinates only.
- **Trust-risk ontology workstream:** Must share the `evidence_type` table introduced in Phase 2. Schema lock with trust-risk owner before Phase 2 migration.
- **Roles ontology workstream:** If mid-flight at Phase 2, sub-signals attach to rubric only and migrate to `role_id` once roles land.
- **Marketing site:** Claims about role-specific scoring become true at Phase 1 promotion. Coordinate copy update with Phase 1 rollout.
- **DPDP/consent:** New evidence-type tagging produces additional personal-data shapes. Confirm new shapes sit inside existing consent scope before Phase 2 production rollout.

## 7. Risks and mitigations

| Risk                                                                                     | Likelihood          | Impact     | Mitigation                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------- | ------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Score regression visible to customers during rollout                                     | Medium              | High       | Phase boundaries with regression gates; labeled regression set; feature flags default OFF; staged rollout in Phase 3 (10% → 50% → 100%); 2-week V1-shadow safety net post-promotion. |
| Cost increase from sub-signal LLM calls                                                  | High                | Medium     | Cost per scored candidate tracked from Phase 1 baseline; budget alert at 2.5x V1; throughput burst-tested before Phase 3 promotion.                                                  |
| Scope creep into adjacent ontology domains                                               | Medium              | Medium     | Explicit out-of-scope list. Coordination points named (trust-risk, roles). Evidence-type table is the only shared schema artifact.                                                   |
| Tests mock the layer being changed (audit-flagged pattern)                               | High if unaddressed | High       | PRD requires every phase to deliver at least one test that exercises the change without mocking the changed layer.                                                                   |
| Eval harness collection bottlenecks Phase 3 gate                                         | Medium              | High       | Start collecting in Phase 1. Target 100 HM-verdicted candidates by Phase 3. Longest-lead-time item in the workstream.                                                                |
| Marketing copy promises drift from runtime                                               | Medium              | Medium     | Phase 1 unlocks the role-specific-scoring claim. Coordinate copy update with Phase 1 rollout, not after.                                                                             |
| Customer confusion from V1→V2 label changes (Strong Fit becomes Strong Fit ± confidence) | Medium              | Low–Medium | Opt-in preview window before cutover; release notes; one-page "what changed" doc; recovery path to re-score in V1 if a customer reports a regression on a specific candidate.        |

## 8. Timeline (indicative)

Phased; precise sequencing is in the PRD. Indicative durations:

| Phase               | Duration  | Headline                                                                                                                                           |
| ------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 — Plumbing  | 1–2 weeks | Wire selectRubric. Populate dimensions_json. Route bypassed callers through hybrid. Land observability and rubric versioning column.               |
| Phase 2 — Structure | 2–3 weeks | Additive schema: sub-signal taxonomy, evidence types, scoring config table. Backfill. No read-path changes.                                        |
| Phase 3 — Shadow    | 4–6 weeks | V2 composition runs in shadow. Sub-signals, composition ops, confidence bounds. Promotion gated by labeled set agreement and HM verdict alignment. |
| Phase 4 — Promote   | 1–2 weeks | V2 primary; V1 deprecated after 2-week safety window. Customer comms.                                                                              |

## 9. Sign-off

- Santosh — Product
- Engineering lead
- Optional: one external HM partner who can validate V2 verdict labels before Phase 4 cutover

_End of BRD. See companion PRD for execution detail and Cursor-facing file scope._
