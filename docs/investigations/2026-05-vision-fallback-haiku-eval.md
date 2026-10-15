# Investigation: Vision fallback — Sonnet 4 vs Haiku 4.5 (verbatim PDF text)

> **Paused 2026-05-09** — cost is not holding production. Revisit when forced by Sonnet model deprecation (June 15, 2026) or when business priorities shift.

**Date:** May 2026  
**Status:** Protocol documented; **empirical pass rate and quoted examples are pending** a one-off evaluation run (no production code changes in this step).  
**Parked work link:** TH-VISION-MODEL-EVAL (`docs/ops/parked-work.md`).  
**Linked code (reference only):** `src/lib/fitscore/vision-fallback.ts`.

---

## 1. Why this matters

When hybrid scoring decides PDF text quality is below its numeric threshold, the app sends the **actual PDF** to Claude and asks for **full verbatim text** (not a summary). That path is labeled **`vision-fallback-resume`** in logs. It currently uses **Sonnet 4** and costs on the order of **two to four cents** per call depending on file size and tokens.

**Haiku 4.5 supports multimodal input** and is much cheaper per token in our ledger table. If quality stayed comparable, migration could reduce spend on a path that runs for **many PDFs**.

**Parsing accuracy is non-negotiable.** This memo uses **stricter decision thresholds** than the CV-parser study: favor **keeping Sonnet** unless Haiku clearly holds up on verbatim extraction.

---

## 2. Hypothesis

Haiku 4.5 multimodal may extract **equivalent verbatim resume text** from the same PDFs as Sonnet when given the **same extraction instructions** and token ceiling used in production today.

---

## 3. Sample selection (20 PDFs)

Choose **20 production PDFs** that **recently triggered vision fallback** (or the same PDF bytes you would send down that path). Mix:

| Bucket                                 | Count | What to prefer                                     |
| -------------------------------------- | ----- | -------------------------------------------------- |
| Simple single-column layouts           | 10    | Easy reading order.                                |
| Multi-column or magazine-style layouts | 5     | Columns read out of order if the model is weak.    |
| Tables, charts, or unusual formatting  | 5     | Stress cases for hallucination or skipped numbers. |

**Rule:** Use internal candidate or file identifiers only in notes; do not paste full extracted text or personal data into this document—short **quotes** for failures only, redacted if needed.

---

## 4. Procedure (evaluation harness only)

For each PDF:

1. Run **Sonnet 4** vision with the **same model role, user instructions, max output length cap, and PDF attachment style** as `visionFallback` uses today.
2. Run **Haiku 4.5** vision with the **same prompt and parameters**.
3. Store **input and output token counts** for each call.
4. Compare outputs:
   - **Overall difference:** How different are the two extracted bodies (length and a standard text similarity score is enough for a first pass)?
   - **Critical strings:** Names, employers, job titles, dates, and numeric claims (salaries, percentages, metrics)—flag misses or inventions.
   - **Tie-break:** Where they disagree, open the PDF and judge **which transcript matches what a human sees** (spot checks).

Do **not** change production code paths or feature flags while collecting data.

---

## 5. What counts as a “match”

Count **one point per PDF** toward the **20 total** only if:

- Haiku’s extraction is **substantively the same** as Sonnet’s for **reading-order text**, **and**
- There are **no critical errors**: wrong person name, invented employer, dropped employment block, or clearly wrong dates/numbers.

Minor whitespace, punctuation, or line-break differences alone **do not** fail a case.

---

## 6. Cost comparison (how to express savings)

Use the same internal rate families as in **`src/lib/costs/ledger.ts`**: Sonnet 4 vs Haiku 4.5. Vision calls often carry **large input token counts** because the PDF is part of the request; savings can be **meaningful** when input-heavy.

**Illustrative example** from recent-style logs (rounded): about **2,700 input tokens** and **1,000 output tokens** might land near **two and a half cents** on Sonnet and **under one cent** on Haiku at table rates—**your harness numbers supersede this illustration.**

Multiply per-call savings by how often vision fallback runs after any future threshold tuning.

---

## 7. Empirical results (fill in after the run)

| Metric                       | Value     |
| ---------------------------- | --------- |
| Pass rate (matches / 20)     | _Pending_ |
| Simple layouts (passes / 10) | _Pending_ |
| Multi-column (passes / 5)    | _Pending_ |
| Tables/unusual (passes / 5)  | _Pending_ |

**Where Haiku missed or invented** (short quoted snippets only, redacted as needed):

1. _Pending_
2. _Pending_
3. _(add as needed)_

**Bonus — neither model did well:**  
_Note PDF types where both outputs were poor; that may indicate OCR, encryption, or layout issues rather than model choice._

---

## 8. Decision rules (conservative)

- **≥18 / 20** with **no critical errors**: **Recommend migration** to Haiku for vision fallback.
- **14–17 / 20**: **Recommend migration with caveats**—spell out which PDF layouts failed.
- **<14 / 20**: **Do not migrate**—keep Sonnet for vision extraction.

When in doubt between two buckets, **choose the more conservative recommendation**.

---

## 9. Recommendation (final sentence reserved for after results)

**Pending:** After completing §7, state clearly: **migrate**, **migrate with conditions**, or **stay on Sonnet**.

---

## 10. Next step

Execute the harness, complete §7–§9, then decide whether to open an implementation change. **Treat parsing regressions as release blockers.**
