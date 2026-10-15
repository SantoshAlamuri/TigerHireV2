import type { SupabaseClient } from "@supabase/supabase-js";
import { hasRole } from "@/lib/api-helpers";
import { ForbiddenError } from "./tenancy";
import { assertCandidateReachable } from "./candidate-scope";

type AuthContext = NonNullable<
  Awaited<ReturnType<typeof import("@/lib/api-helpers").getAuthContext>>
>;

/** Thrown when the candidate resource does not exist (industry-standard 404). */
export class NotFoundError extends Error {
  constructor(message = "Candidate not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Verifies the current user can access a candidate's resume versions.
 * - Candidates: only their own (candidate.user_id === ctx.userId)
 * - Recruiters: must have unlocked the candidate or have fit_score access
 * - super_admin: full access
 * @throws NotFoundError when the candidate does not exist (caller should return 404)
 */
export async function assertCanAccessCandidateResumes(
  supabase: SupabaseClient,
  ctx: AuthContext,
  candidateId: string,
): Promise<void> {
  const { data: candidate } = await supabase
    .from("candidates")
    .select("user_id")
    .eq("id", candidateId)
    .single();

  if (!candidate) throw new NotFoundError("Candidate not found");

  if (hasRole(ctx, "candidate_pro", "candidate_free")) {
    if (candidate.user_id !== ctx.userId) {
      throw new ForbiddenError("You can only access your own resumes");
    }
    return;
  }

  if (hasRole(ctx, "super_admin")) return;

  if (hasRole(ctx, "leadership", "recruiter", "agency", "hiring_manager") && ctx.organisationId) {
    // Shared resolver: a resume is at least as sensitive as the profile it
    // belongs to, so this must not be a wider door than the candidate route.
    // It used to be — hiring managers landed here with org-level reach.
    await assertCandidateReachable(supabase, ctx, candidateId);
    return;
  }

  throw new ForbiddenError("You do not have access to this candidate's resumes");
}

export { ForbiddenError };
