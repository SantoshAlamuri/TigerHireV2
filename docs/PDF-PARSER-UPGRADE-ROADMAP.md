# PDF Parser Upgrade Roadmap

TigerHire is a **CV understanding system** (semantic extraction + LLM), not a document reconstruction engine. This roadmap bridges the gap for the 20% of resumes that need layout-aware parsing (tables, multi-column, complex layouts).

## Completed (Week 1)

### ParseParameters + getTable()

- **`extract-document-text.ts`**: All PDF extraction now uses shared `extractPdfEnhanced()`:
  - **ParseParameters**: `lineThreshold: 2.0`, `cellThreshold: 2.5`, `lineEnforce: true`, `cellSeparator: " | "`, `pageJoiner: "\n\n---PAGE BREAK---\n\n"`.
  - **getTable()**: Runs in parallel with `getText()`. Detected tables are appended as markdown (`[Extracted tables]` + `| col | col |` blocks) so the LLM sees structure without API changes.
- **`pdf-text.ts`**: Delegates to `extractTextFromBuffer(..., "application/pdf", "resume.pdf")` so Scout uses the same pipeline.

**Impact**: Table-heavy and alignment-table resumes get structured table text in addition to flat text; line/cell thresholds improve reading order for dense layouts.

---

## Week 2: PDF → Markdown Preprocessing

**Goal**: Convert PDF to markdown (headers, lists, tables) before the LLM so structure is explicit.

**Option A – `@opendocsg/pdf2md`**

- Add dependency: `@opendocsg/pdf2md`.
- New path: for resume parsing, optionally `pdf2md(buffer)` and pass markdown to the CV parser instead of raw text.
- **Caveat**: Package may be browser-oriented or have callback-based API; verify Node/buffer support and error handling.

**Option B – Use current table output as “markdown-like”**

- We already append `[Extracted tables]` + markdown tables. Optionally add a `useMarkdownPipeline: boolean` (e.g. env or feature flag) that, when true, runs `pdf2md` and uses that as the main body, still appending our table blocks if needed.

**Files to touch**

- `extract-document-text.ts`: add `extractPdfToMarkdown(buffer)` (or integrate pdf2md) and export.
- `cv-parser.ts`: when parsing PDF, optionally use markdown path and pass result to Claude as “CV (markdown)” in the prompt.

---

## Week 3: Coordinate-Aware Extraction (Multi-Column)

**Goal**: Detect multi-column layouts (e.g. academic CVs) and reconstruct reading order.

**Tool**: `pdf.js-extract` (or similar) for per-item `x`, `y` (and optionally font/size).

**Steps**

1. Add optional dependency `pdf.js-extract` (or use pdf-parse’s lower-level APIs if they expose positions).
2. New module e.g. `src/lib/services/pdf-geometry.ts`:
   - `extractWithPositions(buffer)`: returns `{ pages: [{ content: [{ str, x, y }] }] }`.
   - `detectColumns(pageContent)`: cluster by Y, then detect large X-gaps → column boundaries.
   - `reorderByReadingOrder(pages)`: sort by Y desc, then X within same line; respect column clusters.
3. Use only when needed: e.g. when `extractPdfEnhanced` yields very low quality (e.g. `validateResumeText` fails) and we’re about to hit vision fallback, try geometry-based reordering once and re-validate.

**Files**

- New: `src/lib/services/pdf-geometry.ts`.
- `cv-parser.ts` or `extract-document-text.ts`: optional branch that calls geometry layer for “last chance” before vision.

---

## Week 4: Experience-Specific Heuristics

**Goal**: Treat experience-like tables as first-class (date in last column, title/company in first columns).

**Steps**

1. In `extract-document-text.ts` (or a dedicated `resume-tables.ts`), after we have `TableResult`:
   - For each table, run heuristics: date regex in last column, job-title keywords in first column.
   - If it matches “experience table”, emit a structured block e.g. `[Experience table]\nCompany | Title | Dates | ...` or a small JSON array that the prompt can reference.
2. CV parser prompt: add instruction to prefer `[Experience table]` blocks when present for `work_history` and dates.

**Files**

- `extract-document-text.ts` or new `src/lib/agents/resume-tables.ts`: `detectExperienceTable(table)`, `formatExperienceTable(rows)`.
- `prompts/cv-parse.ts`: mention experience tables in the system/user prompt.

---

## When to Use What

| Document type              | Current behavior  | After full roadmap                    |
| -------------------------- | ----------------- | ------------------------------------- |
| Standard single-column     | Works             | Same (no change)                      |
| Multi-column academic CV   | Weak              | Week 3 geometry + reorder             |
| Table-heavy (consulting)   | Improved (Week 1) | Week 1 + Week 4 experience heuristics |
| Scanned / image PDF        | Vision fallback   | Unchanged (Claude vision)             |
| Complex layout (designers) | Inconsistent      | Week 2 PDF→Markdown optional path     |

---

## Strategic Note

We are **not** building a general document reconstruction engine. Each upgrade is scoped to **resume/CV understanding**: better tables, columns, and structure so the LLM gets clearer input. Vision fallback remains the safety net for truly opaque PDFs.
