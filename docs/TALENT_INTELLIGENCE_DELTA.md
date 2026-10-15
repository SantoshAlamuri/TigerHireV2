# TigerHire Talent Intelligence Delta

**Status:** Implemented  
**Built on:** FitScore v2 Hybrid Engine  
**Date:** 2026-03-23

---

## What This Is

FitScore v2 answers one question: _"Does this candidate match the JD?"_

The Talent Intelligence Delta adds three more layers that transform TigerHire from a matching engine into a full talent intelligence system:

| Layer             | Question                                         | Source                                                     |
| ----------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| **FitScore**      | Does this candidate match the JD?                | Claude extraction + deterministic engine _(already built)_ |
| **Ideal Profile** | How far is this candidate from the perfect hire? | Claude generates ideal profile per JD + gaps per candidate |
| **Market Score**  | How does this candidate compare to the pool?     | `fit_scores` table, percentile within `role_function`      |
| **Verdict**       | Should we hire, dig deeper, or pass?             | Combines all three signals                                 |

---

## Verdict Decision Matrix

| FitScore | Market    | Ideal Match | Verdict             | Action                        |
| -------- | --------- | ----------- | ------------------- | ----------------------------- |
| >= 65    | Top 25%   | >= 65%      | **Strong Hire**     | Interview immediately         |
| >= 65    | Top 25%   | < 65%       | **Strong Hire**     | Interview — close to ideal    |
| >= 65    | Below 25% | Any         | **Safe Hire**       | Solid match, common in market |
| < 65     | Top 25%   | >= 40%      | **Hidden Gem**      | Rare profile — dig deeper     |
| < 65     | Top 25%   | < 40%       | **Niche Talent**    | Rare but significant gaps     |
| < 65     | Below 25% | Any         | **Pass**            | Does not match, below average |
| Any      | No data   | Any         | Good Fit / Moderate | Market data building          |

---

## Database Changes

**Migration:** `20260323150000_talent_intelligence_delta.sql` (applied via Supabase MCP)

### `jd_base_documents` — 1 new column

| Column                    | Type    | Description                                                                        |
| ------------------------- | ------- | ---------------------------------------------------------------------------------- |
| `ideal_candidate_profile` | `jsonb` | LLM-generated profile: summary, must_haves, nice_to_haves, years_range, benchmarks |

### `fit_scores` — 7 new columns

| Column              | Type      | Description                                                |
| ------------------- | --------- | ---------------------------------------------------------- |
| `ideal_match_pct`   | `integer` | 0–100, % match against ideal profile                       |
| `ideal_gaps`        | `text[]`  | Specific gaps vs the ideal candidate                       |
| `market_percentile` | `integer` | Percentile rank in same role_function pool                 |
| `market_pool_size`  | `integer` | Total candidates in comparison pool                        |
| `market_label`      | `text`    | Human-readable label (e.g. "Top 10% — Rare")               |
| `verdict`           | `text`    | Strong Hire / Safe Hire / Hidden Gem / Niche Talent / Pass |
| `verdict_action`    | `text`    | Recommended recruiter action                               |

### `market_score_pools` — new materialized view

Precomputed pool of v2 scores by `role_function` from the last 6 months. Indexed on `role_function`.

---

## New Files

| File                                       | Purpose                                                                           |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `src/lib/fitscore/hybrid/ideal-profile.ts` | `IdealCandidateProfile` + `IdealMatchResult` interfaces, type guard               |
| `src/lib/fitscore/hybrid/market-score.ts`  | `computeMarketScore()` — percentile ranking within role pool, cold-start handling |
| `src/lib/fitscore/hybrid/verdict.ts`       | `computeVerdict()` — decision matrix with label, icon, color, bg, action          |

---

## Modified Files

| File                               | What Changed                                                                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                         | `JDBaseDocument` gets `idealCandidateProfile`, `CandidateExtraction` gets `ideal_match_pct` + `ideal_gaps`, `HybridScoreResult` gets `market`, `idealMatch`, `verdict` |
| `jd-base.ts`                       | Generation prompt now produces `ideal_candidate_profile`. `rowToJdBase` parses it. `updateJdBaseDocument` accepts profile patches.                                     |
| `extraction.ts`                    | Prompt includes ideal profile context (IDEAL CANDIDATE + MUST-HAVES), requests `ideal_match_pct` and `ideal_gaps`                                                      |
| `explanation.ts`                   | New `runVerdictExplanation()` — 3-sentence explanation with market position + ideal gaps + interview guidance                                                          |
| `pipeline.ts`                      | Added Steps 5–8 after existing extract/score/explain: market score → verdict → verdict explanation → persist new columns                                               |
| `persist.ts`                       | Upsert includes all 7 new talent intelligence columns                                                                                                                  |
| `index.ts`                         | Re-exports `ideal-profile`, `market-score`, `verdict`                                                                                                                  |
| `fitscore-hybrid.ts` (validations) | `candidateExtractionSchema` adds `ideal_match_pct`, `ideal_gaps`. New `idealCandidateProfileSchema`. `jdBaseUpdateSchema` accepts `idealCandidateProfile`.             |
| `score/route.ts`                   | Response includes `market`, `idealMatch`, `verdict` objects                                                                                                            |
| `jd-base/route.ts`                 | Serializes and accepts `idealCandidateProfile` in GET/POST/PUT                                                                                                         |
| `CandidateCard.tsx`                | 3-column MetricCard row, verdict banner, IdealProfilePanel with green/red pills, "Why this verdict"                                                                    |
| `JDBaseEditor.tsx`                 | Ideal profile section with summary textarea + must-haves tag input                                                                                                     |

---

## Updated Pipeline Flow

```
1. Resolve JD Base (existing)
2. Extract candidate signals via Claude (now includes ideal_match_pct + ideal_gaps)
3. Deterministic scoring engine (existing)
4. Ideal match data (from extraction)
5. Market score — percentile within role_function pool     ← NEW
6. Verdict — decision matrix combining all three signals   ← NEW
7. Verdict explanation — 3-sentence Claude explanation      ← NEW
8. Persist all fields to fit_scores                        ← UPDATED
```

---

## API Response Shape

`POST /api/fitscore/score` now returns:

```json
{
  "fitScore": 79,
  "fitLabel": "Good Fit",
  "fitLabelColor": "#D6E8F7",
  "extraction": { "..." },
  "explanation": "3-sentence verdict explanation",
  "breakdown": { "..." },
  "market": {
    "percentile": 88,
    "topPct": 12,
    "label": "Top 25% - Strong",
    "poolSize": 142
  },
  "idealMatch": {
    "ideal_match_pct": 62,
    "ideal_gaps": ["No Docker/K8s experience", "No startup launch"]
  },
  "verdict": {
    "label": "Hidden Gem",
    "icon": "diamond",
    "color": "#BA7517",
    "bg": "#FAEEDA",
    "action": "Rare profile - dig deeper"
  }
}
```

---

## Tests

18 tests pass in `fitscore-hybrid-engine.test.ts` (10 existing + 8 new):

| ID    | Test                                                   | Status |
| ----- | ------------------------------------------------------ | ------ |
| TC-11 | Market percentile for top scorer in pool of 10         | Pass   |
| TC-12 | Cold start: pool < 5 returns "Market data building..." | Pass   |
| TC-13 | FitScore 80 + Top 10% = Strong Hire                    | Pass   |
| TC-14 | FitScore 45 + Top 5% = Hidden Gem                      | Pass   |
| TC-15 | FitScore 45 + Top 70% = Pass                           | Pass   |
| TC-16 | ideal_match_pct is between 0–100                       | Pass   |
| TC-17 | ideal_gaps is non-empty for < 80% match                | Pass   |
| TC-18 | Cold start + high FitScore = Good Fit fallback         | Pass   |

---

## Backward Compatibility

- All new props on `CandidateCard` and `JDBaseEditor` are optional — components render fine with v2-only data.
- New `fit_scores` columns are all nullable — existing rows are unaffected.
- `HybridScoreResult` now includes `market`, `idealMatch`, `verdict` but callers that destructure only the v2 fields continue to work.
- The pipeline falls back to the original `runHybridExplanation` if no ideal profile or market data is available.

---

## Score UI Non-Regression (Preview Guardrail)

When iterating on candidate score UI (for example introducing a reasoning panel), **do not drop core intelligence signals** from the prior FitScore card.

### Must-preserve signals

1. **Top metrics row**
   - `overall_score` (FitScore)
   - `market_label` / market percentile projection (Market rank)
   - `ideal_match_pct` (Ideal profile match)
2. **Verdict banner**
   - `verdict` label + `verdict_action` text
3. **Role criterion attributes**
   - `criteria_breakdown[*].criterion_name`
   - `criteria_breakdown[*].weight`
   - per-criterion visual score bar
4. **Why this verdict**
   - `holistic_rationale` or fallback to `one_line_summary`
5. **Trust/footer signals**
   - `provenance_hash` (short preview + copy)
   - extraction model footnote (`extraction_model`, `extraction_fallback`)

### New panel additions that can co-exist

- Criteria-level CV evidence expansion (`evidence_snapshot`)
- Rubric modal (`rubric_snapshot`)
- Formula/Blend explanation (`blend_reasoning`, `scoring_formula`)
- Deferred state handling (`scoring_status = deferred`)
- Low parse quality warning (`parse_quality_score < 0.7`)

### Implementation note

Current fused implementation:

- `src/components/dashboard/FitScoreReasoningPanel.tsx` (full panel)
- `src/components/dashboard/FitScoreHero.tsx` (hero row)
- `src/components/dashboard/FitScoreHoverCard.tsx` (pipeline hover card)
- Candidate page integration: `src/app/(dashboard)/recruit/candidates/[id]/page.tsx`

Any future redesign should preserve the "must-preserve signals" list above before visual changes.
