# Capability Calibration Model — Migration

The **Capability Calibration Model** replaces rubric-based scoring with 5 universal dimensions, scalar (1–10) extraction, and deterministic sigmoid calibration. It is **role-agnostic**: the same definitions apply to any function or industry (e.g. operations, creative, technical, sales, support). This doc describes how to switch and optionally clear old data.

## Architecture

- **Stage 1**: Job description → capability targets (1–10 per dimension: Scope, Complexity, Impact, Collaboration, Craft). No role-specific criteria.
- **Stage 2**: Candidate document → demonstrated levels (1–10) + confidence (0–1) + evidence quotes. Same scale for any background.
- **Stage 3**: Deterministic: `contribution = sigmoid(demonstrated - target) * confidence` per capability; sum = 0–100.

No arbitrary weights, no A/B/C/D/E grades, no LLM scoring, no domain-specific language — only scalar extraction and a fixed formula.

## Using the capability scorer

```ts
import {
  computeFitScoreCapability,
  computeFitScoreCapabilityWithSnapshots,
  type CapabilityScoreInput,
} from "@/lib/fitscore/three-stage";

const input: CapabilityScoreInput = {
  job_id: job.id,
  jd_text: jdText,
  candidate_id: candidate.id,
  candidate_name: candidate.name ?? "Candidate",
  resume_text: resumeText,
};

// Option A: get result only
const result = await computeFitScoreCapability(input);

// Option B: get result + snapshots for persistence (e.g. fit_scores table)
const { result, targets, demo } = await computeFitScoreCapabilityWithSnapshots(input);
await db.fitScores.upsert({
  ...result,
  rubric_snapshot: targets as unknown as RoleIntelligence,
  evidence_snapshot: demo as unknown as CandidateIntelligence,
});
```

## Switching the default pipeline

To make the main `computeFitScore` use the capability model:

1. In `src/lib/fitscore/scorer.ts`, build `CapabilityScoreInput` from job + candidate (reuse `buildScoreInput` for `jd_text`/`resume_text`, add `candidate_name`).
2. Call `computeFitScoreCapabilityWithSnapshots(input)` instead of `computeFitScoreThreeStage(...)`.
3. Persist with the same `db.fitScores.upsert`; use `targets` and `demo` as `rubric_snapshot` and `evidence_snapshot` (cast as above).

## Clearing old rubric/evidence data (optional)

If you no longer need the old rubric-based caches:

- **fit_score_rubrics**: Stores `role_intelligence` (rubric). Can truncate or leave; capability pipeline does not read it.
- **fit_score_evidence**: Stores `candidate_intelligence` (evidence). Can truncate or leave; capability pipeline does not read it.
- **fit_scores**: Keep. New runs will overwrite rows; `criteria_breakdown` will have 5 capability rows instead of rubric criteria. Snapshots will be capability targets/demo instead of rubric/evidence.

No schema change required. To clear caches (e.g. for a clean recalculation):

```sql
-- Optional: clear rubric cache so no one uses old rubrics
-- TRUNCATE fit_score_rubrics;

-- Optional: clear evidence cache
-- TRUNCATE fit_score_evidence;
```

Re-scoring all candidates will repopulate `fit_scores` with capability-based results.
