# Investigation: CV parser — Sonnet 4 vs Haiku 4.5 (structured JSON)

> **Paused 2026-05-09** — cost is not holding production. Revisit when forced by Sonnet model deprecation (June 15, 2026) or when business priorities shift.

**Date:** May 2026  
**Status:** Protocol documented; **empirical pass rate and examples are pending** a one-off evaluation run (no production code changes in this step).  
**Linked code (reference only):** `src/lib/agents/cv-parser.ts`, prompt in `src/lib/agents/prompts/cv-parse.ts`.

---

## 1. Why this matters

The CV parser turns resume text into structured profile fields (name, skills, roles, dates, education, seniority, and related signals). Today that step uses **Sonnet 4**. Each parse costs on the order of **three cents** per call at typical sizes. **Haiku 4.5** is priced much lower for the same token patterns. The question is whether quality stays acceptable for downstream FitScore and recruiter workflows.

---

## 2. Hypothesis

Haiku 4.5 may be **accurate enough** for this extraction task when using the **same instructions and settings** as today (temperature zero, same prompt text, same output shape expected by our schemas).

---

## 3. Sample selection (15 resumes)

Pick **15 real resumes** already parsed in production with Sonnet, labeled into three buckets:

| Bucket                    | Count | What to prefer                                                                             |
| ------------------------- | ----- | ------------------------------------------------------------------------------------------ |
| Simple, text-heavy        | 5     | Straightforward layouts; skills and roles appear as plain paragraphs or bullets.           |
| Tabular or complex layout | 5     | Tables, multi-column text from extraction, dense headings—what often stresses parsers.     |
| Mixed PDF-derived text    | 5     | Text that came from PDF extraction (including slightly noisy spacing or section ordering). |

**Rule:** Keep identifiers internal; do not paste full resumes into this document.

---

## 4. Procedure (evaluation harness only)

1. For each resume, take the **same text slice** the parser uses (up to the length limit in code today).
2. Call the model **Haiku 4.5** with the **exact same user prompt and system instructions** as production Sonnet uses for the text path.
3. Normalize outputs the **same way** the app does after parsing (same schema validation and normalizers), so comparisons are fair.
4. Record **input and output token counts** per call for cost math.

Do **not** change production routes, environment defaults, or deployed models for this step.

---

## 5. What to compare (match rubric)

For each of the 15 cases, treat as a **“match”** if Haiku agrees with Sonnet **within one minor field** (e.g. a single skill synonym, one date format difference that refers to the same period, small rounding on years).

Check:

- **Skills:** Missing, extra, or wrong skills versus Sonnet baseline (counts + short notes).
- **Experience:** Companies, titles, date ranges, and order—material mistakes count against match.
- **Education:** Institutions, degrees, years—same standard.
- **Seniority:** Same bucket (`junior` / `mid` / `senior`, etc.) or clearly equivalent.

**Note:** The prompt asks for richer JSON than the short system line lists; comparisons should use the **normalized structured object** the pipeline actually persists, not raw model quirks.

---

## 6. Cost comparison (how to express savings)

Internal pricing used by the ledger comes from **`src/lib/costs/ledger.ts`** (Sonnet 4 family vs Haiku 4.5 family). In plain terms:

- Sonnet is charged at a **higher dollars-per-thousand-tokens** rate on both input and output.
- Haiku 4.5 is charged at roughly **one third** of Sonnet’s input rate and **one third** of the output rate in that table.

**Illustrative example** (not a guarantee for every resume): if one call used about **1,500 input tokens** and **1,800 output tokens**, Sonnet lands near **three cents** while Haiku lands near **one cent** for that same usage pattern—before any caching. Always recompute from **actual** token counts from your harness.

**If we migrated** all CV-parser-text calls at current volumes, multiply per-call savings by how many parses you run per day/week.

---

## 7. Empirical results (fill in after the run)

| Metric                                | Value     |
| ------------------------------------- | --------- |
| Pass rate (matches / 15)              | _Pending_ |
| Simple text-heavy bucket (passes / 5) | _Pending_ |
| Complex/tabular bucket (passes / 5)   | _Pending_ |
| Mixed PDF-text bucket (passes / 5)    | _Pending_ |

**Where Haiku and Sonnet disagreed** (one or two short sentences each; no raw CV text):

1. _Pending_
2. _Pending_
3. _(add as needed)_

---

## 8. Decision rules (from charter)

- **≥13 / 15** matches (within one minor field): **Recommend migration** to Haiku for this step.
- **10–12 / 15**: **Recommend migration with caveats**—list which resume types failed.
- **<10 / 15**: **Do not migrate**; keep Sonnet for CV parsing.

---

## 9. Recommendation (final sentence reserved for after results)

**Pending:** After completing §7, state clearly: **migrate**, **migrate with conditions**, or **stay on Sonnet**.

---

## 10. Next step

Run the offline harness, fill §7–§9, then route any code change through normal review. **No production model switch should happen based on this protocol document alone.**
