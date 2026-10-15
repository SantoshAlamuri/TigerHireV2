import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createNotificationBatch } from "@/lib/services/notifications";
import { logger } from "@/lib/observability/logger";
import { sendJobClosedCandidateNotice, sendJobClosedReferrerNotice } from "@/lib/services/resend";
import {
  sendCandidateClosedWhatsApp,
  sendReferrerClosedWhatsApp,
} from "@/lib/jobs/job-closed-whatsapp";

type CandidateAppRow = {
  id: string;
  source: string | null;
  direct_referrer_id: string | null;
  parent_referrer_id: string | null;
  referral_link_id: string | null;
  candidate_id: string;
  candidates:
    | {
        user_id: string | null;
        email: string | null;
        full_name: string | null;
        name: string | null;
        phone: string | null;
      }
    | {
        user_id: string | null;
        email: string | null;
        full_name: string | null;
        name: string | null;
        phone: string | null;
      }[]
    | null;
};

type ReferrerLinkRow = {
  referrer_id: string;
  referrers:
    | {
        user_id: string | null;
        work_email: string | null;
        name: string | null;
        whatsapp_number: string | null;
      }
    | {
        user_id: string | null;
        work_email: string | null;
        name: string | null;
        whatsapp_number: string | null;
      }[]
    | null;
};

function unwrapOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function displayName(name: string | null | undefined, fallback: string): string {
  const n = (name ?? "").trim();
  return n.length > 0 ? n : fallback;
}

/**
 * Notify all relevant stakeholders when a job is closed.
 * - Candidates with applications for this role (in-app + email when available)
 * - Referrers who created referral links for this role (in-app + email when available)
 */
export async function notifyJobClosedStakeholders(jobId: string): Promise<void> {
  const admin = createSupabaseAdmin();

  const { data: jobRow, error: jobErr } = await admin
    .from("jobs")
    .select("id, title, organisations!jobs_organisation_id_fkey(name)")
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr || !jobRow) {
    logger.warn("notifyJobClosedStakeholders: job lookup failed", {
      jobId,
      message: jobErr?.message,
    });
    return;
  }

  const jobTitle = ((jobRow as { title?: string }).title ?? "this role").trim() || "this role";
  const orgRaw = (jobRow as { organisations?: { name?: string } | { name?: string }[] | null })
    .organisations;
  const organisation = unwrapOne(orgRaw);
  const companyName = (organisation?.name ?? "the company").trim() || "the company";

  const { data: appRows, error: appsErr } = await admin
    .from("applications")
    .select(
      "id, source, direct_referrer_id, parent_referrer_id, referral_link_id, candidate_id, candidates(user_id, email, full_name, name, phone)",
    )
    .eq("job_id", jobId);

  if (appsErr) {
    logger.warn("notifyJobClosedStakeholders: applications lookup failed", {
      jobId,
      message: appsErr.message,
    });
  }

  const candidatesByUser = new Map<string, { email: string | null; name: string }>();
  const candidateWhatsAppByPhone = new Map<
    string,
    { phone: string; name: string; wasReferred: boolean }
  >();
  for (const row of (appRows ?? []) as CandidateAppRow[]) {
    const candidate = unwrapOne(row.candidates);
    const userId = candidate?.user_id ?? null;
    const name = displayName(candidate?.full_name ?? candidate?.name ?? null, "there");
    if (userId && !candidatesByUser.has(userId)) {
      candidatesByUser.set(userId, {
        email: candidate?.email ?? null,
        name,
      });
    }
    const phone = candidate?.phone?.trim();
    if (phone && !candidateWhatsAppByPhone.has(phone)) {
      candidateWhatsAppByPhone.set(phone, {
        phone,
        name,
        wasReferred: Boolean(
          row.direct_referrer_id ||
          row.parent_referrer_id ||
          row.referral_link_id ||
          row.source === "referral",
        ),
      });
    }
  }

  await createNotificationBatch([...candidatesByUser.keys()], {
    type: "application_update",
    title: "Job closed",
    body: `${jobTitle} at ${companyName} is now closed and no longer accepting applications.`,
    link: "/candidate/applications",
    metadata: { jobId },
  });

  for (const candidate of candidatesByUser.values()) {
    if (!candidate.email) continue;
    sendJobClosedCandidateNotice({
      candidateEmail: candidate.email,
      candidateName: candidate.name,
      jobTitle,
      companyName,
    }).catch((err) =>
      logger.warn("notifyJobClosedStakeholders: candidate close email failed", {
        jobId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  for (const candidate of candidateWhatsAppByPhone.values()) {
    const first = candidate.name.split(/\s+/)[0] || "there";
    const referralLine = candidate.wasReferred
      ? "\n\nYour referral remains attached to your profile, so future matching still keeps that context."
      : "";
    const result = await sendCandidateClosedWhatsApp({
      phone: candidate.phone,
      firstName: first,
      jobTitle,
      companyName,
      referralLine,
    });
    if (!result.success) {
      logger.warn("notifyJobClosedStakeholders: candidate close WhatsApp failed", {
        jobId,
        error: result.error,
      });
    }
  }

  const { data: linkRows, error: linksErr } = await admin
    .from("referral_links")
    .select("referrer_id, referrers(user_id, work_email, name, whatsapp_number)")
    .eq("job_id", jobId);

  if (linksErr) {
    logger.warn("notifyJobClosedStakeholders: referral links lookup failed", {
      jobId,
      message: linksErr.message,
    });
  }

  const referrersByUser = new Map<string, { email: string | null; name: string }>();
  const referrerWhatsAppByPhone = new Map<string, { phone: string; name: string }>();
  for (const row of (linkRows ?? []) as ReferrerLinkRow[]) {
    const referrer = unwrapOne(row.referrers);
    const userId = referrer?.user_id ?? null;
    const name = displayName(referrer?.name ?? null, "there");
    if (userId && !referrersByUser.has(userId)) {
      referrersByUser.set(userId, {
        email: referrer?.work_email ?? null,
        name,
      });
    }
    const phone = referrer?.whatsapp_number?.trim();
    if (phone && !referrerWhatsAppByPhone.has(phone)) {
      referrerWhatsAppByPhone.set(phone, { phone, name });
    }
  }

  await createNotificationBatch([...referrersByUser.keys()], {
    type: "general",
    title: "Referral role closed",
    body: `${jobTitle} at ${companyName} is closed. Your existing referral links for this role are no longer active for new applications.`,
    link: "/dashboard/referrer",
    metadata: { jobId },
  });

  for (const referrer of referrersByUser.values()) {
    if (!referrer.email) continue;
    sendJobClosedReferrerNotice({
      referrerEmail: referrer.email,
      referrerName: referrer.name,
      jobTitle,
      companyName,
    }).catch((err) =>
      logger.warn("notifyJobClosedStakeholders: referrer close email failed", {
        jobId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  for (const referrer of referrerWhatsAppByPhone.values()) {
    const first = referrer.name.split(/\s+/)[0] || "there";
    const result = await sendReferrerClosedWhatsApp({
      phone: referrer.phone,
      firstName: first,
      jobTitle,
      companyName,
    });
    if (!result.success) {
      logger.warn("notifyJobClosedStakeholders: referrer close WhatsApp failed", {
        jobId,
        error: result.error,
      });
    }
  }
}
