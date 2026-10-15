import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { jsonError, jsonSuccess, handleApiError } from "@/lib/api-helpers";
import { createNotification } from "@/lib/services/notifications";
import { logger } from "@/lib/observability/logger";
import { validateCronSecret } from "@/lib/security/cron-auth";

function getHoursRemaining(deadlineAt: string): number {
  return (new Date(deadlineAt).getTime() - Date.now()) / (1000 * 60 * 60);
}

export async function POST(request: NextRequest) {
  try {
    if (!(await validateCronSecret(request))) return jsonError("Unauthorized", 401);

    const admin = createSupabaseAdmin();
    const { data: assessments, error } = await admin
      .from("assessments")
      .select("id, title, deadline_at, application_id, applications(candidate_id)")
      .eq("status", "pending");
    if (error) return jsonError("Failed to load assessments", 500);

    let reminderCount = 0;
    for (const assessment of assessments ?? []) {
      const hoursLeft = getHoursRemaining(assessment.deadline_at as string);
      const send24hr = hoursLeft <= 24 && hoursLeft > 23;
      const send50pct = hoursLeft <= 48 && hoursLeft > 47;
      if (!send24hr && !send50pct) continue;

      const application = assessment.applications as { candidate_id?: string } | null;
      if (!application?.candidate_id) continue;
      const { data: candidate } = await admin
        .from("candidates")
        .select("user_id")
        .eq("id", application.candidate_id)
        .single();
      if (!candidate?.user_id) continue;

      const ok = await createNotification({
        userId: candidate.user_id as string,
        type: "application_update",
        title: "Assessment reminder",
        body: send24hr
          ? `${assessment.title} is due in 24 hours.`
          : `${assessment.title} is halfway to deadline.`,
        link: "/candidate/applications",
        metadata: { assessmentId: assessment.id as string },
      });
      if (!ok) {
        logger.warn("createNotification failed", {
          route: "POST /api/cron/assessment-reminders",
          userId: candidate.user_id,
        });
      }
      reminderCount++;
    }

    return jsonSuccess({ ok: true, remindersSent: reminderCount });
  } catch (err) {
    return handleApiError(err, "Failed to send assessment reminders", {
      route: "POST /api/cron/assessment-reminders",
    });
  }
}

export { POST as GET };
