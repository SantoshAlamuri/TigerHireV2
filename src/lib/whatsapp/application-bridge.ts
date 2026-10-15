import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendScreeningQuestionsTemplate, sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { ApplicationService } from "@/lib/services/ApplicationService";
import { ApplicationApplyError } from "@/lib/applications/application-apply-error";
import { withSessionCAS } from "./sessions";
import { TOP_MATCHES_LIMIT, FITSCORE_MIN_THRESHOLD } from "./constants";

/**
 * When a candidate in "scored" state replies 1/2/3 via WhatsApp,
 * create an application for the corresponding FitScore match.
 */
export async function createApplicationFromWhatsApp(
  phone: string,
  choice: number,
  context: Record<string, unknown>,
): Promise<void> {
  const supabase = createSupabaseAdmin();
  const normalizedPhone = phone.replace(/[^0-9]/g, "");

  const candidateId = context.candidate_id as string | undefined;
  if (!candidateId) {
    await sendWhatsAppMessage(
      phone,
      "We couldn't find your profile. Please send your CV again to get started.",
    );
    await withSessionCAS(phone, () => ({ state: "cv_requested", context: {} }));
    return;
  }

  const { data: topMatches } = await supabase
    .from("fit_scores")
    .select(
      `
      id,
      overall_score,
      job_id,
      jobs (
        id,
        title,
        status,
        organisations!jobs_organisation_id_fkey ( name )
      )
    `,
    )
    .eq("candidate_id", candidateId)
    .or("is_test_run.eq.false,is_test_run.is.null")
    .gte("overall_score", FITSCORE_MIN_THRESHOLD)
    .order("overall_score", { ascending: false })
    .limit(TOP_MATCHES_LIMIT);

  if (!topMatches?.length) {
    await sendWhatsAppMessage(
      phone,
      "No matching roles available right now. We'll notify you when new roles come in.",
    );
    await withSessionCAS(normalizedPhone, () => ({ state: "complete", context }));
    return;
  }

  const index = choice - 1;
  if (index >= topMatches.length) {
    await sendWhatsAppMessage(
      phone,
      `We only found ${topMatches.length} match(es). Reply a number from 1 to ${topMatches.length}.`,
    );
    return;
  }

  const match = topMatches[index];
  const jobRow = Array.isArray(match.jobs) ? match.jobs[0] : match.jobs;
  const job = jobRow as {
    id?: string;
    title?: string;
    status?: string;
    organisations?: { name?: string } | { name?: string }[];
  } | null;
  const jobId = match.job_id ?? job?.id;
  const orgs = job?.organisations;
  const orgRow = Array.isArray(orgs) ? orgs[0] : orgs;
  const companyName = orgRow?.name ?? "the company";
  const jobTitle = job?.title ?? "the role";

  if (!jobId) {
    await sendWhatsAppMessage(
      phone,
      "Sorry, that role is no longer available. Send a new CV to see fresh matches.",
    );
    return;
  }

  if (job?.status !== "open") {
    await sendWhatsAppMessage(
      phone,
      `Sorry, *${jobTitle}* at ${companyName} is no longer accepting applications. Try another number or send a new CV.`,
    );
    return;
  }

  const { data: screeningQ } = await supabase
    .from("job_screening_questions")
    .select("id")
    .eq("job_id", jobId)
    .eq("is_active", true)
    .limit(1);
  if (screeningQ && screeningQ.length > 0) {
    const { data: jobEx } = await supabase
      .from("jobs")
      .select("organisation_id")
      .eq("id", jobId)
      .maybeSingle();
    const orgId = (jobEx as { organisation_id: string } | null)?.organisation_id;
    const { data: orgRow } = orgId
      ? await supabase.from("organisations").select("slug").eq("id", orgId).maybeSingle()
      : { data: null as { slug: string } | null };
    const slug = (orgRow as { slug: string } | null)?.slug;
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://tigerhire.io").replace(/\/$/, "");
    const applyLink = slug
      ? `${base}/apply/${encodeURIComponent(slug)}?job=${encodeURIComponent(jobId)}`
      : `${base}/apply?job=${encodeURIComponent(jobId)}`;
    const { data: cRow } = await supabase
      .from("candidates")
      .select("name, full_name")
      .eq("id", candidateId)
      .maybeSingle();
    const { data: appForScreen } = await supabase
      .from("applications")
      .select("id")
      .eq("candidate_id", candidateId)
      .eq("job_id", jobId)
      .maybeSingle();
    const first = (cRow?.name ?? cRow?.full_name ?? "Candidate").trim().split(/\s+/)[0] || "there";
    await sendScreeningQuestionsTemplate({
      phone,
      candidateFirstName: first,
      jobTitle,
      screeningUrl: applyLink,
      applicationId: (appForScreen as { id: string } | null)?.id,
    });
    return;
  }

  try {
    const directReferrerId =
      (context.direct_referrer_id as string | undefined) ??
      (context.referrer_referrers_id as string | undefined);
    const parentReferrerId = context.parent_referrer_id as string | undefined;
    await ApplicationService.create(supabase, candidateId, {
      jobId,
      fitScoreId: match.id as string,
      interest: "interested",
      source: "whatsapp",
      directReferrerId,
      parentReferrerId,
    });
  } catch (e) {
    if (e instanceof ApplicationApplyError) {
      if (e.code === "already_applied") {
        await sendWhatsAppMessage(
          phone,
          `You've already expressed interest in *${jobTitle}* at ${companyName}. The recruiter can see your application. We'll update you on any progress!`,
        );
        await withSessionCAS(normalizedPhone, () => ({ state: "complete", context }));
        return;
      }
      if (e.code === "cooling_off") {
        await sendWhatsAppMessage(
          phone,
          `Applications to *${companyName}* are paused for now. You can try again after ${e.retryAfterIso ? new Date(e.retryAfterIso).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }) : "the cooling-off period ends"}.`,
        );
        await withSessionCAS(normalizedPhone, () => ({ state: "complete", context }));
        return;
      }
      if (e.code === "hired") {
        await sendWhatsAppMessage(
          phone,
          `You're already marked as hired for *${jobTitle}* at ${companyName}.`,
        );
        await withSessionCAS(normalizedPhone, () => ({ state: "complete", context }));
        return;
      }
    }
    logger.error("Application bridge create failed", { error: String(e) });
    await sendWhatsAppMessage(
      phone,
      "Something went wrong submitting your interest. Please try again.",
    );
    return;
  }

  await sendWhatsAppMessage(
    phone,
    `Your interest in *${jobTitle}* at ${companyName} (FitScore ${match.overall_score}/100) has been sent to the recruiter.\n\nWe'll message you when there's an update. Reply another number to express interest in more roles.`,
  );

  await withSessionCAS(normalizedPhone, () => ({ state: "complete", context }));
}
