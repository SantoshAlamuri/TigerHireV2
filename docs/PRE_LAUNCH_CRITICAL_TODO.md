# Pre-Launch Critical TODO List

**Generated:** 2026-03-20
**Status (2026-05-12):** ✅ **All pre-beta code fixes COMPLETED.** This doc is preserved as the historical record of the FitScore consistency work that landed before beta. The **remaining beta-blocking activity is item 5 — running the consistency baseline** (see [docs/runbooks/FITSCORE-DETERMINISM-BASELINE.md](runbooks/FITSCORE-DETERMINISM-BASELINE.md) for the runbook that supersedes the inline notes here).
**Purpose:** Actionable checklist for pre-launch critical fixes before beta launch.

---

## 🚨 Pre-Launch Critical (Do Before Beta)

### 1. Temperature 0 in CV Parser ⚡ **CRITICAL - 1 LINE FIX** ✅ **COMPLETED**

**Why:** Root cause of score variance. CV parser runs before Stage 2. If it has variance, everything downstream varies.

**Task:**

- [x] Open `src/lib/agents/cv-parser.ts`
- [x] Find `callClaude` call in `parseTextWithClaude` function (around line 76-82)
- [x] Add `temperature: 0` parameter to the `callClaude` call
- [x] Update `callClaude` function to accept `temperature` parameter
- [ ] Test: Parse same CV twice, verify output is identical
- [ ] Commit: "fix: Set temperature=0 in CV parser to eliminate extraction variance"

**File:** `src/lib/agents/cv-parser.ts` (line ~76-82)  
**File:** `src/lib/services/anthropic.ts` (updated to accept temperature parameter)

**Status:** ✅ **FIXED** - Code updated. Ready for testing.

**Expected Change:**

```typescript
const response = await callClaude({
  model: CV_PARSE_MODEL,
  max_tokens: 4096,
  temperature: 0, // ADD THIS LINE
  system: CV_PARSE_SYSTEM,
  messages: [{ role: "user", content: prompt }],
  label: "cv-parser-text",
});
```

**Verification:**

- Run same CV through parser 5 times
- Compare JSON outputs - should be identical
- Check logs for any variance

---

### 2. Missing Must-Haves Flag in UI ⚡ **CRITICAL - HALF DAY** ✅ **COMPLETED**

**Why:** Recruiters need to see if candidate is missing critical requirements. Affects trust.

**Tasks:**

#### 2a. Create Missing Must-Haves Detector

- [x] Create `src/lib/fitscore/missing-must-haves.ts`
- [x] Implement function: `detectMissingMustHaves(job: JobData, candidate: CandidateData): string[]`
- [x] Compare `job.skills_required` to `candidate.skills`
- [x] Return array of missing critical skills
- [x] Handle edge cases (empty arrays, null values)
- [x] Add fuzzy matching for skill variations (e.g., "React" vs "React.js")

**File:** `src/lib/fitscore/missing-must-haves.ts` ✅ **CREATED**

**Implementation:**

```typescript
export function detectMissingMustHaves(
  job: { skills_required?: string[] | null },
  candidate: { skills?: string[] | null },
): string[] {
  const required = job.skills_required ?? [];
  const candidateSkills = candidate.skills ?? [];
  const missing = required.filter(
    (skill) =>
      !candidateSkills.some(
        (cs) =>
          cs.toLowerCase().includes(skill.toLowerCase()) ||
          skill.toLowerCase().includes(cs.toLowerCase()),
      ),
  );
  return missing;
}
```

#### 2b. Integrate into FitScore Service

- [x] Open `src/lib/services/FitScoreService.ts`
- [x] Import `detectMissingMustHaves` in `src/lib/fitscore/scorer.ts`
- [x] Call after computing FitScore
- [x] Add `missing_must_haves` field to FitScoreResult type
- [x] Store in database via adapter
- [x] Add to FitScore view type

**File:** `src/lib/fitscore/scorer.ts` ✅ **UPDATED**  
**File:** `src/lib/fitscore/three-stage/types.ts` ✅ **UPDATED**  
**File:** `src/lib/fitscore/three-stage/supabase-adapter.ts` ✅ **UPDATED**  
**File:** `src/types/index.ts` ✅ **UPDATED**  
**File:** `src/lib/mappers.ts` ✅ **UPDATED**

#### 2c. Display in UI

- [x] Open `src/components/dashboard/FitScoreCard.tsx`
- [x] Add "Missing Must-Haves" section (similar to red flags)
- [x] Display prominently if any missing
- [x] Style: Red warning badge, list of missing skills
- [x] Show before red flags section (more prominent)

**File:** `src/components/dashboard/FitScoreCard.tsx` ✅ **UPDATED**

**UI Location:** Before red flags section, prominently displayed

**Status:** ✅ **COMPLETED** - Ready for testing

**Verification:**

- [ ] Test with job requiring "Python" and candidate without it
- [ ] Verify missing skill appears in UI
- [ ] Test with candidate having all required skills (should show nothing)

---

### 3. Indian CV Patterns in Grading ⚡ **CRITICAL - HALF DAY** ✅ **COMPLETED**

**Why:** Your market is India. Grading must understand Indian CV patterns (contract roles, notice periods, LPA format).

**Tasks:**

#### 3a. Update Stage 2 System Prompt

- [x] Open `src/lib/fitscore/three-stage/stage2-candidate-intel.ts`
- [x] Find `STAGE2_SYSTEM_PROMPT_V1` constant (around line 26)
- [x] Add Indian market context section to prompt
- [x] Include:
  - Contract roles are common (not red flags)
  - Notice periods 30-90 days are standard
  - LPA salary format is normal
  - Company abbreviations (TCS, Infy, Wipro) are acceptable
  - Degree abbreviations (B.Tech, B.E., MCA) are standard
- [x] Also update V2 extraction prompt for consistency

**File:** `src/lib/fitscore/three-stage/stage2-candidate-intel.ts` ✅ **UPDATED**

**Expected Addition to Prompt:**

```
INDIAN MARKET CONTEXT:
- Contract roles are common and acceptable (not employment gaps)
- Notice periods of 30-90 days are standard practice
- Salary in LPA (Lakhs Per Annum) format is normal
- Company abbreviations (TCS, Infy, Wipro) are standard
- Degree abbreviations (B.Tech, B.E., MCA) are standard Indian nomenclature
- Do not penalize candidates for these Indian market norms
```

✅ **ADDED** to both V1 and V2 prompts

#### 3b. Update Hybrid Prompt (if using)

- [x] If `useHybridStage2` is enabled, update `STAGE2_EXTRACTION_PROMPT` as well
- [x] Add same Indian market context

**File:** `src/lib/fitscore/three-stage/stage2-candidate-intel.ts` ✅ **UPDATED**

**Status:** ✅ **COMPLETED** - Ready for testing

**Verification:**

- [ ] Test with Indian CV containing contract role
- [ ] Verify it's not flagged as red flag
- [ ] Test with notice period mentioned (should not be penalized)
- [ ] Test with LPA salary format (should be understood)

---

### 4. OpenAI Structured Extraction (Two-Model Approach) ⚠️ **1 DAY** ✅ **COMPLETED**

**Why:** Better schema compliance than Anthropic. Forces exact schema match.

**Decision:** ✅ **YES - Using two-model approach** (OpenAI for extraction, Claude for reasoning)

**If YES, tasks:**

#### 4a. Install OpenAI SDK

- [x] Run: `npm install openai`
- [x] Verify package.json includes `openai`

#### 4b. Add OpenAI Service

- [x] Create `src/lib/services/openai.ts`
- [x] Implement `extractCVFactsStructured` function
- [x] Use `gpt-4o-mini` model
- [x] Configure structured output with `strict: true`
- [x] Define JSON Schema from `CVFacts` interface with `additionalProperties: false`
- [x] Add Indian market context to prompt
- [x] Add fallback to Claude if OpenAI fails

**File:** `src/lib/services/openai.ts` ✅ **CREATED**

**Implementation:** ✅ **COMPLETED**

- Created `extractCVFactsStructured` function with full JSON Schema
- Uses `gpt-4o-mini` with `strict: true` and `additionalProperties: false`
- Includes Indian market context in prompt
- Has fallback to Claude if OpenAI fails or key not set

#### 4c. Add Environment Variable

- [x] Open `src/lib/config/env.ts`
- [x] Add `openaiApiKey` getter to env object
- [x] Already in `.env.example` (OPENAI_API_KEY)
- [x] Documented in service file

**File:** `src/lib/config/env.ts` ✅ **UPDATED**

#### 4d. Refactor Stage 2A to Use OpenAI

- [x] Open `src/lib/fitscore/three-stage/stage2-candidate-intel.ts`
- [x] Find `extractCandidateEvidenceHybrid` function
- [x] Replace Claude fact extraction with OpenAI structured extraction
- [x] Keep Claude for grading (Stage 2B) - unchanged
- [x] Add fallback to Claude if OpenAI fails

**File:** `src/lib/fitscore/three-stage/stage2-candidate-intel.ts` ✅ **UPDATED**

**Status:** ✅ **COMPLETED** - Ready for testing

**Verification:**

- [ ] Test extraction with same resume
- [ ] Verify schema compliance (no extra fields)
- [ ] Compare output to previous Claude extraction
- [ ] Check cost (should be lower with gpt-4o-mini)
- [ ] Verify fallback works if OPENAI_API_KEY not set

---

### 5. Consistency Measurement Baseline ⚠️ **1 DAY (During Beta)** ✅ **SCRIPT READY**

**Why:** You need to know your baseline consistency. Run during beta to measure if temperature 0 fix worked.

**Tasks:**

#### 5a. Create Consistency Test Script

- [x] Enhanced existing `scripts/verify-fit-score-determinism.mjs`
- [x] Script now:
  - Takes candidate_id and job_id as input (or uses first available)
  - Scores same candidate+job 10 times with `forceRescore: true`
  - Calculates: mean, std dev, coefficient of variation (CV)
  - Outputs detailed results to console
  - Optionally saves to file (set CONSISTENCY_OUTPUT_FILE env var)
  - Shows consistency status (✅ if CV < 5%, ⚠️ if >= 5%)

**File:** `scripts/verify-fit-score-determinism.mjs` ✅ **ENHANCED**

**Usage:**

```bash
# Run with specific job and candidate
node scripts/verify-fit-score-determinism.mjs <jobId> <candidateId>

# Or let it auto-select first job/candidate
node scripts/verify-fit-score-determinism.mjs

# Save results to file
CONSISTENCY_OUTPUT_FILE=results.json node scripts/verify-fit-score-determinism.mjs

# Use API endpoint (requires auth token)
AUTH_TOKEN=your_token node scripts/verify-fit-score-determinism.mjs
```

**Output includes:**

- All 10 scores
- Mean, std dev, coefficient of variation (CV)
- Min, max, range
- Consistency status (✅ if CV < 5%, ⚠️ if >= 5%)
- Optional JSON file output

#### 5b. Run Baseline Test (During Beta)

- [ ] Select 10 representative candidates
- [ ] Run consistency test script for each: `node scripts/verify-fit-score-determinism.mjs <jobId> <candidateId>`
- [ ] Record results (use CONSISTENCY_OUTPUT_FILE to save JSON)
- [ ] Calculate average CV across all candidates
- [ ] Target: <5% variance (CV < 5%)

**Status:** ✅ **SCRIPT READY** - Can be run during beta testing

**Verification:**

- After temperature 0 fix, run test
- Verify CV < 5% for all test candidates
- If CV > 5%, investigate which stage has variance

---

## 📋 Summary Checklist

### Must Do Before Beta:

- [x] **Temperature 0 in CV parser** (1 line, 5 minutes) ✅ **COMPLETED**
- [x] **Missing must-haves flag in UI** (half day) ✅ **COMPLETED**
- [x] **Indian CV patterns in grading** (half day) ✅ **COMPLETED**
- [x] **OpenAI structured extraction** (two-model approach) ✅ **COMPLETED**

### During Beta:

- [x] **Consistency measurement baseline script** (ready to run) ✅ **SCRIPT READY**

### Optional Before Beta:

- [x] **OpenAI structured extraction** (1 day, two-model approach) ✅ **COMPLETED**

### During Beta:

- [ ] **Consistency measurement baseline** (1 day, run test)

---

## 🎯 Quick Start

**Fastest path to launch-ready:**

1. ✅ **Today (5 minutes):** Fix temperature 0 in CV parser - **COMPLETED**
2. ✅ **Tomorrow morning:** Add missing must-haves flag - **COMPLETED**
3. ✅ **Tomorrow afternoon:** Add Indian CV patterns to grading - **COMPLETED**
4. ✅ **Script ready:** Consistency baseline test script - **READY FOR BETA**

**Total time: ~1 day of focused work**  
**Status: All critical fixes completed** ✅  
**Two-model approach: Implemented** ✅  
**Next step: Run consistency baseline during beta testing**

---

## 🤖 What to do for OpenAI (structured extraction) to work

To use the two-model approach (OpenAI for extraction, Claude for grading), do this:

### 1. Get an OpenAI API key

- Go to [platform.openai.com](https://platform.openai.com)
- Sign in or create an account
- Billing: Add a payment method (usage for gpt-4o-mini is low cost)
- API keys: Create a key (e.g. **API Keys → Create new secret key**)
- Copy the key (starts with `sk-...`)

### 2. Add to `.env.local`

```bash
# OpenAI for FitScore Stage 2A (structured extraction)
OPENAI_API_KEY=sk-your-key-here

# Required: enables the hybrid pipeline that uses OpenAI
USE_HYBRID_STAGE2=true
```

### 3. Restart the dev server

After changing `.env.local`, restart:

```bash
npm run dev
```

### 4. Verify

- Run a FitScore (e.g. score a candidate for a job)
- If OpenAI is used, you get strict-schema extraction (no extra/hallucinated fields)
- If `OPENAI_API_KEY` is missing or invalid, the app **falls back to Claude** for extraction (no crash)
- Logs: look for `[openai] Starting structured CV facts extraction` when OpenAI is used, or `[stage2] OpenAI extraction failed, falling back to Claude` when falling back

### Summary

| Step | Action                                                                   |
| ---- | ------------------------------------------------------------------------ |
| 1    | Get key from platform.openai.com                                         |
| 2    | Set `OPENAI_API_KEY=sk-...` and `USE_HYBRID_STAGE2=true` in `.env.local` |
| 3    | Restart dev server                                                       |
| 4    | Run a FitScore to confirm (check logs)                                   |

Without `USE_HYBRID_STAGE2=true`, the app uses the single-step Claude path and never calls OpenAI. Without `OPENAI_API_KEY`, the hybrid path falls back to Claude for extraction.

---

## 📝 Notes

- Temperature 0 fix is the highest priority - it's the root cause
- Missing must-haves affects recruiter trust - do it before beta
- Indian CV patterns affect score accuracy - critical for your market
- OpenAI extraction is optional - only if you want two-model approach
- Consistency baseline is informational - run during beta to verify fixes worked

---

## 🔄 Post-Beta Items (Deferred)

These can wait until after beta launch:

- Consensus double extraction
- Bias blinding
- Multi-agent pipeline
- Golden dataset
- A/B testing framework
- Evidence highlighting
- Full consistency tracking dashboard

See `RESUME_SCREENING_GAP_ANALYSIS.md` for full post-beta roadmap.
