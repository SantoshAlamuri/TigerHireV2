# Summary: Recruitment & Resume Changes (Feb 25, 2025)

One-place summary of what was done, what you need to do, what to run in Supabase, and the effect of all changes.

---

## 1. What has been done

### A. Resume bucket & storage (accuracy, speed, correct links)

| Done                                  | Detail                                                                                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Upload path fixed**                 | New uploads use path `{candidate_id}/{timestamp}.{ext}` (no `resumes/` prefix) so RLS first segment = candidate_id.                                                    |
| **`storage_path` on resume_versions** | Migration adds column; upload-resume and POST resumes can store path for signed URLs.                                                                                  |
| **Signed URLs**                       | GET `/api/candidates/[id]/resumes` returns `view_url` (1h signed) per version; GET `.../resumes/[versionId]/signed-url` returns 15-min URL. Private bucket links work. |
| **upload-resume creates version**     | Each upload inserts a `resume_versions` row with `storage_path` and returns `viewUrl` + `version`.                                                                     |
| **Form field**                        | API accepts both `resume` and `file` in formData.                                                                                                                      |
| **Frontend**                          | Candidate profile and recruit resumes page use `view_url ?? file_url`; profile refetches version list after upload.                                                    |

### B. Matching: no full-table scan (speed, scale)

| Done                                 | Detail                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **FitScore uses vector search only** | For each job we call `findSimilarCandidates(jobId, …)` (RPC `match_candidates`). We only score that shortlist — no scan of all candidates. |
| **Job embedded first**               | If job has no `jd_embedding`, we call `embedJob(jobId)` before matching.                                                                   |
| **`match_candidates` intent filter** | Migration adds optional `intent_min` (e.g. 40) so DB returns only candidates with sufficient intent.                                       |

### C. Recruitment goals: cost, 90%+ match, speed, accuracy

| Done                      | Detail                                                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Similarity gate**       | Only score pairs with similarity ≥ 0.6; `match_threshold` 0.6 in `findSimilarCandidates`.                                                                               |
| **Cap 80 scores per job** | Max 80 fit-score (Claude) calls per job to control cost.                                                                                                                |
| **Richer embeddings**     | Candidate embedding text includes `current_role`, `seniority_level`; job includes `seniority_level`, `role_function`, `skills_required` for better JD–resume alignment. |
| **Parallel fit-score**    | Up to 4 `computeFitScore` calls at a time for lower latency.                                                                                                            |
| **Score clamping**        | All dimension and overall scores clamped 0–100; safe parsing when LLM JSON is missing/invalid.                                                                          |

---

## 2. What needs to be done (by you)

| Task                                      | Priority                         | Notes                                                                                                                                                                                                                                                               |
| ----------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Run Supabase migrations**               | Required                         | Apply the two new migrations (see Section 3).                                                                                                                                                                                                                       |
| **Migrate old resume objects**            | If you have existing uploads     | If any files were uploaded with the old path `resumes/{candidateId}/...`, RLS will deny access. Either move those objects to `{candidate_id}/{filename}` via a one-off script (service role) or accept that only new uploads work until then.                       |
| **Re-embed candidates/jobs (optional)**   | For 90%+ match on existing data  | New/updated rows get the richer embedding text automatically. To improve match quality for existing rows, run your existing batch jobs (e.g. `embedAllCandidates`, `embedAllJobs`) or a cron that re-embeds; they will use the new `candidateToText` / `jobToText`. |
| **candidate-cvs bucket (optional)**       | Later                            | Plan doc Phase B: align `candidate-cvs` paths with tenant RLS (e.g. `{candidate_id}/...`) or add a metadata table. Not done in code.                                                                                                                                |
| **Drop legacy storage policy (optional)** | After migrating old resume paths | If all resume objects use `candidate_id/...`, you can drop the “Users can read own resume” policy that checks `auth.uid()` as first segment (in 12_storage / 74).                                                                                                   |

---

## 3. What to update in Supabase

### 3.1 Run these migrations (in order)

Apply these in the Supabase dashboard (**SQL Editor**) or via CLI (`supabase db push` / your CI):

1. **`20250225120000_resume_storage_path_and_signed_urls.sql`**
   - Adds `storage_path` to `resume_versions`.
   - Adds partial index on `(candidate_id)` where `storage_path IS NOT NULL`.

2. **`20250225130000_match_candidates_intent_and_scale.sql`**
   - Replaces `match_candidates` with a 4th parameter `intent_min` (optional).
   - When `intent_min` is set, only candidates with `intent_score >= intent_min` are returned.

**How to run**

- **Dashboard:** Project → SQL Editor → paste each migration file content → Run.
- **CLI:** From project root, `supabase migration up` (or your usual migration command).

No new buckets or dashboard config are required; RLS for storage is already in `20250225103200_tenant_security_storage_apps.sql`.

### 3.2 Nothing else required in Supabase

- No new environment variables.
- No change to bucket names or public/private settings.
- Existing storage policies stay; they already expect first path segment = candidate_id (we fixed the upload path in app code).

---

## 4. Effect of doing this

### 4.1 Resumes

| Effect                     | Before                                                                       | After                                                                   |
| -------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **RLS**                    | Path `resumes/...` didn’t match policies; company/candidate read could fail. | Path `{candidate_id}/...` matches; access control works as designed.    |
| **Links**                  | Private bucket + `getPublicUrl` → links could fail.                          | Signed URLs (`view_url`) → View/Download work.                          |
| **Single source of truth** | Mix of candidate.resume_url and versions.                                    | `resume_versions` + `storage_path`; list from DB, serve via signed URL. |
| **Speed**                  | N/A                                                                          | No storage listing; responses from DB + signed URL generation.          |

### 4.2 Matching & recruitment

| Effect            | Before                                                | After                                                                            |
| ----------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Scale**         | Could load “top 50 by intent” globally and score all. | Only semantic shortlist per job (vector search); no full candidate scan.         |
| **Cost**          | Up to 150 LLM calls per job.                          | Max 80 per job; only pairs with similarity ≥ 0.6.                                |
| **Match quality** | Generic candidate/job text for embeddings.            | Richer text (role, seniority, skills) → better JD–resume alignment, 90%+ target. |
| **Speed**         | Sequential fit-score.                                 | Up to 4 parallel fit-scores; shorter time-to-shortlist.                          |
| **Accuracy**      | Raw LLM scores could be out of range or missing.      | Scores clamped 0–100; safe parsing.                                              |

### 4.3 Overall

- **Recruitment tool:** Lower cost, higher match quality (JD ↔ resume and vice versa), faster shortlist, reliable scores.
- **Resume UX:** Correct access control, working View/Download links, consistent API and path convention.
- **Scale:** Safe for large candidate sets; matching is index-based and capped per job.

---

## 5. File reference

| Area              | Key files                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Migrations**    | `supabase/migrations/20250225120000_*`, `supabase/migrations/20250225130000_*`                                                                                         |
| **Resume API**    | `src/app/api/candidates/upload-resume/route.ts`, `src/app/api/candidates/[id]/resumes/route.ts`, `src/app/api/candidates/[id]/resumes/[versionId]/signed-url/route.ts` |
| **Matching**      | `src/lib/agents/fitscore-agent.ts`, `src/lib/services/embeddings.ts`, `src/lib/fitscore/scorer.ts`                                                                     |
| **Plan (detail)** | `docs/plans/2025-02-25-resume-bucket-segregation.md`                                                                                                                   |
