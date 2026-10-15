# TigerHire Resume Screening: Current State vs World-Class Gap Analysis

**Generated:** 2026-03-20  
**Purpose:** Compare TigerHire's current resume screening system against world-class standards outlined in the roadmap.

---

## Executive Summary

TigerHire has a **solid hybrid architecture** (LLM extraction + deterministic scoring) that is directionally correct, but has **critical pre-launch gaps** that must be fixed before beta. The system is production-ready for MVP but needs targeted enhancements to reach world-class standards.

**Overall Assessment:**

- ✅ **Foundation:** Strong (three-stage pipeline, evidence-based scoring)
- ⚠️ **Validation:** Partial (schema exists, but no strict enforcement or consensus)
- ❌ **Bias Mitigation:** Missing (no blinding, proxy detection, or structured audits) - **Post-beta**
- ⚠️ **Explainability:** Good (evidence quotes exist, but lacks source location and confidence levels)
- ⚠️ **Consistency:** Unknown (no inter-rater reliability tracking)
- ✅ **Semantic Matching:** Present (embeddings for candidate-job matching)
- ❌ **Multi-Agent Pipeline:** Not implemented (single-pass extraction) - **Post-beta**

---

## 🚨 Pre-Launch Critical Fixes (Do Before Beta)

These are the **legitimate concerns** that affect score variance and recruiter trust. Fix these before launching to beta users.

### Pre-Launch Critical Priority Table

| Gap                                  | Real Risk                               | Effort   | Do Before Launch?                | Status             |
| ------------------------------------ | --------------------------------------- | -------- | -------------------------------- | ------------------ |
| **Temperature 0 in CV parser**       | **HIGH** — root cause of score variance | 1 line   | ✅ **YES, TODAY**                | ❌ Not fixed       |
| **OpenAI structured extraction**     | **MEDIUM-HIGH** — schema compliance     | 1 day    | ✅ **YES** (if using two models) | ❌ Not implemented |
| **Missing must-haves flag in UI**    | **MEDIUM** — recruiter trust            | Half day | ✅ **YES**                       | ❌ Not implemented |
| **Indian CV patterns in grading**    | **MEDIUM** — your market                | Half day | ✅ **YES**                       | ❌ Not implemented |
| **Consistency measurement baseline** | **MEDIUM** — you need to know           | 1 day    | ✅ **YES, during beta**          | ❌ Not implemented |
| Consensus double extraction          | Low-Medium                              | 2 days   | ❌ No — temperature 0 first      | ⏸️ Deferred        |
| Bias blinding                        | Low for beta                            | 1 week   | ❌ No — post beta                | ⏸️ Deferred        |
| Multi-agent pipeline                 | Low for beta                            | 2 weeks  | ❌ No                            | ⏸️ Deferred        |
| Golden dataset 100 resumes           | Low for beta                            | 1 week   | ❌ No                            | ⏸️ Deferred        |
| A/B testing framework                | None for beta                           | 2 weeks  | ❌ No                            | ⏸️ Deferred        |

---

## Phase 1: Foundation Fixes (Months 1-3)

### 1. Structured Output with Strict JSON Schema ⚠️ **PRE-LAUNCH (If Using Two-Model Approach)**

**World-Class Requirement:**

- Use OpenAI's structured output or equivalent with `strict: true` and `additionalProperties: false`
- Eliminate hallucination and ensure consistent parsing

**Current State:**

- ✅ **Schema exists:** `ParsedCVSchema` in `src/lib/agents/schemas.ts`
- ✅ **Zod validation:** Schema is validated with Zod after extraction
- ❌ **No strict mode:** Using Anthropic Claude (not OpenAI), no `strict: true` equivalent
- ❌ **No `additionalProperties: false`:** LLM can add extra fields that get normalized away
- ⚠️ **Post-extraction validation:** JSON is extracted via regex (`extractJsonObject`), then validated

**Gap:**

- Anthropic Claude doesn't support structured output mode like OpenAI
- Relying on prompt engineering + regex extraction + Zod validation
- **The problem:** Zod validates structure after the fact. It doesn't prevent the LLM from hallucinating fields, adding extra properties, or producing subtly different JSON structures that pass Zod but mean different things.
- OpenAI's structured output with `strict: true` forces the model to only produce tokens that match the schema. It's genuinely more reliable for extraction tasks.

**Two-Model Approach (Recommended):**

Using Claude for reasoning and scoring — where context understanding matters — and OpenAI for structured extraction — where schema compliance matters — is not over-engineering. It's using each model for what it's actually better at.

**Recommended Architecture:**

```
CV Parser (Stage 2A extraction):
→ OpenAI gpt-4o-mini with structured output strict: true
→ Forces exact schema compliance
→ No hallucinated fields
→ Consistent JSON every time

Evidence Grading + Scoring (Stage 2B + Stage 3):
→ Claude Haiku (current)
→ Better at nuanced reasoning
→ Better at understanding Indian CV context
→ Deterministic TypeScript math unchanged
```

**Cost Impact:** Minimal — gpt-4o-mini is cheap for extraction tasks. Reliability gain is real.

**Implementation:**

- Refactor Stage 2A fact extraction to use OpenAI instead of Claude
- Use `gpt-4o-mini` with structured outputs and `strict: true`
- Define the `CVFacts` interface as a JSON Schema object with `additionalProperties: false` at every level
- This ensures the extraction always returns exactly the schema we defined — no extra fields, no missing fields, no hallucinated properties
- Install the OpenAI SDK alongside the existing Anthropic SDK
- Keep Stage 2B grading and Stage 3 scoring on Claude unchanged — only the fact extraction step moves to OpenAI
- Add `OPENAI_API_KEY` to the env validation schema alongside the existing Anthropic key

**Alternative (If Not Using Two Models):**

- Enhance validation: reject any fields not in schema (currently normalized away)
- Add schema versioning to detect when LLM output format drifts

**Files:**

- `src/lib/agents/cv-parser.ts` (lines 64-107)
- `src/lib/agents/schemas.ts`
- `src/lib/services/anthropic.ts` (lines 160-164)
- Create: `src/lib/services/openai.ts` (if using two-model approach)
- `src/lib/config/env.ts` (add `OPENAI_API_KEY`)

---

### 2. Consensus Validation for Extraction

**World-Class Requirement:**

- Run extraction twice and compare results
- If they differ, flag for human review or use a third tie-breaker extraction
- Detects LLM inconsistency at the source

**Current State:**

- ❌ **Not implemented:** Single-pass extraction only
- ❌ **No variance tracking:** No measurement of extraction consistency
- ❌ **No human review flags:** No mechanism to flag inconsistent extractions

**Gap:**

- Complete absence of consensus validation
- No way to detect if extraction is unreliable

**Recommendation:**

- Implement double extraction with comparison
- Track field-level differences (e.g., skills array differs by 2 items)
- Flag for human review if >10% fields differ
- Store both extractions for audit trail

**Files to Modify:**

- `src/lib/agents/cv-parser.ts` - Add consensus extraction logic

---

### 3. Temperature = 0 in CV Parser ⚠️ **CRITICAL PRE-LAUNCH**

**World-Class Requirement:**

- Set LLM temperature to 0 for extraction tasks
- Research shows this dramatically reduces variance in structured output

**Current State:**

- ✅ **Temperature = 0:** Already implemented in:
  - `src/lib/fitscore/three-stage/stage2-candidate-intel.ts` (lines 460, 506, 646, 697)
  - `src/lib/fitscore/dimensions/extractor.ts` (line 105)
  - `src/lib/fitscore/simple-scorer.ts` (line 69)
- ❌ **CV Parser:** Not explicitly set (uses default, likely 1.0) — **THIS IS THE ROOT CAUSE OF SCORE VARIANCE**
- ❌ **No deterministic seeding:** No seed parameter for reproducibility

**Why This Is Critical:**

- **Root cause of score variance:** The CV parser runs **before** Stage 2. If it has variance, the raw text extraction that feeds everything downstream will be different each time. A CV parsed twice could produce different raw text, which then produces different evidence, which produces different scores.
- Stage 2 has temperature 0, but if the input (parsed CV) varies, Stage 2's consistency doesn't matter.
- **Fix is one line.** Do it now.

**Gap:**

- CV parser extraction has variance baked in from the start
- This is the actual root cause of score variance, not Stage 2

**Recommendation:**

- ✅ **IMMEDIATE:** Set `temperature: 0` in `parseTextWithClaude` (cv-parser.ts) — **1 line change**
- Add `seed` parameter if Anthropic supports it (check API docs)
- Document temperature settings in all extraction calls

**Files to Modify:**

- `src/lib/agents/cv-parser.ts` (line 76-82) - Add `temperature: 0` to `callClaude` call

---

### 4. Ground Truth Dataset Creation

**World-Class Requirement:**

- Build a "golden dataset" of 100-200 resumes with human-verified extractions
- Use to measure extraction accuracy (target: >95% field-level precision, >93% recall)
- Test consistency (same resume, multiple runs)
- Validate against schema compliance

**Current State:**

- ❌ **No golden dataset:** No curated test set
- ❌ **No accuracy metrics:** No measurement of extraction precision/recall
- ❌ **No consistency testing:** No automated tests for same-resume variance
- ❌ **No schema compliance tracking:** No monitoring of schema drift

**Gap:**

- Complete absence of validation dataset and metrics

**Recommendation:**

- Create `tests/fixtures/golden-resumes/` directory
- Add 100-200 resumes with human-verified JSON extractions
- Build test suite: `tests/integration/extraction-accuracy.test.ts`
- Track metrics: precision, recall, F1 per field
- Run in CI/CD to catch regressions

**Files to Create:**

- `tests/fixtures/golden-resumes/` (directory)
- `tests/integration/extraction-accuracy.test.ts`

---

## Phase 2: Advanced Architecture (Months 3-6)

### 5. Multi-Agent Pipeline (Not Single-Pass)

**World-Class Requirement:**

- Agent 1 (Parser): Raw text → structured JSON
- Agent 2 (Normalizer): Skills aliasing, company name standardization, date normalization
- Agent 3 (Evidence Extractor): Pull specific quotes supporting each criterion
- Agent 4 (Scorer): Deterministic math based on normalized data
- Agent 5 (Validator): Consistency checks, red flag detection

**Current State:**

- ⚠️ **Partial multi-stage:** Three-stage pipeline exists:
  - Stage 1: Job → Rubric (role intelligence)
  - Stage 2: Resume + Rubric → Evidence (candidate intelligence)
  - Stage 3: Evidence + Rubric → Score (deterministic)
- ✅ **Agent 1 (Parser):** `parseResumeWithClaude` extracts structured JSON
- ⚠️ **Agent 2 (Normalizer):** Basic normalization in `normalizeParsed` (salary, skills), but no:
  - Skills aliasing (e.g., "React" vs "React.js")
  - Company name standardization
  - Date normalization (handles "Present" but not format variations)
- ✅ **Agent 3 (Evidence Extractor):** `extractCandidateEvidence` extracts evidence quotes
- ✅ **Agent 4 (Scorer):** `computeScore` does deterministic math
- ❌ **Agent 5 (Validator):** No dedicated validator agent

**Gap:**

- Normalization is basic (salary only)
- No skills aliasing or company standardization
- No dedicated validator agent
- Single-pass extraction (no consensus)

**Recommendation:**

- Add normalization agent: `src/lib/agents/normalizer.ts`
  - Skills aliasing (use embeddings or synonym dictionary)
  - Company name standardization (fuzzy matching + canonical names)
  - Date normalization (handle MM/YYYY, YYYY, "Present", etc.)
- Add validator agent: `src/lib/agents/validator.ts`
  - Consistency checks (dates make sense, skills match experience)
  - Red flag detection (employment gaps, job hopping)
- Refactor pipeline to call agents sequentially

**Files:**

- `src/lib/fitscore/three-stage/scorer.ts` (current pipeline)
- `src/lib/agents/cv-parser.ts` (Agent 1)
- Create: `src/lib/agents/normalizer.ts` (Agent 2)
- `src/lib/fitscore/three-stage/stage2-candidate-intel.ts` (Agent 3)
- `src/lib/fitscore/three-stage/stage3-match.ts` (Agent 4)
- Create: `src/lib/agents/validator.ts` (Agent 5)

---

### 6. Evidence-First Scoring

**World-Class Requirement:**

- For every criterion score, require:
  - Direct quote from resume
  - Explanation of reasoning
  - Confidence level (High/Medium/Low)
  - Source location (which section/paragraph)

**Current State:**

- ✅ **Evidence quotes:** `evidence_text` field exists in `CriterionEvidence`
- ✅ **Reasoning:** `reasoning` field exists
- ❌ **Confidence level:** Not tracked per criterion (only overall `confidence: "high" | "medium" | "low"` in result)
- ❌ **Source location:** No tracking of which section/paragraph quote came from

**Gap:**

- Missing confidence per criterion
- Missing source location tracking

**Recommendation:**

- Extend `CriterionEvidence` type:
  ```typescript
  interface CriterionEvidence {
    criterion_id: string;
    grade: Grade;
    evidence_text: string;
    reasoning: string;
    confidence: "high" | "medium" | "low"; // NEW
    source_location: string; // NEW: e.g., "Experience: Company X, 2020-2022"
    source_section: "experience" | "skills" | "education" | "projects" | "summary"; // NEW
  }
  ```
- Update Stage 2 extraction to include confidence and location
- Display in UI: show confidence badges and source sections

**Files to Modify:**

- `src/lib/fitscore/three-stage/types.ts` (extend `CriterionEvidence`)
- `src/lib/fitscore/three-stage/stage2-candidate-intel.ts` (extract confidence + location)
- `src/components/dashboard/FitScoreCard.tsx` (display confidence + location)

---

### 7. Bias Mitigation by Design

**World-Class Requirement:**

- Blinding: Remove names, photos, addresses, graduation years before scoring
- Proxy detection: Test if scores change when swapping name-only (e.g., "John" vs "Jamal")
- Structured rubrics: 4-6 criteria max, behavioral anchors for each level
- Flip tests: Regular audits where identical resumes with different demographics are scored

**Current State:**

- ❌ **No blinding:** Names, addresses, graduation years are present during scoring
- ❌ **No proxy detection:** No tests for demographic bias
- ✅ **Structured rubrics:** Criteria are structured (4-6 typical), but no explicit max enforced
- ❌ **No flip tests:** No automated bias audits

**Gap:**

- Complete absence of bias mitigation measures

**Recommendation:**

- Add blinding layer: `src/lib/security/bias-mitigation.ts`
  - Function: `blindResume(resumeText: string): string`
  - Remove: names, emails, addresses, graduation years, photos
  - Replace with placeholders: "[NAME]", "[EMAIL]", etc.
- Add proxy detection test: `tests/integration/bias-proxy-detection.test.ts`
  - Create test resumes with only name changed
  - Score both, compare results
  - Fail if score difference > 5 points
- Enforce rubric max: Add validation in Stage 1 (max 6 criteria)
- Add flip test cron job: `src/app/api/cron/bias-audit/route.ts`
  - Monthly: score 100 resumes with swapped demographics
  - Track score variance by demographic
  - Alert if variance > 5%

**Files to Create:**

- `src/lib/security/bias-mitigation.ts`
- `tests/integration/bias-proxy-detection.test.ts`
- `src/app/api/cron/bias-audit/route.ts`

**Files to Modify:**

- `src/lib/fitscore/three-stage/stage1-rubric.ts` (enforce max 6 criteria)
- `src/lib/fitscore/three-stage/stage2-candidate-intel.ts` (apply blinding before extraction)

---

### 8. Inter-Rater Reliability Tracking ⚠️ **PRE-LAUNCH (Baseline Measurement)**

**World-Class Requirement:**

- Track consistency scores across multiple runs
- Flag candidates with high score variance for human review
- Target >90% consistency (same resume, scored 10 times, <5% variance)

**Current State:**

- ❌ **No consistency tracking:** No measurement of score variance across runs
- ❌ **No variance flags:** No mechanism to flag high-variance candidates
- ⚠️ **Deterministic scoring:** Stage 3 is deterministic, but Stage 2 (evidence extraction) may vary
- ⚠️ **No baseline:** You discovered the Ram Kumar issue manually. You have no automated way to know if other candidates have variance issues.

**Gap:**

- No tracking of inter-rater reliability
- No variance measurement
- **Without measurement you're flying blind**

**Why This Is Critical:**

- You need to know your baseline consistency before launching
- The fix is not complex — just run the force-rescore test on 10 candidates after building it and record the variance
- That becomes your baseline

**Recommendation:**

- ✅ **PRE-LAUNCH (During Beta):** Add consistency measurement baseline:
  - Use `isTestRun` flag (already exists in DB schema)
  - Score same candidate+job 10 times using `forceRescore: true`
  - Calculate variance: mean, std dev, coefficient of variation
  - Store results in simple table or log
  - This gives you baseline to know if temperature 0 fix worked
- Add consistency tracking: `src/lib/fitscore/consistency-tracker.ts` (post-beta)
  - Function: `trackScoreVariance(candidateId, jobId, scores: number[]): ConsistencyMetrics`
  - Calculate: mean, std dev, coefficient of variation
  - Flag if CV > 0.05 (5% variance)
- Add test runs: Use `isTestRun` flag (already exists in DB schema)
  - Score same candidate+job 10 times
  - Calculate variance
  - Store in `fit_scores_consistency` table
- Add UI indicator: Show consistency badge in FitScoreCard (post-beta)
  - Green: <2% variance (highly consistent)
  - Yellow: 2-5% variance (moderate)
  - Red: >5% variance (needs review)

**Files to Create:**

- `src/lib/fitscore/consistency-tracker.ts` (post-beta)
- `supabase/migrations/XXXXXX_fit_scores_consistency.sql` (post-beta)

**Files to Modify:**

- `src/lib/fitscore/scorer.ts` (call consistency tracker - post-beta)
- `src/components/dashboard/FitScoreCard.tsx` (display consistency badge - post-beta)

---

## Phase 3: Intelligence Layer (Months 6-9)

### 9. Semantic Matching, Not Keyword Counting

**World-Class Requirement:**

- Use embeddings (text-embedding-3-small or better) for:
  - Skill similarity (e.g., "React" ≈ "React.js" ≈ "ReactJS")
  - Experience relevance (job description vs. resume semantic similarity)
  - Career trajectory analysis (progression patterns)

**Current State:**

- ✅ **Embeddings exist:** `src/lib/services/embeddings.ts`
  - Candidate embeddings: `embedCandidateProfile`
  - Job embeddings: `embedJobDescription`
  - Semantic search: `findSimilarCandidates` (uses pgvector)
- ⚠️ **Skill similarity:** Not explicitly used for skills aliasing (see Gap #5)
- ✅ **Experience relevance:** Semantic matching used for candidate-job matching
- ❌ **Career trajectory:** Not analyzed with embeddings (uses rule-based in Stage 2)

**Gap:**

- Embeddings not used for skills normalization
- Career trajectory is rule-based, not semantic

**Recommendation:**

- Add skill similarity matcher: `src/lib/services/skill-matcher.ts`
  - Use embeddings to find similar skills (e.g., "React" vs "React.js")
  - Build canonical skill dictionary
  - Use in normalization agent (Agent 2)
- Enhance career trajectory: Use embeddings to detect progression patterns
  - Compare role descriptions over time
  - Detect skill growth, responsibility increase

**Files:**

- `src/lib/services/embeddings.ts` (already exists)
- Create: `src/lib/services/skill-matcher.ts`

---

### 10. Contextual Understanding

**World-Class Requirement:**

- Career gap analysis: Distinguish "unemployed" vs "parental leave" vs "freelance"
- Skill depth detection: Surface-level mention vs. project implementation
- Achievement quantification: Extract metrics (%, $, time saved) and verify plausibility

**Current State:**

- ⚠️ **Career gap analysis:** Basic gap detection in signals (`getMaxGapMonthsInLast36Months`), but no distinction between gap types
- ⚠️ **Skill depth:** Evidence extraction checks for outcomes, but no explicit "surface vs deep" classification
- ⚠️ **Achievement quantification:** Metrics extracted in Stage 2 (`facts.metrics`), but no plausibility verification

**Gap:**

- Gap types not distinguished
- Skill depth not explicitly classified
- Metrics not verified for plausibility

**Recommendation:**

- Add gap classifier: `src/lib/fitscore/gap-classifier.ts`
  - Use LLM to classify gaps: "unemployed", "parental leave", "freelance", "sabbatical", "education"
  - Store in candidate profile
- Add skill depth detector: Extend Stage 2 to classify:
  - "Surface": Mentioned in skills list only
  - "Project": Used in project description
  - "Deep": Multiple projects, quantified outcomes
- Add metric verifier: `src/lib/fitscore/metric-verifier.ts`
  - Check if metrics are plausible (e.g., "1000% increase" → flag)
  - Verify metrics appear in resume text (already done in `validateFacts`)

**Files to Create:**

- `src/lib/fitscore/gap-classifier.ts`
- `src/lib/fitscore/metric-verifier.ts`

**Files to Modify:**

- `src/lib/fitscore/three-stage/stage2-candidate-intel.ts` (add skill depth classification)

---

### 11. Multi-Modal Input Handling

**World-Class Requirement:**

- Support PDF, DOCX, images (OCR), LinkedIn profiles, and even video resumes
- Use PaddleOCR or similar for image-based PDFs to prevent prompt injection via hidden text

**Current State:**

- ✅ **PDF support:** `parseResumeWithClaude` handles PDFs
- ✅ **DOCX support:** `extractTextFromBuffer` handles DOCX
- ✅ **Vision fallback:** `visionFallback` uses Claude Vision for image-based PDFs
- ❌ **OCR:** No PaddleOCR or similar (relies on Claude Vision)
- ❌ **LinkedIn profiles:** No LinkedIn import
- ❌ **Video resumes:** Not supported

**Gap:**

- No dedicated OCR (relies on Claude Vision, which may miss hidden text)
- No LinkedIn import
- No video resume support

**Recommendation:**

- Add PaddleOCR: `src/lib/services/ocr.ts`
  - Use for image-based PDFs before Claude Vision
  - Extract all text (including hidden)
  - Pass to Claude for structuring
- Add LinkedIn import: `src/lib/agents/linkedin-importer.ts`
  - Parse LinkedIn profile URL or export
  - Convert to resume format
- Video resumes: Lower priority (Phase 5)

**Files to Create:**

- `src/lib/services/ocr.ts` (PaddleOCR wrapper)
- `src/lib/agents/linkedin-importer.ts`

**Files to Modify:**

- `src/lib/agents/cv-parser.ts` (add OCR step before vision fallback)

---

### 12. Real-Time Consistency Monitoring

**World-Class Requirement:**

- Build a dashboard showing:
  - Extraction confidence scores by field
  - Score variance across multiple evaluations
  - Bias metrics by demographic group
  - Human override rates and reasons

**Current State:**

- ❌ **No dashboard:** No admin dashboard for monitoring
- ❌ **No extraction confidence:** Not tracked per field
- ❌ **No variance metrics:** Not displayed
- ❌ **No bias metrics:** Not tracked
- ⚠️ **Human overrides:** `recruiter_override` field exists, but no analytics

**Gap:**

- Complete absence of monitoring dashboard

**Recommendation:**

- Create admin dashboard: `src/app/(dashboard)/admin/resume-screening-analytics/page.tsx`
  - Extraction confidence by field (from golden dataset tests)
  - Score variance chart (from consistency tracker)
  - Bias metrics (from flip tests)
  - Human override rates (query `fit_scores` for `recruiter_override IS NOT NULL`)
- Add API endpoint: `src/app/api/admin/screening-analytics/route.ts`
  - Aggregate metrics from DB
  - Return JSON for dashboard

**Files to Create:**

- `src/app/(dashboard)/admin/resume-screening-analytics/page.tsx`
- `src/app/api/admin/screening-analytics/route.ts`

---

## Phase 4: Agentic Orchestration (Months 9-12)

### 13. Workflow Automation

**World-Class Requirement:**

- Auto-reply to candidates with personalized feedback
- Schedule interviews for top candidates
- Request missing information automatically
- Update ATS status and notify recruiters

**Current State:**

- ⚠️ **Partial automation:**
  - WhatsApp integration exists (`src/lib/services/whatsapp.ts`)
  - Email via Resend exists
  - No auto-reply with feedback
  - No interview scheduling
  - No missing info requests
  - ATS status updates exist (pipeline status)

**Gap:**

- No automated candidate communication
- No interview scheduling
- No missing info detection/requests

**Recommendation:**

- Add auto-reply agent: `src/lib/agents/auto-reply.ts`
  - Generate personalized feedback from FitScore
  - Send via WhatsApp/Email
- Add interview scheduler: `src/lib/agents/interview-scheduler.ts`
  - Integrate with calendar API
  - Auto-schedule top candidates (score > 80)
- Add missing info detector: `src/lib/agents/info-request.ts`
  - Detect missing fields (e.g., salary expectation, availability)
  - Send request via WhatsApp/Email

**Files to Create:**

- `src/lib/agents/auto-reply.ts`
- `src/lib/agents/interview-scheduler.ts`
- `src/lib/agents/info-request.ts`

---

### 14. Continuous Learning Loop

**World-Class Requirement:**

- Capture recruiter feedback on scores
- Retrain/normalize based on hiring outcomes (who got hired vs. rejected)
- A/B test scoring rubrics
- Monthly bias audits with published results

**Current State:**

- ⚠️ **Recruiter feedback:** `recruiter_selected` (primary vs shadow) exists, but no explicit feedback
- ❌ **Hiring outcomes:** Not tracked (no "hired" vs "rejected" outcome)
- ❌ **A/B testing:** Not implemented
- ❌ **Bias audits:** Not automated (see Gap #7)

**Gap:**

- No hiring outcome tracking
- No A/B testing framework
- No published bias audit results

**Recommendation:**

- Add outcome tracking: `supabase/migrations/XXXXXX_track_hiring_outcomes.sql`
  - Add `hiring_outcome` to `applications` table: "hired", "rejected", "withdrawn"
  - Link to FitScore for calibration
- Add calibration service: `src/lib/services/score-calibration.ts`
  - Compare scores to outcomes
  - Adjust rubric weights based on what predicts hiring
- Add A/B testing: `src/lib/fitscore/ab-testing.ts`
  - Test different rubric versions
  - Track which performs better
- Publish bias audits: Add public endpoint or monthly report

**Files to Create:**

- `src/lib/services/score-calibration.ts`
- `src/lib/fitscore/ab-testing.ts`
- `supabase/migrations/XXXXXX_track_hiring_outcomes.sql`

---

### 15. Explainability Dashboard

**World-Class Requirement:**

- For every candidate, generate:
  - Criterion-by-criterion breakdown
  - Evidence quotes with highlighting
  - Comparison to job requirements
  - Risk flags (employment gaps, job hopping, missing must-haves)

**Current State:**

- ✅ **Criterion breakdown:** `criteria_breakdown` exists in `FitScoreResult`
- ✅ **Evidence quotes:** `evidence_text` per criterion
- ⚠️ **Comparison to JD:** Implicit (criteria come from JD), but no side-by-side view
- ✅ **Risk flags:** `red_flags`, `amber_flags`, `green_flags` exist
- ❌ **Highlighting:** Evidence quotes not highlighted in resume text
- ❌ **Missing must-haves:** Not explicitly flagged — **PRE-LAUNCH CRITICAL**

**Gap:**

- No evidence highlighting in resume
- No explicit "missing must-haves" detection — **affects recruiter trust**
- No side-by-side JD comparison view

**Recommendation:**

- ✅ **PRE-LAUNCH:** Add missing must-haves detector: `src/lib/fitscore/missing-must-haves.ts`
  - Compare required skills in JD to candidate skills
  - Flag missing critical requirements
  - Display in UI as prominent warning
- Add evidence highlighter: `src/lib/fitscore/evidence-highlighter.ts` (post-beta)
  - Find evidence quotes in resume text
  - Return highlighted HTML/React component
- Enhance UI: `src/components/dashboard/FitScoreCard.tsx`
  - Show highlighted resume with evidence quotes (post-beta)
  - Side-by-side JD vs candidate comparison (post-beta)
  - **Missing must-haves section (PRE-LAUNCH)**

**Files to Create:**

- `src/lib/fitscore/missing-must-haves.ts` (PRE-LAUNCH)
- `src/lib/fitscore/evidence-highlighter.ts` (post-beta)

**Files to Modify:**

- `src/components/dashboard/FitScoreCard.tsx` (add missing must-haves section - PRE-LAUNCH)

---

## Phase 5: India-Specific Optimization (Ongoing)

### 16. Indian CV Format Handling ⚠️ **PRE-LAUNCH (Patterns in Grading)**

**World-Class Requirement:**

- Handle diverse date formats (MM/YYYY, YYYY, "Present" variations)
- Parse Indian degree nomenclature (B.Tech, B.E., MCA, etc.)
- Recognize Indian company name variations and aliases
- Handle multilingual skills (Hindi, Tamil, etc.) and certifications
- **Indian CV patterns in grading:** Understand Indian job market context when evaluating evidence

**Current State:**

- ⚠️ **Date formats:** Basic handling ("Present" supported), but no comprehensive format parsing
- ❌ **Degree nomenclature:** Not explicitly handled (relies on LLM)
- ❌ **Company aliases:** Not standardized (see Gap #5)
- ❌ **Multilingual:** Not supported (assumes English)
- ❌ **Indian CV patterns in grading:** Stage 2 grading doesn't account for Indian market context (e.g., contract roles, notice periods, LPA salary format)

**Gap:**

- Limited date format support
- No Indian-specific normalization
- **Grading doesn't understand Indian CV patterns** — affects score accuracy for your market

**Why This Is Critical:**

- Your market is India. Indian CVs have specific patterns:
  - Contract roles are common (not red flags)
  - Notice periods are standard (30-90 days)
  - Salary in LPA format
  - Company abbreviations (TCS, Infy, Wipro)
  - Degree abbreviations (B.Tech, B.E., MCA)
- If grading doesn't understand these patterns, it will mis-score candidates.

**Recommendation:**

- ✅ **PRE-LAUNCH:** Add Indian CV pattern awareness to Stage 2 grading:
  - Update `STAGE2_SYSTEM_PROMPT_V1` to include Indian market context
  - Don't penalize contract roles (common in India)
  - Understand notice period norms (30-90 days is standard)
  - Recognize LPA salary format
- Add date parser: `src/lib/utils/indian-date-parser.ts` (post-beta)
  - Handle: "MM/YYYY", "YYYY", "Present", "Till Date", "Current"
- Add degree normalizer: `src/lib/utils/indian-degree-normalizer.ts` (post-beta)
  - Map: "B.Tech" → "Bachelor of Technology", "B.E." → "Bachelor of Engineering", etc.
- Add company normalizer: `src/lib/utils/indian-company-normalizer.ts` (post-beta)
  - Map: "TCS" → "Tata Consultancy Services", "Infosys Ltd" → "Infosys", etc.
- Add multilingual support: Use translation API for non-English resumes (post-beta)

**Files to Modify (PRE-LAUNCH):**

- `src/lib/fitscore/three-stage/stage2-candidate-intel.ts` (add Indian CV pattern awareness to prompt)

**Files to Create (Post-Beta):**

- `src/lib/utils/indian-date-parser.ts`
- `src/lib/utils/indian-degree-normalizer.ts`
- `src/lib/utils/indian-company-normalizer.ts`

---

### 17. SMB-Specific Features

**World-Class Requirement:**

- Integrate with WhatsApp Business for candidate communication
- Support for informal job titles ("Full Stack Dev" vs "Full Stack Developer")
- Budget-aware scoring (prioritize candidates within salary range)
- Mobile-first recruiter interface

**Current State:**

- ✅ **WhatsApp:** Integration exists (`src/lib/services/whatsapp.ts`)
- ⚠️ **Job title normalization:** Basic (in JD parser), but no informal title handling
- ⚠️ **Budget-aware:** Salary expectation extracted, but not used in scoring
- ⚠️ **Mobile-first:** Responsive UI, but not explicitly mobile-optimized

**Gap:**

- Informal titles not normalized
- Salary not factored into scoring
- UI not explicitly mobile-first

**Recommendation:**

- Add title normalizer: `src/lib/utils/job-title-normalizer.ts`
  - Map: "Full Stack Dev" → "Full Stack Developer", "SWE" → "Software Engineer", etc.
- Add budget filter: `src/lib/fitscore/budget-scorer.ts`
  - Boost score if candidate salary expectation is within job range
  - Penalize if significantly outside range
- Enhance mobile UI: Audit and optimize for mobile-first experience

**Files to Create:**

- `src/lib/utils/job-title-normalizer.ts`
- `src/lib/fitscore/budget-scorer.ts`

---

## Critical Success Metrics

| Metric                                 | Current State | World-Class Target          | Status                                        |
| -------------------------------------- | ------------- | --------------------------- | --------------------------------------------- |
| **Extraction Accuracy**                | Unknown       | >95% precision, >93% recall | ❌ Not measured                               |
| **Consistency (same resume, 10 runs)** | Unknown       | <5% score variance          | ❌ Not measured                               |
| **Inter-rater reliability**            | N/A           | >90%                        | ❌ Not implemented                            |
| **Bias (demographic parity)**          | Unknown       | <5% disparity               | ❌ Not measured                               |
| **Time-to-first-match**                | Unknown       | <30 seconds                 | ⚠️ Not measured                               |
| **Human override rate**                | Unknown       | <10%                        | ⚠️ Field exists, not analyzed                 |
| **Explainability score**               | Unknown       | 9/10                        | ⚠️ Good evidence, missing confidence/location |

---

## Priority Implementation Roadmap

### 🚨 Pre-Launch Critical (Before Beta)

**Do These Now:**

1. ✅ **Set `temperature: 0` in CV parser** — 1 line, fixes root cause of score variance
2. ✅ **Add missing must-haves flag in UI** — Half day, affects recruiter trust
3. ✅ **Add Indian CV patterns in grading** — Half day, affects score accuracy for your market
4. ⚠️ **OpenAI structured extraction (if using two-model approach)** — 1 day, improves schema compliance
5. ⚠️ **Consistency measurement baseline** — 1 day, run during beta to establish baseline

**Defer Until Post-Beta:**

- Consensus double extraction (temperature 0 first)
- Bias blinding (low priority for beta)
- Multi-agent pipeline (low priority for beta)
- Golden dataset 100 resumes (low priority for beta)
- A/B testing framework (none for beta)

### Post-Beta (Month 2-3)

6. ❌ Add evidence confidence + source location
7. ❌ Add consistency tracking (inter-rater reliability)
8. ❌ Create explainability dashboard
9. ❌ Implement bias mitigation (blinding, proxy detection)

### Medium-term (Month 4-6)

10. ❌ Deploy multi-agent pipeline (normalizer, validator)
11. ❌ Add semantic skill matching
12. ❌ Build bias testing framework
13. ❌ Add comprehensive Indian CV format handling (dates, degrees, companies)

### Long-term (Month 7-12)

14. ❌ Full agentic orchestration (auto-reply, scheduling)
15. ❌ Continuous learning system (outcome tracking, calibration)
16. ❌ India-specific optimizations (multilingual, company aliases)

---

## Competitive Differentiation Strategy

**Current Strengths:**

- ✅ Evidence-based scoring (quotes exist)
- ✅ Three-stage deterministic pipeline
- ✅ WhatsApp integration (SMB-friendly)
- ✅ Semantic matching (embeddings)

**Gaps vs. Competitors:**

- ❌ No bias transparency (Expertia likely has this)
- ❌ No consistency measurement (Expertia likely better)
- ❌ Limited explainability depth (missing confidence, location)

**Recommended Positioning:**

- **"The Most Explainable Resume Screener for Indian SMBs"**
- Focus on:
  1. **Explainability:** Show exact evidence quotes with confidence + location
  2. **Bias Transparency:** Publish monthly bias audit reports
  3. **SMB Focus:** WhatsApp, mobile-first, affordable
  4. **Human-AI Collaboration:** "AI suggests, human decides" (not full automation)

---

## Conclusion

TigerHire has a **solid foundation** with the three-stage pipeline, evidence extraction, and deterministic scoring. The hybrid architecture is correct.

### Pre-Launch Critical Fixes (Do Before Beta)

**The legitimate concerns that affect score variance and recruiter trust:**

1. ✅ **Temperature 0 in CV parser** — 1 line fix, addresses root cause of score variance
2. ✅ **Missing must-haves flag in UI** — Half day, affects recruiter trust
3. ✅ **Indian CV patterns in grading** — Half day, affects score accuracy for your market
4. ⚠️ **OpenAI structured extraction** — 1 day (if using two-model approach), improves schema compliance
5. ⚠️ **Consistency measurement baseline** — 1 day, run during beta to establish baseline

**These are the actual gaps before launch. Everything else can wait for post-beta.**

### Post-Beta Enhancements (World-Class Standards)

To reach world-class standards post-beta, TigerHire needs:

1. **Validation & Consistency:** Golden dataset, consensus extraction, variance tracking
2. **Bias Mitigation:** Blinding, proxy detection, structured audits
3. **Explainability Depth:** Confidence levels, source locations, highlighting
4. **Multi-Agent Architecture:** Normalizer, validator agents
5. **Continuous Learning:** Outcome tracking, calibration, A/B testing

**Estimated Effort:**

- **Pre-Launch Critical:** 2-3 days (1 engineer)
- Post-Beta (Foundation): 3 months, 2 engineers
- Post-Beta (Advanced): 3 months, 2 engineers
- Post-Beta (Intelligence): 3 months, 2 engineers
- Post-Beta (Orchestration): 3 months, 1 engineer
- Post-Beta (India-specific): Ongoing, 1 engineer

**Total Pre-Launch: ~2-3 days**  
**Total Post-Beta: ~12 months, 2-3 engineers**

The hybrid architecture is correct; it needs targeted pre-launch fixes, then rigorous validation, bias testing, and evidence-based scoring enhancements post-beta to be truly world-class.
