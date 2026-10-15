# PRD Full — GitHub Issues manifest

**Source of truth for scope:** [PRD-FULL-Gap-Tracker-TigerHire-vs-GoPerfect.md](./PRD-FULL-Gap-Tracker-TigerHire-vs-GoPerfect.md)  
**Sprint mapping:** [SPRINT-PRD-MVP.md](./SPRINT-PRD-MVP.md)

Use this file to create GitHub issues manually (copy title + body) or via `gh issue create` (see [Import with GitHub CLI](#import-with-github-cli)).

## Label convention (create in repo if missing)

| Label                                         | Meaning                           |
| --------------------------------------------- | --------------------------------- |
| `prd-full`                                    | Tracks GoPerfect parity PRD slice |
| `feature-f1` … `feature-f8`                   | Feature area                      |
| `priority-p0` / `priority-p1` / `priority-p2` | Priority                          |
| `type-feature`                                | Net-new product behaviour         |

**Suggested milestones:** `PRD-MVP-sprint-1`, `PRD-MVP-sprint-2`

---

## F8-01 — Unlimited seats: align billing and product with PRD

- **Title:** `[F8-01] Unlimited seats: align billing and product with PRD`
- **Labels:** `prd-full`, `feature-f8`, `priority-p0`, `type-feature`
- **Milestone:** `PRD-MVP-sprint-1`

### Body (copy below)

```markdown
## Tracker

- Row: **F8-01** in `docs/requirements/PRD-FULL-Gap-Tracker-TigerHire-vs-GoPerfect.md`

## Goal

PRD Feature 8 states all seats (Admin, Recruiter, Viewer) are included in every plan at no per-user cost. Remove the contradiction where billing/marketing still advertises seat tiers (e.g. “Team seats (5)”) while PRD promises unlimited seats everywhere.

## Acceptance criteria

- [ ] Pricing / plan copy matches PRD: no prospect-facing implication that seats are the paid limit on lower tiers (unless product/legal explicitly overrides PRD — then update PRD instead).
- [ ] Team management UX does not block invites or show a hard “seat limit reached” state inconsistent with PRD.
- [ ] Any server-side enforcement of seat caps is either removed, aligned to “unlimited”, or documented as an intentional exception with PM sign-off.

## Implementation audit checklist (complete before closing)

Billing and marketing copy:

- [ ] `src/app/(dashboard)/company/billing/page.tsx` — plan bullets (“Team seats (5)”, “Team seats (15)”, “Unlimited seats”, etc.)

Defaults and org display:

- [ ] `src/lib/mappers.ts` — `seatsTotal` / `seatsUsed` fallbacks tied to `company_plan` (e.g. growth → 5, scale → 15)
- [ ] `src/components/dashboard/TeamManagementContent.tsx` — surfaces `seats_used` / `seats_total` from org API

API / invites:

- [ ] `src/app/api/organisations/members/route.ts` — confirm invite/bulk paths do not enforce seat ceilings (re-verify after any change)

Entitlements and billing services:

- [ ] `src/lib/entitlements/` — grep for seat / member cap patterns
- [ ] Stripe checkout or plan metadata (search `seat`, `seats` under `src/lib/services/stripe` and related routes)

Tests and fixtures:

- [ ] `tests/unit/mappers.test.ts` — expectations for `seats_total` / `seats_used`

Public marketing:

- [ ] Any marketing or pricing pages under `src/app/(public)/` that mention seat limits

## Notes

Invite route currently has no `seat` string match; still verify RLS, org limits, and future entitlements so “unlimited seats” is true end-to-end, not copy-only.
```

---

## F1-02 — Screening threshold 1–5: Shortlist vs Deprioritised

- **Title:** `[F1-02] Inbound screening: recruiter threshold (1–5) and bucket assignment`
- **Labels:** `prd-full`, `feature-f1`, `priority-p0`, `type-feature`
- **Milestone:** `PRD-MVP-sprint-1`

### Body

```markdown
## Tracker

- **F1-02** in `docs/requirements/PRD-FULL-Gap-Tracker-TigerHire-vs-GoPerfect.md`

## Goal

Recruiter-configurable threshold (1–5, default 3) determines whether a candidate lands in **Shortlist** vs **Deprioritised** after FitScore runs. Shortlist is the default view; deprioritised is excluded by default.

## Acceptance criteria

- [ ] Threshold stored per job (or org+job policy) and editable in recruiter UI.
- [ ] New applicants evaluated against current threshold; existing bucket behaviour per PRD AC-3 (document: retain vs recompute on threshold change).
- [ ] List/query APIs and pipeline views respect bucket filters.

## Existing code

- Auto-score on apply: `src/app/api/applications/route.ts` (enqueue `fit-score-single` / fallback)
- Inngest: `src/inngest/functions.ts` (`fit-score-single`)

## Open decisions

- Source of truth for bucket: new column(s) on `applications` / `pipeline_candidates` vs derived from latest `fit_scores` + threshold.
- Mapping from numeric FitScore to 1–5 scale for comparison to threshold (product rule).
```

---

## F1-03 — Dashboard banner: screening counts today

- **Title:** `[F1-03] Inbound screening: dashboard banner (received / shortlisted / deprioritised today)`
- **Labels:** `prd-full`, `feature-f1`, `priority-p0`, `type-feature`
- **Milestone:** `PRD-MVP-sprint-1`

### Body

```markdown
## Tracker

- **F1-03** in `docs/requirements/PRD-FULL-Gap-Tracker-TigerHire-vs-GoPerfect.md`

## Goal

Persistent banner (recruiter dashboard): **Screening active — [N] received | [M] shortlisted | [K] deprioritised today** (PRD copy can be tuned). PRD NFR: counters feel real-time (&lt; ~5s lag vs ideal).

## Acceptance criteria

- [ ] Counts scoped per org (and optionally per job when on job context).
- [ ] “Today” boundary defined in org timezone or UTC (document in UI/helper).
- [ ] Performance: avoid heavy unindexed scans at scale (counter table, rollup, or bounded query — spike if needed).

## Depends on

- **F1-02** (bucket definitions) for shortlisted vs deprioritised counts.
- Application receipt signal for “received” (may equal applications created today for that job/org).

## Existing code

- Apply creation path: `src/app/api/applications/route.ts`
```

---

## F1-04 — Pause inbound screening per job

- **Title:** `[F1-04] Inbound screening: pause per job without losing scores`
- **Labels:** `prd-full`, `feature-f1`, `priority-p0`, `type-feature`
- **Milestone:** `PRD-MVP-sprint-1`

### Body

```markdown
## Tracker

- **F1-04** in `docs/requirements/PRD-FULL-Gap-Tracker-TigerHire-vs-GoPerfect.md`

## Goal

Recruiters can **pause** inbound screening for a job; existing scores remain. New applications behaviour while paused must be explicit (see decisions).

## Acceptance criteria

- [ ] Pause toggle visible on job screening settings (or equivalent).
- [ ] While paused: either skip enqueueing FitScore OR queue and hold (pick one; document in PRD acceptance).
- [ ] Resume continues processing per chosen policy.

## Existing code

- `src/app/api/applications/route.ts` — enqueue `fit-score-single` / fallback compute
- `src/inngest/functions.ts`

## Open decisions

- Paused + new apply: skip scoring until resume vs accept and score later (queue depth).
```

---

## F3-01 — Score card: star rating (1–5) + headline + criterion bullets

- **Title:** `[F3-01] Explainability: star rating, headline, and 3–5 criterion bullets on candidate cards`
- **Labels:** `prd-full`, `feature-f3`, `priority-p0`, `type-feature`
- **Milestone:** `PRD-MVP-sprint-2`

### Body

```markdown
## Tracker

- **F3-01** in `docs/requirements/PRD-FULL-Gap-Tracker-TigerHire-vs-GoPerfect.md`

## Goal

PRD trust pattern: each candidate card shows **1–5 stars**, a **one-sentence headline**, and **3–5** criterion-level bullets (not score-only).

## Acceptance criteria

- [ ] Stars derived from agreed mapping from existing FitScore output.
- [ ] Headline visible on primary recruiter/hiring-manager score surfaces.
- [ ] Bullet count capped 3–5 with sensible truncation rules.

## Existing code

- `src/components/dashboard/FitScoreCard.tsx`
- `src/components/fitscore/CandidateCard.tsx`
```

---

## F3-02 — Criterion row: Met / Partial / Not met + evidence

- **Title:** `[F3-02] Explainability: Met / Partial / Not met icons per criterion + evidence line`
- **Labels:** `prd-full`, `feature-f3`, `priority-p0`, `type-feature`
- **Milestone:** `PRD-MVP-sprint-2`

### Body

```markdown
## Tracker

- **F3-02** in `docs/requirements/PRD-FULL-Gap-Tracker-TigerHire-vs-GoPerfect.md`

## Goal

Each criterion bullet: **label**, **status icon** (Met / Partial / Not met), **one-line evidence** from resume (reuse `evidence_text` where present).

## Acceptance criteria

- [ ] Tri-state producible from scoring engine output (align with PRD AC-2 testing).
- [ ] Accessible labels (not icon-only) for screen readers.

## Existing code

- `criteriaBreakdown`, `evidence_text`, `DimensionBar` in `src/components/dashboard/FitScoreCard.tsx`

## Open decisions

- Map grades / numeric partial credit → Met | Partial | Not met (document matrix in PR or ADR).
```

---

## F3-03 — Consistency guarantee badge on job page

- **Title:** `[F3-03] Explainability: “Consistency guarantee” badge on job page`
- **Labels:** `prd-full`, `feature-f3`, `priority-p1`, `type-feature`
- **Milestone:** `PRD-MVP-sprint-2`

### Body

```markdown
## Tracker

- **F3-03** in `docs/requirements/PRD-FULL-Gap-Tracker-TigerHire-vs-GoPerfect.md`

## Goal

Job page shows a badge: all **N** applicants evaluated against **identical criteria**, **last updated** date (PRD wording).

## Acceptance criteria

- [ ] N = count of applicants (or scored applicants — define precisely).
- [ ] Criteria version or rubric hash source documented; updates when rubric changes.

## Existing code

- Job detail surfaces (e.g. `src/app/(dashboard)/company/jobs/[id]/page.tsx` and recruit/agency equivalents — confirm which page is canonical for HM).
```

---

## F3-05 (slice) — Scoring audit: scope + minimal CSV export

- **Title:** `[F3-05] Explainability: scoring audit log scope + CSV export (PDF later)`
- **Labels:** `prd-full`, `feature-f3`, `priority-p1`, `type-feature`
- **Milestone:** `PRD-MVP-sprint-2`

### Body

```markdown
## Tracker

- **F3-05** in `docs/requirements/PRD-FULL-Gap-Tracker-TigerHire-vs-GoPerfect.md`

## Goal

PRD requires an audit trail of scoring events (candidate, job, criteria version, score, timestamp) with export. This issue is intentionally **narrow**: agree schema + ship **CSV** for score events; **PDF** is a follow-up issue unless trivial.

## Acceptance criteria

- [ ] ADR or issue comment: what counts as a “scoring event” (every compute vs dedupe).
- [ ] Append-only or immutable-friendly storage pattern agreed.
- [ ] CSV export with required columns; RBAC same class as existing fit-score exports.
- [ ] Follow-up issue linked for PDF.

## Existing code

- Related export (outcomes / pipeline signals, not full score log): `src/app/api/fit-score/feedback/export/route.ts`
```

---

## Optional epic (alternative grouping)

If you prefer one parent issue for inbound UI:

- **Title:** `[Epic-F1] Inbound screening control panel (F1-02, F1-03, F1-04)`
- **Body:** Link child issues F1-02, F1-03, F1-04; keep children for commits/PRs.

---

## Import with GitHub CLI

1. Create labels once (example):

```bash
gh label create "prd-full" --description "GoPerfect PRD parity" --color "0E8A16" 2>/dev/null || true
gh label create "feature-f1" --description "PRD F1 Inbound" --color "1D76DB" 2>/dev/null || true
gh label create "feature-f3" --description "PRD F3 Explainability" --color "5319E7" 2>/dev/null || true
gh label create "feature-f8" --description "PRD F8 Seats" --color "FBCA04" 2>/dev/null || true
gh label create "priority-p0" --description "P0" --color "B60205" 2>/dev/null || true
gh label create "priority-p1" --description "P1" --color "D93F0B" 2>/dev/null || true
gh label create "type-feature" --description "Feature" --color "A2EEEF" 2>/dev/null || true
```

2. Create an issue from a file (repeat per issue — extract body to temp file without the outer markdown code fence, or paste interactively):

```bash
gh issue create \
  --title "[F8-01] Unlimited seats: align billing and product with PRD" \
  --label "prd-full,feature-f8,priority-p0,type-feature" \
  --body-file path/to/f8-01-body.md
```

3. After creation, paste the GitHub issue URLs or numbers into [SPRINT-PRD-MVP.md](./SPRINT-PRD-MVP.md) under **GitHub links**.

---

## Issue creation order (recommended)

1. F8-01
2. F1-02 → F1-03 → F1-04 (F1-03 depends on F1-02)
3. F3-01 → F3-02 → F3-03 → F3-05

Link dependencies using GitHub “blocked by” / issue references in bodies (`Blocked by #123`).
