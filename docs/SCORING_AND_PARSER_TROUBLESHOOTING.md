# Scoring and PDF Parser Troubleshooting

This doc helps you verify that **hybrid FitScore v2** and **resume/PDF parsing** are working, and what to do when they appear broken or you don’t see improvements.

**Entry paths (which route scores whom):** [`principles/scoring-entrypoints-current.md`](./principles/scoring-entrypoints-current.md) — canonical; all product paths use `FitScoreService` → hybrid v2 when JD Base is approved.

---

## 1. Quick verification

### Scoring (hybrid FitScore v2)

- **Unit tests**: `npm run test -- --run tests/unit/fitscore` (and related hybrid route tests under `tests/`)
- **API**: POST `/api/fit-score` with `{ jobId, candidateId }` (requires approved JD Base), or dashboard hybrid `POST /api/fitscore/score` when feature flag enabled. Unapproved JD Base → `pending_jd_approval` queue (unified paths) or 428/throw (direct hybrid API routes).
- **DB**: Active production rows: `fit_scores` with `scoring_version >= 2`, `superseded_at IS NULL`. Hybrid persists breakdown, verdict fields, and JD Base linkage. Legacy `scoring_version = 1` rows may exist but are superseded.

### PDF / resume parsing

- **Debug endpoint** (dev only): `node scripts/test-resume-parse.mjs [path-to-pdf]` (or no path for a minimal test PDF). Calls `POST /api/debug/test-resume-parse` and prints extraction + Claude parse steps.
- **Upload flow**: POST to `/api/candidates/upload-resume` with a PDF. Response includes `parseQuality`, `parseMethod`, `enriched`, and optional `warning` if extraction was incomplete.
- **Logs**: Look for `[upload-resume] Enrichment succeeded` or `Enrichment FAILED` and `[cv-parser]` / `[vision-fallback]` to see where parsing failed.

---

## 2. Common issues

### “No improvements visible” in the system

- **UI**: The app uses `mapDbFitScoreToView()` for hybrid and legacy column shapes. If the UI looks stale:
  - Confirm JD Base is **approved** for the job (otherwise pair is queued, not scored).
  - Re-run score for that pair and read the active row (`superseded_at IS NULL`, `scoring_version >= 2`).
- **Scores not computed**: If scores never run or fail:
  - Candidate must have resume text: either `cv_raw_text` populated (from upload + parse) or a resume in storage so `fetchResumeTextFromStorage` can get text. Otherwise you get: _"Candidate has no resume text available for scoring."_
  - Check logs for Anthropic credit/errors (402/502) and for `buildScoreInput` / `runHybridFitScorePipeline` errors.

### Scoring fails with “Candidate has no resume text available for scoring”

- **Cause**: No usable resume text for that candidate (no `cv_raw_text` and no text from storage, or text too short).
- **Fix**:
  - Have the candidate upload a resume via `/api/candidates/upload-resume` so that parsing runs and `cv_raw_text` (and profile fields) are set.
  - If the candidate was created by agency/import without upload, ensure a resume file is in storage and that `resume_url` or `cv_url` on the candidate points to that file (so `fetchResumeTextFromStorage` can download and extract text).
  - Ensure migrations are applied so `candidates.cv_raw_text` exists.

### PDF parser “broken” (empty or garbled text)

- **Text extraction** (`extract-document-text.ts`): Uses `pdf-parse` (PDFParse + getText + getTable). If extraction is empty or bad:
  - Check that `pdf-parse` is installed and that `getText()` returns a result with a `.text` property (see defensive handling in `extractPdfEnhanced`).
  - In serverless, the code uses a no-op worker so pdfjs runs on the main thread; if you see worker/DOMMatrix errors, check the polyfill and worker setup at the top of `extract-document-text.ts`.
- **Vision fallback**: When extraction quality is `failed` or `low`, the pipeline calls `visionFallback()` (Claude reads the PDF). If that fails:
  - Check Anthropic API key and billing.
  - Check `callClaudeWithUserContent` and document payload (base64 PDF + prompt).
- **Structured parse**: After text (or vision) we have Claude structure the content. If that fails, check `parseResumeWithClaude` and CV schema in `cv-parser.ts` / `schemas`.

### FitScore API returns 402 or 502

- **402**: Usually Anthropic credit/billing. Message: _"Your API credit balance is too low..."_. Add credits in Plans & Billing.
- **502**: Often invalid or non-JSON response from the LLM extraction step. Check hybrid extraction/verdict prompts and that `parseHybridExtractionJson` / `parseJsonFromLLM` can parse the response.

---

## 3. Architecture recap

- **Scoring**: `FitScoreService.computeSingle` → JD Base approval gate → `runHybridFitScorePipeline` → `buildScoreInput` (JD text + resume text) → hybrid extraction + `computeHybridScore` → `saveHybridFitScore` (`scoring_version` 2).
- **Resume text for scoring**: Prefer `candidates.cv_raw_text`; if missing or short, text is fetched from storage via `fetchResumeTextFromStorage` (path parsed from `resume_url`/`cv_url`). If there’s still no usable text, scoring throws the clear “no resume text” error above.
- **PDF parsing**: Upload → `extractTextFromBuffer` (pdf-parse getText + getTable) → quality validation → if low/failed, `visionFallback` (Claude document API) → `parseResumeWithClaude` (structure) → candidate profile and `cv_raw_text` updated.

---

## 4. What was fixed recently

- **Scoring**: If the candidate has no resume text (or it’s too short), the pipeline now throws a clear error and the API returns **400** with: _"Candidate has no resume text available for scoring. Ask them to upload a resume or ensure the resume was parsed successfully."_
- **PDF extraction**: More defensive handling of `getText()` result (object with `.text` vs string) so small API changes in `pdf-parse` don’t silently produce empty text.

If you’ve run the checks above and migrations are applied but scoring or parsing still fails, use the debug endpoint and server logs (and, for scoring, the exact error message from the API) to narrow it down to: missing data (resume text), Anthropic, DB schema, or UI mapping.
