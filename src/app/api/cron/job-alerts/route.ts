import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/services/resend";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { logger } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report-error";
import { savedSearchJobAlertHtml } from "@/lib/services/email-templates";

/**
 * POST /api/cron/job-alerts
 * Runs daily. Sends email digests for saved searches with alert_enabled=true.
 * Auth: CRON_SECRET or CRON_SECRET_HASH (SHA-256 hex) in Bearer header.
 */
export async function POST(request: NextRequest) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const now = new Date();

  const { data: searches, error } = await supabase
    .from("saved_searches")
    .select("*, profiles!inner(id, full_name)")
    .eq("alert_enabled", true)
    .in("alert_frequency", ["daily", "weekly"]);

  if (error) {
    logger.error("Failed to fetch saved searches for alerts", {
      error: String(error),
    });
    reportError(error, { route: "POST /api/cron/job-alerts" });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;

  for (const search of searches ?? []) {
    const freq = search.alert_frequency;
    const lastAlerted = search.last_alerted_at ? new Date(search.last_alerted_at) : null;

    if (freq === "weekly" && lastAlerted) {
      const daysSince = (now.getTime() - lastAlerted.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 6.5) {
        skipped++;
        continue;
      }
    }

    if (freq === "daily" && lastAlerted) {
      const hoursSince = (now.getTime() - lastAlerted.getTime()) / (1000 * 60 * 60);
      if (hoursSince < 20) {
        skipped++;
        continue;
      }
    }

    const filters = search.filters as Record<string, unknown>;
    let jobQuery = supabase
      .from("jobs")
      .select(
        "id, title, organisation_id, organisations!jobs_organisation_id_fkey(name), location, remote_allowed, created_at",
      )
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(10);

    if (lastAlerted) {
      jobQuery = jobQuery.gte("created_at", lastAlerted.toISOString());
    }

    if (filters.role_function) {
      jobQuery = jobQuery.eq("role_function", filters.role_function as string);
    }
    if (filters.seniority) {
      jobQuery = jobQuery.eq("seniority_level", filters.seniority as string);
    }
    if (filters.location) {
      jobQuery = jobQuery.ilike("location", `%${filters.location}%`);
    }
    if (filters.remote === true) {
      jobQuery = jobQuery.eq("remote_allowed", true);
    }

    const { data: jobs, error: jobsErr } = await jobQuery;

    if (jobsErr) {
      // A failing filter must not silently read as "no matches" forever.
      logger.error("Job alerts cron: job query failed", {
        searchId: search.id,
        error: jobsErr.message,
      });
      skipped++;
      continue;
    }

    if (!jobs || jobs.length === 0) {
      skipped++;
      continue;
    }

    const {
      data: { user },
    } = await supabase.auth.admin.getUserById(search.user_id);
    if (!user?.email) {
      skipped++;
      continue;
    }

    const profile = search.profiles as { full_name?: string } | null;
    const name = profile?.full_name ?? user.email.split("@")[0];

    const jobRows = jobs.map((j) => {
      const org = j.organisations as { name?: string } | null;
      return {
        title: (j.title as string) ?? "Role",
        company: org?.name ?? "Company",
        location: (j.location as string) ?? "Remote",
        remoteOk: Boolean(j.remote_allowed),
      };
    });

    try {
      await sendEmail({
        to: user.email,
        subject: `${jobs.length} new job${jobs.length > 1 ? "s" : ""} matching "${search.name}" on TigerHire`,
        html: savedSearchJobAlertHtml({
          name,
          searchName: search.name as string,
          jobCount: jobs.length,
          jobs: jobRows,
        }),
      });

      const { error: stampErr } = await supabase
        .from("saved_searches")
        .update({ last_alerted_at: now.toISOString() })
        .eq("id", search.id);
      if (stampErr) {
        // If the dedupe stamp fails, the next run re-sends the same alert.
        logger.error("Job alerts cron: last_alerted_at stamp failed — may duplicate", {
          searchId: search.id,
          error: stampErr.message,
        });
      }

      sent++;
    } catch (emailErr) {
      logger.warn("Failed to send job alert email", {
        searchId: search.id,
        error: String(emailErr),
      });
    }
  }

  return NextResponse.json({
    sent,
    skipped,
    total: (searches ?? []).length,
  });
}

export { POST as GET };
