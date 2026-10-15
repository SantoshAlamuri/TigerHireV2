import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { sendWhatsAppMessage, sendInterviewReminderTemplate } from "@/lib/services/whatsapp";
import { formatDisplayDateTime } from "@/lib/locale/display";

/**
 * POST /api/cron/reminders
 * Runs every 30 min. Sends WhatsApp reminder for interviews in the next 60 minutes.
 * Auth: CRON_SECRET or CRON_SECRET_HASH (SHA-256 hex) in Bearer header.
 */
export async function POST(request: NextRequest) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const now = new Date();
  const in60 = new Date(now.getTime() + 60 * 60 * 1000);

  const { data: rows } = await supabase
    .from("pipeline_candidates")
    .select(
      "id, candidate_id, job_id, interview_scheduled_at, reminder_sent_at, candidates(phone, full_name, name)",
    )
    .not("interview_scheduled_at", "is", null)
    .is("reminder_sent_at", null)
    .gte("interview_scheduled_at", now.toISOString())
    .lte("interview_scheduled_at", in60.toISOString());

  let sent = 0;
  const reminderSentAt = now.toISOString();
  for (const row of rows ?? []) {
    const candidate = row.candidates as {
      phone?: string;
      full_name?: string;
      name?: string;
    } | null;
    const phone = candidate?.phone;
    if (!phone) continue;
    const name = (candidate?.full_name ?? candidate?.name)?.split(" ")[0] ?? "there";
    const timeStr = formatDisplayDateTime(row.interview_scheduled_at as string);

    const { data: jobRow } = await supabase
      .from("jobs")
      .select("title")
      .eq("id", row.job_id)
      .single();
    const jobTitle = jobRow?.title ?? "your role";

    try {
      await sendInterviewReminderTemplate({
        phone,
        candidateName: name,
        jobTitle,
        interviewTime: timeStr,
      });
    } catch {
      await sendWhatsAppMessage(
        phone,
        `Reminder: Your interview for ${jobTitle} is at ${timeStr}. Good luck, ${name}!`,
      );
    }

    await supabase
      .from("pipeline_candidates")
      .update({ reminder_sent_at: reminderSentAt })
      .eq("id", row.id);
    sent++;
  }

  return NextResponse.json({ sent, total: rows?.length ?? 0 });
}

export { POST as GET };
