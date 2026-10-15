/**
 * Stages that require an interviewer assignment when `env.ffInterviewerIdentityV1` is on.
 *
 * **Definition:** `stage_type === "interview"` only (matches `pipeline_stage_type` enum).
 * We intentionally do **not** infer from `stage_name` (e.g. "Tech round", "HM call"): that
 * weakly matched names containing "interview" but still missed typed stages like "Final Round"
 * until `stage_type` was `interview`. Set `stage_type` to `interview` for any round that needs an
 * interviewer slot or identity — the pipeline UI uses the same rule for the interviewer block.
 *
 * To audit naming vs typing in a database, run:
 * SELECT stage_type, stage_name, COUNT(*) FROM pipeline_stages GROUP BY 1, 2 ORDER BY 3 DESC;
 */
export function isInterviewLikeStage(stageType: string | null | undefined): boolean {
  return String(stageType ?? "").toLowerCase() === "interview";
}

/** Internal profile link OR external email + display name. */
export function hasInterviewerAssignment(input: {
  interviewer_user_id?: string | null;
  interviewer_email?: string | null;
  interviewer_name?: string | null;
}): boolean {
  const uid = (input.interviewer_user_id ?? "").trim();
  if (uid.length > 0) return true;
  const email = (input.interviewer_email ?? "").trim();
  const name = (input.interviewer_name ?? "").trim();
  return email.length > 0 && name.length > 0;
}
