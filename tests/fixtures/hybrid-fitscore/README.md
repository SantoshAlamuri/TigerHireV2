# Hybrid FitScore validation fixtures

Use these for **TC-01–TC-03, TC-06–TC-08** (live extraction + scoring) before enabling `fitscore_hybrid_v2` broadly.

## Contents

| File                         | Notes                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `jd-scrum-master-sample.txt` | Sample JD text for a **Technical Scrum Master** role (tune to your real JD).                                  |
| `resumes/*.txt`              | Seven resume bodies from the internal FitScore v3 artifact (`tigerhire_fitscore_v3.jsx`).                     |
| `validation-reference.json`  | **Non-authoritative** reference ranges from an earlier v2 run — use for manual comparison, not CI assertions. |

## Missing from this pack (add when available)

Six additional resume fixtures are referenced in the full 13-candidate validation set (e.g. Swadhinta Pal, Sireesha, Udaynath). Drop them under `resumes/` and extend `validation-reference.json`.

## How to run the canary (TC-01)

1. Apply DB migrations (`jd_base_documents`, `fit_scores.scoring_version`, etc.).
2. Create or select a job whose JD matches a Scrum Master template (or paste `jd-scrum-master-sample.txt` into the job description).
3. Ensure `POST /api/fitscore/jd-base` has created a JD Base (or rely on auto-`ensureJdBaseForJob` on job post).
4. Import `resumes/shashank-garg.txt` as the candidate’s CV text (or use a candidate with that resume on file).
5. Call `POST /api/fitscore/score` with `jobId` + `candidateId` (feature flag on).

**Pass:** Shashank scores **≥ 60** and is not labelled **Not a Fit** (per TC-01).

## Live automated suite (optional)

Full pipeline tests need `ANTHROPIC_API_KEY` and cost money. When you add `tests/integration/hybrid-fitscore-live-validation.test.ts`, gate it with an env var (e.g. `RUN_HYBRID_LIVE_VALIDATION=1`) so CI stays free.

## Model ID

Set `FITSCORE_HYBRID_HAIKU_MODEL` to the exact model your Anthropic workspace exposes (see `src/lib/fitscore/hybrid/constants.ts`). The repo default is a stable Haiku 3.5 snapshot; override when your project enables newer Haiku IDs.

## Product note (template library)

The **121-role India template** pack and **auto–JD Base on job post** (`ensureJdBaseForJob`) live in `src/lib/fitscore/hybrid/` — use them so TC-01 runs against a consistent Scrum Master JD Base without manual CRUD.
