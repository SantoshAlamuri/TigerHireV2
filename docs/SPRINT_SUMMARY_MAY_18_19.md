# Sprint summary — May 18–19, 2026

**Audience:** Leadership, product, and engineering.  
**Scope:** Two-day FitScore architecture and UX sprint (cost, quality, JD Base).

This document records **measured outcomes** and **decisions**, not only what shipped. For how the system works today, see **`docs/SCORING_ARCHITECTURE.md`**.

---

## Cost reduction (measured)

| Metric                 | Before                 | After (May 2026)                                     |
| ---------------------- | ---------------------- | ---------------------------------------------------- |
| Per-profile cost       | **₹7.60**              | **~₹2.40** (target; **pending 50-score validation**) |
| Calls per score        | **5.3**                | **1.0** (merged extraction+verdict)                  |
| Cache hit rate         | **0%**                 | **~72%** (after merged system prefix)                |
| Vision fallback (PDFs) | **~80%**               | **0%** (with `FF_VISION_FALLBACK_ENABLED=false`)     |
| Sonnet share of spend  | **72%** (vision waste) | **100%** (intentional — scoring path only)           |

**Branches:** `claude/fitscore-cost-dedupe-guards` — dedupe, locks, 3-tier parse chain, deterministic fallback, daily metrics, ledger source tagging.

---

## Scoring quality (measured on 8 recruiter-graded candidates)

QA Engineer job: `861e8c58-9c72-4c46-8534-a02207a35cbc`. Recruiter scores are ground truth from validation cohort (see `scripts/calibrate-qa-jd-base-and-rescore.ts`).

| Iteration                             | Mean error vs recruiter | Vilas (recruiter 75) |
| ------------------------------------- | ----------------------- | -------------------- |
| Senior rubric (wrong)                 | **~30+ points**         | **29**               |
| Essentials v2 (right rubric, lenient) | **~22 points**          | **86**               |
| Essentials v3 strict                  | **~17 points**          | **72**               |

**Final validation (2026-05-19):** Force-rescored with `FF_FITSCORE_BLEND_V2=true`, `FF_MERGED_EXTRACTION_VERDICT=true`, `FF_VISION_FALLBACK_ENABLED=false` via `scripts/rescore-qa-eight-verify.ts` (same as `FitScoreService.computeSingle` + `force: true` in `scripts/score-candidate.ts`).

| Candidate   | Recruiter | Old TriBlend (`shadow_score`) | New 25/75 FitScore | ICP Match | Market Rank |
| ----------- | --------- | ----------------------------- | ------------------ | --------- | ----------- |
| Preethi     | 70        | 82                            | 74                 | 86%       | 84          |
| Dhanush     | 70        | 73                            | 74                 | 62%       | 79          |
| Subramanian | 80        | 79                            | 76                 | 74%       | 85          |
| Arulmani    | 60        | 85                            | 79                 | 74%       | 97          |
| Prashanth   | 50        | 78                            | 76                 | 71%       | 85          |
| Vilas       | 75        | 64                            | 60                 | 71%       | 58          |
| Niranjan    | 30        | 56                            | 54                 | 71%       | 40          |
| Pratibha    | 60        | 70                            | 65                 | 78%       | 66          |

**Mean absolute error vs recruiter:** TriBlend **14.5** pts → 25/75 FitScore **12.6** pts (closer on average). Vilas remains the hardest case (recruiter 75 vs 60 FitScore vs 64 TriBlend). All eight rows have **ICP Match** and **Market Rank** populated.

**Ops note:** Most runs hit extraction validation (quote substring) but still persisted scores; Preethi used **deterministic fallback** after JSON parse failure. Cache reads **1878** tokens per call after the first score on this JD Base.

---

## Root causes identified

1. **Template `india-008`** overrode JD intent — senior automation rubric on a **2–4 year manual QA** role.
2. **TriBlend (40/30/30)** was not the intended product design — replaced with **25% skills + 75% intent** primary score.
3. **JD Base** bundled rubric + ICP into one opaque approval — split into **3 screens** (ICP → Rubric → Review).
4. **ICP** was effectively must-have skills only — expanded to **traits** and **background preferences**.

---

## Architecture decisions made

| Decision                                                       | Rationale                                             |
| -------------------------------------------------------------- | ----------------------------------------------------- |
| **Sonnet** for merged scoring                                  | Quality on extraction + verdict                       |
| **Haiku** for parse tier 2 only                                | Cheap text enrichment when pdfjs &lt; 2000 chars      |
| **LLM scores now**; deterministic engine in shadow next sprint | Ship recruiter-trusted numbers first                  |
| **Three scores on cards** — FitScore, ICP Match, Market Rank   | Stop hiding ICP/market inside one blended number      |
| **WhatsApp ICP enrichment**                                    | Scoped **next sprint** (positioned as long-term moat) |

**Branches:** `claude/jd-wizard-fitscore-blend-v2` — 3-screen wizard, blend v2, three-score UI, extraction `signals_log`.

---

## Shipped controls (reference)

- 4h dedupe + concurrent Postgres locks
- Merged Sonnet call (`FF_MERGED_EXTRACTION_VERDICT=true`)
- Prompt cache on single system prefix
- Deterministic fallback on JSON failure
- `scoring_daily_metrics` cron

Details: `docs/FITSCORE_COST_CONTROLS_BRIEF.md`, `docs/SCORING_HARDENING_STATUS.md`.

---

## Related documents

| Doc                                     | Topic                                           |
| --------------------------------------- | ----------------------------------------------- |
| `docs/SCORING_ARCHITECTURE.md`          | Full pipeline                                   |
| `docs/JD_BASE_APPROVAL_FLOW.md`         | 3-screen wizard                                 |
| `docs/ops/HYBRID_V2_CLAIM_ALIGNMENT.md` | Gates and metrics                               |
| `docs/ops/parked-work.md`               | Deferred items (WhatsApp ICP, verdict redesign) |
