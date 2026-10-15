# FitScore System Audit & Fixes

**Date:** March 20, 2026  
**Status:** ✅ All fixes implemented

## Summary

This document outlines the audit and fixes applied to the FitScore scoring system to address critical issues with database persistence, environment variable mismatches, role-relevance scoring, and UI enhancements.

---

## 1. ✅ Database Persistence Bug Fix (90e7f55)

### Issue

The Supabase `upsert()` with `onConflict` was silently failing on the partial unique index `(job_id, candidate_id) WHERE is_test_run = false`. This meant scores weren't being saved to the database, causing production to show stale/old scores.

### Fix Applied

**File:** `src/lib/fitscore/three-stage/supabase-adapter.ts` (lines 149-199)

Replaced the `upsert()` call with a **select+update/insert pattern**:

- For production runs (`is_test_run = false`): Check if row exists, then UPDATE or INSERT accordingly
- Handles race conditions with retry logic on unique constraint violations
- For test runs: Calculate `run_index` and use INSERT (not UPSERT)

### Status

✅ **VERIFIED** - The fix is already in production code. The select+update/insert pattern is correctly implemented.

### Impact

- Scores are now properly persisted to the database
- Production should no longer show stale scores
- Test runs continue to work correctly with incremental `run_index`

---

## 2. ⚠️ Environment Variable Mismatch

### Issue

Different environments may have different `USE_HYBRID_STAGE2` settings, causing:

- **Local** using v1.1 (LLM grading) vs **Production** using v2.0 (hybrid deterministic grading)
- Different scores for the same candidate-job pair
- If `OPENAI_API_KEY` is missing when hybrid mode is on, it falls back to Claude extraction, producing different results

### Current State

**Local (.env.local):**

```bash
USE_HYBRID_STAGE2=false  # Commented out, defaults to false
OPENAI_API_KEY=sk-proj-...  # Set
```

**Production (Vercel):**

- ⚠️ **ACTION REQUIRED**: Verify `USE_HYBRID_STAGE2` and `OPENAI_API_KEY` are set consistently
- Check Vercel environment variables to ensure:
  - `USE_HYBRID_STAGE2=true` if using hybrid mode
  - `OPENAI_API_KEY` is set when hybrid mode is enabled

### Files to Check

- `src/lib/config/env.ts` (line 193-194): `useHybridStage2` flag
- `src/lib/fitscore/three-stage/stage2-candidate-intel.ts` (line 426): Uses `env.useHybridStage2`

### Recommendation

1. **Verify Vercel env vars** match your intended configuration
2. **Document** which mode (v1.1 vs v2.0) should be used in production
3. **Consider** adding a runtime check that logs which mode is active

---

## 3. ✅ Role-Relevance Gate Fix

### Issue

The signal scoring system was awarding points on generic resume signals (ownership verbs like "designed"/"led", quantified outcomes, experience duration) that had nothing to do with role relevance. This allowed completely irrelevant candidates (e.g., UX Designer) to score 60+ against mismatched roles (e.g., Scrum Master).

### Root Cause

**File:** `src/lib/fitscore/three-stage/signal-score.ts`

The signal score computation allowed high scores even when:

- `title_alignment = 0` (no title match)
- `keyword_overlap < 5` (very low keyword match)

Generic signals (ownership language, quantified outcomes, experience duration) could still contribute 40-60 points, inflating scores for irrelevant candidates.

### Fix Applied

**File:** `src/lib/fitscore/three-stage/signal-score.ts` (lines 212-232)

Added a **role-relevance gate**:

```typescript
const KEYWORD_OVERLAP_THRESHOLD = 5; // Out of 25 points
const hasRoleRelevance = title_alignment > 0 || keyword_overlap >= KEYWORD_OVERLAP_THRESHOLD;

let rawScore = /* computed score */;

// Apply role-relevance penalty
if (!hasRoleRelevance) {
  // Floor at 20 points maximum for completely irrelevant candidates
  score = Math.min(rawScore, 20);
}
```

### Logic

- If `title_alignment = 0` AND `keyword_overlap < 5`: Apply heavy penalty (floor at 20 points)
- This prevents generic resume signals from inflating scores for completely mismatched roles
- Ensures UX Designer won't score 60+ against Scrum Master role

### Impact

- Irrelevant candidates will now score ≤20 points (instead of 60+)
- Only candidates with some role relevance (title match OR keyword overlap ≥5) can score higher
- More accurate filtering of mismatched candidates

---

## 4. ✅ Score Badge Shadow/Glow Fix

### Issue

Score badges lacked visual depth/shadow effects to make them stand out.

### Fix Applied

**Files Modified:**

1. `src/types/index.ts` - Added `getFitScoreGlow()` helper function
2. `src/components/dashboard/FitScoreBadge.tsx` - Applied glow to badge
3. `src/components/dashboard/FitScoreCard.tsx` - Applied glow to score displays (2 locations)
4. `src/components/dashboard/CandidateRow.tsx` - Applied glow to fit score badge
5. `src/app/(dashboard)/agency/pipeline/components/AgencyPipelineKanban.tsx` - Applied glow to pipeline score badges

### Implementation

**Function:** `getFitScoreGlow(score: number)`

```typescript
export function getFitScoreGlow(score: number): string {
  if (score >= 90) return "shadow-[0_0_8px_rgba(34,197,94,0.25)]"; // Green
  if (score >= 75) return "shadow-[0_0_8px_rgba(245,158,11,0.25)]"; // Amber
  if (score >= 60) return "shadow-[0_0_8px_rgba(249,115,22,0.25)]"; // Orange
  return "shadow-[0_0_8px_rgba(239,68,68,0.25)]"; // Red
}
```

### Impact

- Score badges now have visual depth with colored shadows
- Better visual hierarchy and user experience
- Consistent styling across all score badge components

---

## Testing Recommendations

### 1. Database Persistence

- [ ] Verify scores are being saved to `fit_scores` table
- [ ] Check that production scores update correctly after rescoring
- [ ] Test both production (`is_test_run=false`) and test runs (`is_test_run=true`)

### 2. Environment Variables

- [ ] Verify `USE_HYBRID_STAGE2` is set correctly in Vercel
- [ ] Verify `OPENAI_API_KEY` is set if using hybrid mode
- [ ] Test scoring in both local and production to ensure consistency

### 3. Role-Relevance Gate

- [ ] Test with mismatched roles (e.g., UX Designer vs Scrum Master)
- [ ] Verify irrelevant candidates score ≤20 points
- [ ] Verify relevant candidates (with title/keyword match) can still score higher
- [ ] Test edge cases: zero title alignment but high keyword overlap, etc.

### 4. Score Badge Glow

- [ ] Visual check: Score badges should have colored shadows
- [ ] Test across different score ranges (90+, 75+, 60+, <60)
- [ ] Verify glow appears in all components (badge, card, row, pipeline)

---

## Files Modified

1. `src/lib/fitscore/three-stage/signal-score.ts` - Added role-relevance gate
2. `src/types/index.ts` - Added `getFitScoreGlow()` function
3. `src/components/dashboard/FitScoreBadge.tsx` - Applied glow
4. `src/components/dashboard/FitScoreCard.tsx` - Applied glow (2 locations)
5. `src/components/dashboard/CandidateRow.tsx` - Applied glow
6. `src/app/(dashboard)/agency/pipeline/components/AgencyPipelineKanban.tsx` - Applied glow

---

## Next Steps

1. **Deploy fixes to production** - All code changes are ready
2. **Verify environment variables** in Vercel match intended configuration
3. **Monitor scoring** - Watch for any unexpected behavior after deployment
4. **Collect feedback** - Track if role-relevance gate is too strict/lenient
5. **Consider** adding logging/metrics to track:
   - How often role-relevance gate is triggered
   - Score distribution before/after fix
   - Environment variable mismatches

---

## Related Commits

- `90e7f55` - Database persistence fix (already merged)
- `29a2892` - is_test_run filters (already merged)
- Current branch - Role-relevance gate + score badge glow fixes
