# Resume Bucket Segregation — Research & Implementation Plan

> **For Claude:** When implementing, use verification-before-completion for each phase (run migrations, tests, manual checks).

**Goal:** Segregate the resume bucket with a strict path convention and access pattern so storage RLS is accurate, listing is avoidable, and responses are faster and correct.

**Architecture:** Single `resumes` bucket with path convention `{candidate_id}/{unique_id}.{ext}`; use `resume_versions` as source of truth (no storage listing); store storage path and serve via short-lived signed URLs. Optional: align `candidate-cvs` paths with tenant RLS.

**Tech Stack:** Next.js API routes, Supabase Storage (private bucket), Postgres RLS, `storage.objects` policies.

---

## 1. Research Summary

### 1.1 Current State

| Bucket                  | Path pattern in code                        | RLS expects (first segment)    | Match?                                |
| ----------------------- | ------------------------------------------- | ------------------------------ | ------------------------------------- |
| **resumes**             | `resumes/${candidateId}/${ts}.${ext}`       | `candidate_id` or `auth.uid()` | **No** — first segment is `"resumes"` |
| **candidate-cvs**       | `cvs/${phone}_${ts}.pdf` / `cvs/public_...` | `candidate_id` (UUID)          | **No** — first segment is `"cvs"`     |
| **verification-videos** | `{candidate_id}/{file}`                     | `candidate_id`                 | Yes                                   |

- **resumes**: `upload-resume/route.ts` uses object name `resumes/candidateId/timestamp.ext`. RLS in `74_tenant_security_storage_apps.sql` and migration uses `(storage.foldername(name))[1]` as candidate_id (or user_id for own). So **company and candidate read policies fail** for objects under `resumes/...`.
- **resume_versions**: Stores `file_url` (full URL). Bucket is **private**; `getPublicUrl` does not grant access for private buckets — access requires **signed URLs** or auth header. So either links are broken or another mechanism is used.
- **candidate-cvs**: Scout/public-apply upload before candidate exists or with paths that don’t include candidate_id; tenant policy expects first segment = UUID → **tenant-scoped read is ineffective**.

### 1.2 Supabase Storage Best Practices (from docs)

- **Paths:** “Folders” are key prefixes; no native folder API. Use a **consistent path convention** so RLS can rely on the first segment (e.g. `candidate_id`).
- **Performance:** Avoid `storage.list()` at scale; it computes full hierarchy. Prefer querying **your own metadata table** (e.g. `resume_versions`) and use **direct object access by path**. For listing, use a custom Postgres function that queries `storage.objects` with `WHERE name LIKE prefix || '%'` and `LIMIT`/`OFFSET` (see [Storage scaling](https://supabase.com/docs/guides/storage/production/scaling)).
- **RLS:** Avoid heavy JOINs in storage policies; use **SECURITY DEFINER** helpers (you already have `can_caller_orgs_access_candidate_resume`). Add **indexes** on columns used in RLS.
- **Private buckets:** Use **signed URLs** (`createSignedUrl`) for temporary access; do not rely on `getPublicUrl` for private buckets.

### 1.3 Segregation Strategy

- **Single convention for resumes:** Path = `{candidate_id}/{unique_id}.{ext}` (e.g. `{candidate_id}/{version_id}.pdf` or `{candidate_id}/{timestamp}.pdf`). No `resumes/` prefix in the object name.
- **Source of truth:** `resume_versions` table only — never list the bucket to build version lists.
- **Accuracy:** Fix upload path so first segment is always `candidate_id`; keep RLS as-is (candidate_id / user_id resolution in `can_caller_orgs_access_candidate_resume`).
- **Speed:** No listing; return versions from DB; add optional `storage_path` (or derive from URL) and generate **signed URLs** in API when returning versions so responses are fast and links work.
- **Optional later:** `list_objects(bucket_id, prefix, limit, offset)` RPC if you need admin/debug listing by `candidate_id` prefix.

---

## 2. Implementation Plan

### Phase A: Resumes bucket path and policy (accuracy + correctness)

**A1. Fix upload path (no `resumes/` prefix)**

- **File:** `src/app/api/candidates/upload-resume/route.ts`
- **Change:** Use object path `{candidateId}/${Date.now()}.${ext}` (not `resumes/${candidateId}/...`).
- **Reason:** RLS uses `(storage.foldername(name))[1]` = candidate_id; bucket is already `resumes`, so object name must be `candidateId/...`.

**A2. (Optional) Store storage path in resume_versions**

- **Files:** `supabase/schema/42_resume_versions.sql` (new migration), `src/app/api/candidates/[id]/resumes/route.ts`, `src/app/api/candidates/upload-resume/route.ts`.
- **Change:** Add column `storage_path text` (e.g. `{candidate_id}/{version_id}.{ext}`). On POST resume version and upload-resume, set `storage_path` when you know it (upload-resume knows path after upload; POST that creates from existing URL might leave null and keep `file_url` only).
- **Reason:** Enables generating signed URLs from path without parsing `file_url`; single source of truth for path.

**A3. Serve resume links via signed URLs (private bucket)**

- **Files:** `src/app/api/candidates/[id]/resumes/route.ts` (GET), optionally new route e.g. `src/app/api/candidates/[id]/resumes/[versionId]/signed-url/route.ts`.
- **Options:**
  - **Option A:** In GET `/api/candidates/[id]/resumes`, for each version with `storage_path`, call `supabase.storage.from('resumes').createSignedUrl(storage_path, 3600)` and return that in the payload instead of (or in addition to) `file_url`.
  - **Option B:** Add GET `/api/candidates/[id]/resumes/[versionId]/signed-url` that returns `{ url }`; frontend uses that for “View”/download.
- **Reason:** Bucket is private; `getPublicUrl` does not grant access; signed URLs are the correct way to serve files.

**A4. Drop legacy “own resume by user_id” policy if fully migrated**

- **File:** Migration or `supabase/schema/12_storage.sql` (and 74 if duplicated).
- **Context:** 12_storage has “Users can read own resume” with `(storage.foldername(name))[1] = auth.uid()::text`. If all resume paths are now `candidate_id/...`, candidate “own” access is already covered by “Candidates can read own resume by candidate id path” (74). Ensure no remaining objects use `user_id` as first segment; then drop the legacy policy to avoid confusion.

**A5. Backfill / migration for existing objects**

- **Risk:** Existing objects under `resumes/{candidateId}/...` have first segment `"resumes"`, so RLS will deny.
- **Options:**
  - **Move objects:** Script (service role): list objects with prefix `resumes/`, for each insert new object at `{candidate_id}/{filename}`, then delete old (or do in a migration job).
  - **Or:** Add a one-off RLS exception or policy that allows read when `(storage.foldername(name))[1] = 'resumes'` and second segment is accessible candidate_id (more complex).
- **Recommendation:** Prefer moving objects to `{candidate_id}/{unique}.{ext}` and then removing the `resumes/` prefix policy so one convention rules.

---

### Phase B: candidate-cvs bucket (optional, for tenant accuracy)

**B1. Align candidate-cvs paths with tenant RLS**

- **Current:** Paths like `cvs/{phone}_${ts}.pdf` or `cvs/public_...`; tenant policy expects first segment = candidate_id.
- **Options:**
  - **Option 1:** After creating/updating candidate in Scout and public-apply, **re-upload or copy** object to path `{candidate_id}/{original_filename_or_id}.pdf` (and update `candidates.resume_url` / cv_url to new path’s signed URL or path). Then restrict candidate-cvs RLS to first segment = candidate_id only.
  - **Option 2:** Keep current paths; add a **metadata table** e.g. `storage_cv_paths(object_id uuid, candidate_id uuid)` and change RLS to allow read if `object_id` is in that table and `candidate_id` is in `get_accessible_candidate_ids(auth_organisation_ids())`.
- **Recommendation:** Option 1 if you want simple RLS and one path convention across buckets; Option 2 if you want to avoid re-upload and can maintain the table.

---

### Phase C: Performance and hardening

**C1. Avoid listing in application code**

- **Check:** No `supabase.storage.from('resumes').list()` (or list with broad prefix) in app code. Versions must come from `resume_versions` only.
- **Action:** Confirm and document; add a short comment in resumes route that version list is from DB only.

**C2. Optional: list_objects RPC for admin**

- **File:** New migration adding function `list_objects(bucketid text, prefix text, limits int, offsets int)` as in [Supabase scaling docs](https://supabase.com/docs/guides/storage/production/scaling).
- **Use:** Admin/debug only; call with `prefix = candidate_id` to list that candidate’s files without full bucket scan.

**C3. Indexes for storage RLS**

- **File:** New migration.
- **Change:** If Supabase exposes indexes on `storage.objects`, ensure `(bucket_id, (storage.foldername(name))[1])` or similar is efficient; otherwise rely on SECURITY DEFINER and keep policies simple. (Exact index depends on Postgres/storage schema.)

---

## 3. Task Checklist (bite-sized)

| #   | Task                                                                          | Files                                                       | Notes                                                           |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | Fix upload path to `{candidateId}/{ts}.{ext}`                                 | `src/app/api/candidates/upload-resume/route.ts`             | Remove `resumes/` from path                                     |
| 2   | Add `storage_path` to `resume_versions` (migration + types)                   | New migration, `42_resume_versions.sql` (or new), API types | Nullable; set on upload                                         |
| 3   | Set `storage_path` in upload-resume after upload                              | `src/app/api/candidates/upload-resume/route.ts`             | Persist when creating/updating candidate resume_url and version |
| 4   | GET resumes: return signed URLs for versions with `storage_path`              | `src/app/api/candidates/[id]/resumes/route.ts`              | createSignedUrl(60 min)                                         |
| 5   | POST resume version: accept optional `storage_path` or derive from `file_url` | `src/app/api/candidates/[id]/resumes/route.ts`              | If frontend sends path                                          |
| 6   | (Optional) GET signed-url for single version                                  | New route `.../resumes/[versionId]/signed-url/route.ts`     | If you prefer on-demand URL                                     |
| 7   | Drop legacy “Users can read own resume” by auth.uid() if unused               | Migration / 12_storage, 74                                  | After path migration                                            |
| 8   | Migrate existing `resumes/...` objects to `{candidate_id}/...`                | One-off script or migration job                             | Service role; then delete old                                   |
| 9   | (Optional) candidate-cvs path or metadata table                               | Scout, public-apply, migration                              | Phase B                                                         |
| 10  | (Optional) list_objects RPC + indexes                                         | New migration                                               | Phase C                                                         |

---

## 4. Testing & Verification

- **Unit:** Upload-resume: assert stored object path is `{candidateId}/{something}.{ext}` (mock storage or integration with test bucket).
- **Integration:** GET `/api/candidates/[id]/resumes` as candidate and as recruiter; response includes valid signed URLs for versions with `storage_path`; opening URL returns file.
- **RLS:** As recruiter, attempt read of another org’s candidate resume object (by path) → 403. As candidate, read own by path → 200.
- **Backward compatibility:** Versions without `storage_path` (old rows): still return `file_url`; document that those may require signed URL endpoint or auth for private bucket.

---

## 5. Rollout Order

1. **Phase A1** (path fix) — new uploads correct.
2. **Phase A2 + A3** (storage_path + signed URLs) — new flow correct and fast.
3. **Phase A5** (migrate existing objects) — then A4 (drop legacy policy).
4. Phase B and C as needed.

---

## 7. Match quality: no full-table scan (2025-02-25)

When a job is posted, the system must **not** search 1M resumes. Implemented:

- **FitScore agent** uses **semantic search only**: for each job we call `findSimilarCandidates(jobId, SHORTLIST_PER_JOB, { intentMin: 40 })`, which runs the `match_candidates` RPC. That uses the **ivfflat index** on `candidates.profile_embedding` and returns at most ~150 candidates per job. We then run fit_score only on those pairs. No full candidate table scan.
- **Job embedding**: If the job has no `jd_embedding`, we call `embedJob(jobId)` before matching.
- **match_candidates** now accepts optional `intent_min` (e.g. 40) so we only consider candidates with sufficient intent; migration `20250225130000_match_candidates_intent_and_scale.sql`.
- **Single-candidate mode** (candidateId): still bounded — score that candidate against up to 20 open jobs.
- At very large scale (100k+ candidates), consider increasing the ivfflat `lists` parameter for the profile_embedding index (e.g. 500–1000); see migration comment.

---

## 8. Recruitment goals: cost, 90%+ match, speed, accuracy (2025-02-25)

Implemented so the recruitment tool stays **low-cost**, **high match quality**, **fast**, and **accurate**:

- **Cost**
  - **Similarity gate**: Only score pairs with similarity ≥ 0.6 (strong JD–resume match); fewer wasted Claude calls.
  - **match_threshold 0.6** in `findSimilarCandidates` so the DB returns only candidates above 0.6.
  - **Cap 80 fit-scores per job** (`MAX_SCORED_PER_JOB`) so we never run 150 LLM calls per job.
  - Shortlist from vector search remains 120; we only run the LLM on the top 80 by similarity.

- **90%+ matching (JD ↔ resume and vice versa)**
  - **Richer embeddings**: Candidate embedding text now includes `current_role`, `seniority_level` (aligned with JD title/seniority). Job embedding includes `seniority_level`, `role_function`, `skills_required`. Same vocabulary in both spaces → better semantic match.
  - **Higher bar**: 0.6 similarity threshold focuses on strong matches; recruiter shortlist is pre-filtered for relevance.

- **Speed**
  - **Parallel fit-score**: Up to 4 `computeFitScore` calls at a time (`FIT_SCORE_CONCURRENCY`) so wall-clock time drops.
  - Semantic search and caps keep total work bounded.

- **Accuracy**
  - **Score clamping**: All dimension scores and overall score clamped to 0–100; safe fallbacks when LLM JSON is missing or invalid.
  - `parsed?.dimensions ?? {}` and `raw(dims.xyz)` avoid runtime errors and keep scores in range.

---

## 9. Implemented (2025-02-25)

- **Migration** `20250225120000_resume_storage_path_and_signed_urls.sql`: added `storage_path` to `resume_versions`.
- **upload-resume**: path fixed to `{candidateId}/{timestamp}.{ext}`; creates `resume_version` with `storage_path`; returns `viewUrl` (signed, 1h) and `version`.
- **GET /api/candidates/[id]/resumes**: enriches each version with `view_url` (signed URL when path known).
- **POST /api/candidates/[id]/resumes**: accepts optional `storage_path`; returns `version` with `view_url`.
- **GET /api/candidates/[id]/resumes/[versionId]/signed-url**: on-demand signed URL (15 min) for View click.
- **Frontend**: candidate profile and recruit resumes use `view_url ?? file_url` for links; profile refetches version list after upload via `refreshKey`; form accepts both `resume` and `file` field names.
- **Types**: `ResumeVersion` includes `view_url`, `storage_path`, `created_at`, `file_size`, `label`.

---

## 6. References

- [Supabase Storage: Inefficient folder operations and hierarchical RLS](https://supabase.com/docs/guides/troubleshooting/supabase-storage-inefficient-folder-operations-and-hierarchical-rls-challenges-b05a4d)
- [Storage production scaling](https://supabase.com/docs/guides/storage/production/scaling)
- [Serving assets / signed URLs](https://supabase.com/docs/guides/storage/serving/downloads)
- Project: `supabase/migrations/20250225103200_tenant_security_storage_apps.sql`, `supabase/schema/12_storage.sql`, `74_tenant_security_storage_apps.sql`, `src/app/api/candidates/upload-resume/route.ts`, `src/app/api/candidates/[id]/resumes/route.ts`
