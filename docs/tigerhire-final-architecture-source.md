# TigerHire FitScore — Final Architecture: Three-Stage Deterministic Scoring

**With Full Data Provenance & Audit Trail**  
March 2026 · Production spec for Cursor implementation.

Backed by: AutoSCORE (arXiv:2509.21910), RULERS (arXiv:2603.00077), PMC12909151 (LLM Consistency Study), DeepEval DAGMetric.

## 1. Design Principles

1. **LLMs understand. Algorithms score.** Use each tool for what it does well.
2. **Extract evidence before scoring.** First extract and structure evidence, then score deterministically (AutoSCORE, 2025).
3. **Lock the rubric with evidence rules.** Define upfront what evidence maps to each grade (RULERS, 2026).
4. **Same inputs → same score.** The scoring function is pure math; no LLM in Stage 3.
5. **Every score is fully traceable.** From the final number back to the exact resume text.
6. **Separate fit from logistics.** Salary, notice, location are filters alongside FitScore, not part of it.

## 2. Three-Stage Architecture

| Stage              | What it does                                | LLM?                    | Cached?               | Output        |
| ------------------ | ------------------------------------------- | ----------------------- | --------------------- | ------------- |
| 0. Parse           | Extract text from PDF/DOCX                  | Vision fallback only    | Per candidate         | Raw text      |
| 1. Role Intel      | Analyze JD, produce locked rubric           | Yes (Sonnet, once)      | Per job               | Rubric JSON   |
| 2. Candidate Intel | Read resume, extract evidence per criterion | Yes (Haiku, once)       | Per candidate per job | Evidence JSON |
| 3. Match           | Compare evidence vs rubric, produce score   | **No** (pure algorithm) | Never                 | Score + trail |

## 3. File Structure (implementation)

- `src/lib/fitscore/three-stage/` — stage1-role-intel, stage2-candidate-intel, stage3-match, scorer, types, supabase-adapter
- `src/lib/fitscore/job-text.ts` — buildJdText
- `src/lib/fitscore/score-input-helpers.ts` — buildScoreInput (JD + resume text, parse_quality, profile_completeness)
- Existing: resume-validation, vision-fallback, v3/profile-completeness, v3/fetch-resume-text

## 4. Bands and Confidence

**Bands:** Strong Fit ≥78, Good Fit ≥62, Moderate Fit ≥45, Weak Fit ≥25, Not a Fit &lt;25.

**Confidence:** From parse_quality and profile_completeness (high / medium / low).

## 5. Critical Implementation Notes

- Temperature **0** for all LLM calls.
- Stage 1: Sonnet (rubric). Stage 2: Haiku (evidence).
- Cache: Stage 1 per job; Stage 2 per candidate per job; Stage 3 never cached.
- Validate rubric weights sum to 100.
- Missing evidence → auto-fill grade E.
- Store **full** rubric and evidence snapshots with each score, not just IDs.
- Prompt versioning: bump when prompts change.

## 6. Summary

LLMs understand. Algorithms score. Provenance proves it.
