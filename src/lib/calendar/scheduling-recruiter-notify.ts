import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyAssignedRecruiterForJob } from "@/lib/calendar/notify-assigned-recruiter";
import { formatDisplayDateTime } from "@/lib/locale/display";
import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

/** Notifications must never fail the scheduling mutation that triggered them. */
async function withAdminNotify(fn: (admin: SupabaseClient) => Promise<void>): Promise<void> {
  try {
    const admin = createSupabaseAdmin();
    await fn(admin);
  } catch (err) {
    logger.warn("Scheduling recruiter notify skipped", { error: String(err) });
  }
}

async function jobTitle(admin: SupabaseClient, jobId: string): Promise<string> {
  const { data } = await admin.from("jobs").select("title").eq("id", jobId).maybeSingle();
  return (data?.title as string) ?? "Role";
}

export async function notifyRecruiterSlotsPublished(
  admin: SupabaseClient,
  params: {
    jobId: string;
    slotCount: number;
    actorUserId?: string | null;
  },
): Promise<void> {
  const title = await jobTitle(admin, params.jobId);
  await notifyAssignedRecruiterForJob(admin, {
    jobId: params.jobId,
    kind: "slots_published",
    title: "Interview slots added",
    body: `${params.slotCount} new slot${params.slotCount === 1 ? "" : "s"} on ${title}. Share a self-schedule link or book a candidate.`,
    link: `/recruit/jobs/${params.jobId}/interviews`,
    actorUserId: params.actorUserId,
    metadata: { slotCount: String(params.slotCount) },
  });
}

export async function notifyRecruiterSelfScheduleLinkCreated(
  admin: SupabaseClient,
  params: {
    jobId: string;
    actorUserId?: string | null;
    candidateSpecific: boolean;
  },
): Promise<void> {
  const title = await jobTitle(admin, params.jobId);
  await notifyAssignedRecruiterForJob(admin, {
    jobId: params.jobId,
    kind: "self_schedule_link",
    title: "Self-schedule link created",
    body: params.candidateSpecific
      ? `A candidate-specific scheduling link was created for ${title}. Send it to the candidate and monitor booking.`
      : `A job-wide self-schedule link was created for ${title}. Send it to candidates with open slots.`,
    link: `/recruit/jobs/${params.jobId}/interviews`,
    actorUserId: params.actorUserId,
  });
}

export async function notifyRecruiterCandidateBooked(
  admin: SupabaseClient,
  params: {
    jobId: string;
    candidateName: string | null;
    scheduledAt: string;
    bookedVia: "recruiter" | "self_serve";
    actorUserId?: string | null;
  },
): Promise<void> {
  const title = await jobTitle(admin, params.jobId);
  const when = formatDisplayDateTime(params.scheduledAt);
  const who = params.candidateName?.trim() || "A candidate";
  const via = params.bookedVia === "self_serve" ? "via self-schedule link" : "by your team";
  await notifyAssignedRecruiterForJob(admin, {
    jobId: params.jobId,
    kind: "candidate_booked",
    title: "Interview booked",
    body: `${who} is scheduled for ${when} on ${title} (${via}). Review the pipeline and confirm invites were delivered.`,
    link: `/recruit/jobs/${params.jobId}/interviews`,
    actorUserId: params.actorUserId,
    metadata: { scheduledAt: params.scheduledAt, bookedVia: params.bookedVia },
  });
}

export async function notifyRecruiterInviteDeliveryFailed(
  admin: SupabaseClient,
  params: {
    jobId: string;
    candidateName: string | null;
    failedChannels: string[];
    actorUserId?: string | null;
  },
): Promise<void> {
  if (params.failedChannels.length === 0) return;
  const title = await jobTitle(admin, params.jobId);
  const who = params.candidateName?.trim() || "Candidate";
  await notifyAssignedRecruiterForJob(admin, {
    jobId: params.jobId,
    kind: "invite_delivery_failed",
    title: "Interview invites need attention",
    body: `${who}'s booking on ${title} — failed: ${params.failedChannels.join(", ")}. Resend from the Interviews tab.`,
    link: `/recruit/jobs/${params.jobId}/interviews`,
    actorUserId: params.actorUserId,
  });
}

export function safeNotifyRecruiterSlotsPublished(params: {
  jobId: string;
  slotCount: number;
  actorUserId?: string | null;
}): void {
  void withAdminNotify((admin) => notifyRecruiterSlotsPublished(admin, params));
}

export function safeNotifyRecruiterSelfScheduleLinkCreated(params: {
  jobId: string;
  actorUserId?: string | null;
  candidateSpecific: boolean;
}): void {
  void withAdminNotify((admin) => notifyRecruiterSelfScheduleLinkCreated(admin, params));
}

export function safeNotifyRecruiterCandidateBooked(params: {
  jobId: string;
  candidateName: string | null;
  scheduledAt: string;
  bookedVia: "recruiter" | "self_serve";
  actorUserId?: string | null;
}): void {
  void withAdminNotify((admin) => notifyRecruiterCandidateBooked(admin, params));
}

export function safeNotifyRecruiterInviteDeliveryFailed(params: {
  jobId: string;
  candidateName: string | null;
  failedChannels: string[];
  actorUserId?: string | null;
}): void {
  void withAdminNotify((admin) => notifyRecruiterInviteDeliveryFailed(admin, params));
}
