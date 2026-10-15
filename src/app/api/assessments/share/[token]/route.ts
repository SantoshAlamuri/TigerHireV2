import { NextRequest } from "next/server";
import { handleApiError, jsonError, jsonSuccess } from "@/lib/api-helpers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const admin = createSupabaseAdmin();
    const { data: assessment, error } = await admin
      .from("assessments")
      .select("id, title, instructions, type, status, deadline_at, submission_url, submission_text")
      .eq("share_token", token)
      .maybeSingle();
    if (error || !assessment) return jsonError("Assessment link not found", 404);

    if (
      new Date(assessment.deadline_at).getTime() < Date.now() &&
      assessment.status === "pending"
    ) {
      return jsonError("Assessment deadline has passed", 410);
    }

    return jsonSuccess({ assessment });
  } catch (err) {
    return handleApiError(err, "Failed to fetch assessment share", {
      route: "GET /api/assessments/share/[token]",
    });
  }
}
