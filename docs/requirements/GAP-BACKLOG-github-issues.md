# GitHub issues: gap backlog export

**Sequencing / tier master list:** [GAP-BACKLOG-ordered-new-vs-edit.md](./GAP-BACKLOG-ordered-new-vs-edit.md) — use that file when prioritizing; this one is a **template for `gh issue create` bodies and labels** only (same content, different shape).

Suggested labels (create in the repo if missing):

- `gap-backlog`
- `new-module` — additive / greenfield-first
- `extend-existing` — extends or refactors existing flows
- `tier-a` | `tier-b` | `tier-c`

**Usage:** Create issues manually, or from the repo root (example):

```bash
gh issue create --title "A2: Application deadline reminders" --label "gap-backlog,new-module,tier-a" --body-file -
```

Paste the **Body** cell into `--body` or a temp file.

---

## Tier A

| ID  | Suggested title                                  | Labels                               | Body                                                                                                                                            |
| --- | ------------------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Analytics: time-in-stage / stage TAT + export    | gap-backlog, extend-existing, tier-a | Extend analytics views and `src/app/api/analytics` (+ export) for dwell time per pipeline stage. Ref: `supabase/schema/46_analytics_views.sql`. |
| A2  | Application deadline reminders                   | gap-backlog, new-module, tier-a      | Inngest scheduled job + notifications for approaching application deadlines.                                                                    |
| A3  | Re-apply and cooling-off rules per company       | gap-backlog, extend-existing, tier-a | Enforce re-application policy on apply/application APIs.                                                                                        |
| A4  | Candidate application analytics (views, matches) | gap-backlog, extend-existing, tier-a | Instrumentation + read APIs for candidate-facing application stats.                                                                             |
| A5  | Boolean / advanced saved search                  | gap-backlog, extend-existing, tier-a | Query builder + Zod validation on recruiter saved search.                                                                                       |
| A6  | Saved candidate lists (full CRUD)                | gap-backlog, new-module, tier-a      | New list entity, sharing, and UI wired to candidates.                                                                                           |
| A7  | Culture fit / extra assessment dimensions        | gap-backlog, new-module, tier-a      | Productized dimensions beyond screening agent; templates or assessment types.                                                                   |
| A8  | i18n shell + priority locales                    | gap-backlog, new-module, tier-a      | App Router i18n strategy + translation workflow for key surfaces.                                                                               |
| A9  | Candidate portfolio / projects                   | gap-backlog, new-module, tier-a      | Schema, profile UI, optional CV/AI extract.                                                                                                     |
| A10 | Skills quiz / verified skills                    | gap-backlog, new-module, tier-a      | Assessment-style flow or extension of assessments.                                                                                              |
| A11 | Salary / market benchmarking                     | gap-backlog, new-module, tier-a      | Data vendor or static tables + offer/job context UI.                                                                                            |
| A12 | Chatbot FAQ (public or candidate)                | gap-backlog, new-module, tier-a      | New API + UI; RAG or curated answers.                                                                                                           |
| A13 | Company comparison / culture tools               | gap-backlog, new-module, tier-a      | Greenfield UX + data model.                                                                                                                     |
| A14 | Email deep-link approvals (one-time tokens)      | gap-backlog, extend-existing, tier-a | G-P1-3: approver links from email; token store + expiry; offer/requisition routes.                                                              |
| A15 | OTP / magic-link public offer view               | gap-backlog, extend-existing, tier-a | G-P0-5: public offer acceptance without full account; rate limits; align with notification policy.                                              |
| A16 | Counter-offer workflow semantics                 | gap-backlog, extend-existing, tier-a | G-P2: fix counter so it does not map to `approved`; new version / stage restart. Ref: `src/app/api/offers`.                                     |
| A17 | BGV trigger hook (post-accept)                   | gap-backlog, extend-existing, tier-a | G-P2 / F-19: status transition + event; vendor in B3.                                                                                           |

---

## Tier B

| ID  | Suggested title                            | Labels                               | Body                                                                                                                              |
| --- | ------------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| B1  | E-signature for offers (vendor TBD)        | gap-backlog, extend-existing, tier-b | G-P0-4: envelope ID on offer, webhook, audit events; DocuSign/Dropbox Sign/Adobe.                                                 |
| B2  | Offer letter PDF + versioning              | gap-backlog, extend-existing, tier-b | Templates, storage, hash/version; ties to offer lifecycle.                                                                        |
| B3  | Background check vendor + pipeline stage   | gap-backlog, new-module, tier-b      | New integration module + pipeline stage + PII handling; pair with A17. Use `extend-existing` if only wiring after adapter exists. |
| B4  | LinkedIn / social sourcing                 | gap-backlog, new-module, tier-b      | OAuth, compliance, Easy Apply or enrichment scope decision.                                                                       |
| B5  | ATS / HRMS sync                            | gap-backlog, new-module, tier-b      | G-P1-5: webhooks + CSV fallback; mapping + idempotency.                                                                           |
| B6  | HRMS headcount/budget read-only (Finance)  | gap-backlog, new-module, tier-b      | Connector + finance dashboard context. Also label `extend-existing` for UI if preferred.                                          |
| B7  | Compensation bands + exception workflow    | gap-backlog, extend-existing, tier-b | G-P0-3: validation service + offer workflow branches.                                                                             |
| B8  | Hiring requisition BRD completeness        | gap-backlog, extend-existing, tier-b | G-P1-1: REQ-ID, Draft→Submitted, field set; `src/app/api/hiring-requests`.                                                        |
| B9  | Multi-tier offer approval (parallel gates) | gap-backlog, extend-existing, tier-b | G-P1-2: Legal, C&B, CHRO; generalize finance gate.                                                                                |
| B10 | Talent pool / nurture campaigns            | gap-backlog, new-module, tier-b      | Consent, segments, drip email/WhatsApp, silver-medalist re-engagement.                                                            |
| B11 | Post-hire onboarding module                | gap-backlog, new-module, tier-b      | Checklists, new-hire portal, tasks; separate from Pulse.                                                                          |
| B12 | Custom report builder + scheduled delivery | gap-backlog, new-module, tier-b      | BI-style reports; export + schedule.                                                                                              |
| B13 | DEI reporting + anonymised screening       | gap-backlog, new-module, tier-b      | Dashboards + optional blind shortlist mode; coordinate with FitScore/pipeline display.                                            |
| B14 | Skills taxonomy / ontology                 | gap-backlog, new-module, tier-b      | Master skills data + migrate jobs/FitScore inputs.                                                                                |
| B15 | Async one-way video interviews             | gap-backlog, new-module, tier-b      | Upload/review UX, storage, retention policy.                                                                                      |
| B16 | Native iOS / Android apps                  | gap-backlog, new-module, tier-b      | Mobile clients + push; API hardening.                                                                                             |

---

## Tier C

| ID  | Suggested title                                | Labels                               | Body                                                                                     |
| --- | ---------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| C1  | Hiring/offer audit: export, policy, reminders  | gap-backlog, extend-existing, tier-c | CSV/PDF export, HM read policy, reminder cadence; `src/lib/audit/hiring-offer-audit.ts`. |
| C2  | SLA / escalation engine (full rules)           | gap-backlog, extend-existing, tier-c | G-P0-2: 50/90/100/200%, escalation targets; extend workflow_stages + cron.               |
| C3  | Configurable workflow engine MVP               | gap-backlog, extend-existing, tier-c | Sequential then parallel stages for req + offer; DB-driven rules.                        |
| C4  | User-defined automation vs agent orchestrator  | gap-backlog, extend-existing, tier-c | Product decision + technical design; `src/lib/agents/orchestrator.ts`.                   |
| C5  | Enterprise dashboards (TTO, traceability, SLA) | gap-backlog, extend-existing, tier-c | G-P1-4: depends on audit + workflow metrics.                                             |
| C6  | Delegation / proxy approvers                   | gap-backlog, extend-existing, tier-c | G-P2: workflow participant model + security.                                             |
| C7  | Multi-language offer templates                 | gap-backlog, extend-existing, tier-c | G-P2: template i18n + merge fields.                                                      |

---

## Bulk create (optional)

If labels exist, you can loop in shell (adjust bodies as needed):

```bash
# Example for A2 only — repeat pattern for other IDs
gh issue create \
  --title "A2: Application deadline reminders" \
  --label "gap-backlog,new-module,tier-a" \
  --body "See docs/requirements/GAP-BACKLOG-ordered-new-vs-edit.md (A2)."
```

Linking every issue to [GAP-BACKLOG-ordered-new-vs-edit.md](./GAP-BACKLOG-ordered-new-vs-edit.md) keeps descriptions short and maintainable.
