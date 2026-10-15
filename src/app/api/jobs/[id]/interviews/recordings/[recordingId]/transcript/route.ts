import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthContext, requireAuth, hasRole, jsonError, handleApiError } from "@/lib/api-helpers";
import { assertJobAccess } from "@/lib/job-access";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

/**
 * GET /api/jobs/[id]/interviews/recordings/[recordingId]/transcript
 *
 * Returns the notetaker transcript TEXT for a recording. `transcript_url` is a
 * private storage path (not a public URL), so it was shown as dead "Transcript
 * saved" text; this proxies the download behind an org + job-access check so the
 * people reviewing the interview can actually read what the AI drafted from.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; recordingId: string }> },
) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

    const { id: jobId, recordingId } = await params;
    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    // RLS on interview_recordings (server client) + the job scope above keep this
    // to the caller's org.
    const { data: recording } = await supabase
      .from("interview_recordings")
      .select("transcript_url")
      .eq("id", recordingId)
      .eq("job_id", jobId)
      .maybeSingle<{ transcript_url: string | null }>();
    if (!recording?.transcript_url) {
      return jsonError("No transcript is available for this recording.", 404);
    }

    const admin = createSupabaseAdmin();
    const { data: file, error } = await admin.storage
      .from("screening-audio")
      .download(recording.transcript_url);
    if (error || !file) {
      return jsonError("Transcript unavailable.", 404);
    }
    const text = (await file.text())?.trim() ?? "";
    return new Response(text || "The transcript is empty.", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    return handleApiError(err, "Failed to load transcript", {
      route: "GET /api/jobs/[id]/interviews/recordings/[recordingId]/transcript",
    });
  }
}
