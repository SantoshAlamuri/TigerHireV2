import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/api-helpers";
import { logger } from "@/lib/observability/logger";
import { verifyPostHirePulseLink } from "@/lib/analytics/post-hire-pulse-link";

/** Escape values interpolated into the HTML response (defence-in-depth). */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * GET /api/post-hire-pulse/respond
 * Handle post-hire pulse response from hiring manager via WhatsApp link.
 * Query params: pulseId (pipeline_candidate_id), day (30|60|90), response (excellent|good|average|poor|left)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const pulseId = searchParams.get("pulseId");
  const dayParam = searchParams.get("day");
  const sig = searchParams.get("sig");
  const response = searchParams.get("response") as
    | "excellent"
    | "good"
    | "average"
    | "poor"
    | "left"
    | null;

  if (!pulseId || !dayParam) {
    return jsonError("Missing pulseId or day parameter", 400);
  }

  const day = parseInt(dayParam, 10);
  if (![30, 60, 90].includes(day)) {
    return jsonError("Invalid day parameter. Must be 30, 60, or 90", 400);
  }

  // This endpoint is unauthenticated and writes attrition/performance data, so
  // the link MUST carry a valid HMAC over (pulseId, day). Without this, anyone
  // with a pipeline_candidate_id could forge responses across tenants. Fail closed.
  if (!sig || !verifyPostHirePulseLink(pulseId, day, sig)) {
    return jsonError("Invalid or missing link signature", 403);
  }

  const admin = createSupabaseAdmin();

  // Find the pulse record
  const { data: pulse } = await admin
    .from("post_hire_pulse_responses")
    .select("id, responded_at")
    .eq("pipeline_candidate_id", pulseId)
    .eq("check_in_day", day)
    .single();

  if (!pulse) {
    return jsonError("Pulse check-in not found", 404);
  }

  if (pulse.responded_at) {
    // Already responded - show thank you message
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Thank you</title></head>
        <body style="font-family: sans-serif; padding: 2rem; text-align: center;">
          <h1>Thank you!</h1>
          <p>Your response has already been recorded.</p>
        </body>
      </html>
    `,
      { headers: { "Content-Type": "text/html" } },
    );
  }

  // If no response param, show response form
  if (!response) {
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head><title>How is the hire performing?</title></head>
        <body style="font-family: sans-serif; padding: 2rem; max-width: 400px; margin: 0 auto;">
          <h1>How is the hire performing?</h1>
          <p style="color: #666;">${day} days after hiring</p>
          <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 2rem;">
            <a href="?pulseId=${esc(pulseId)}&day=${day}&sig=${esc(sig)}&response=excellent" style="padding: 1rem; background: #10b981; color: white; text-decoration: none; border-radius: 0.5rem; text-align: center;">Excellent</a>
            <a href="?pulseId=${esc(pulseId)}&day=${day}&sig=${esc(sig)}&response=good" style="padding: 1rem; background: #3b82f6; color: white; text-decoration: none; border-radius: 0.5rem; text-align: center;">Good</a>
            <a href="?pulseId=${esc(pulseId)}&day=${day}&sig=${esc(sig)}&response=average" style="padding: 1rem; background: #f59e0b; color: white; text-decoration: none; border-radius: 0.5rem; text-align: center;">Average</a>
            <a href="?pulseId=${esc(pulseId)}&day=${day}&sig=${esc(sig)}&response=poor" style="padding: 1rem; background: #ef4444; color: white; text-decoration: none; border-radius: 0.5rem; text-align: center;">Poor</a>
            <a href="?pulseId=${esc(pulseId)}&day=${day}&sig=${esc(sig)}&response=left" style="padding: 1rem; background: #6b7280; color: white; text-decoration: none; border-radius: 0.5rem; text-align: center;">Left the company</a>
          </div>
        </body>
      </html>
    `,
      { headers: { "Content-Type": "text/html" } },
    );
  }

  // Validate response
  const validResponses = ["excellent", "good", "average", "poor", "left"];
  if (!validResponses.includes(response)) {
    return jsonError("Invalid response. Must be one of: excellent, good, average, poor, left", 400);
  }

  // Update pulse record
  const { error } = await admin
    .from("post_hire_pulse_responses")
    .update({
      response,
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", pulse.id);

  if (error) {
    logger.error("Failed to update post-hire pulse response", {
      error: String(error),
      pulseId: pulse.id,
    });
    return jsonError("Failed to record response", 500);
  }

  logger.info("Post-hire pulse response recorded", { pulseId: pulse.id, day, response });

  // Show thank you page
  return new Response(
    `
    <!DOCTYPE html>
    <html>
      <head><title>Thank you</title></head>
      <body style="font-family: sans-serif; padding: 2rem; text-align: center;">
        <h1>Thank you!</h1>
        <p>Your response has been recorded.</p>
        <p style="color: #666; margin-top: 2rem;">This feedback helps us improve FitScore accuracy.</p>
      </body>
    </html>
  `,
    { headers: { "Content-Type": "text/html" } },
  );
}
