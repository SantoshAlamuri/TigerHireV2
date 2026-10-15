import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { ReferralCollectField, ReferralDraft } from "./types";

export function readDraft(context: Record<string, unknown>): ReferralDraft {
  const raw = context.referral_draft;
  if (!raw || typeof raw !== "object") {
    return {
      candidate_name: null,
      candidate_phone: null,
      candidate_cv_media_id: null,
      job_id: null,
      location: null,
    };
  }
  const d = raw as Record<string, unknown>;
  return {
    candidate_name: typeof d.candidate_name === "string" ? d.candidate_name : null,
    candidate_phone: typeof d.candidate_phone === "string" ? d.candidate_phone : null,
    candidate_cv_media_id:
      typeof d.candidate_cv_media_id === "string" ? d.candidate_cv_media_id : null,
    job_id: typeof d.job_id === "string" ? d.job_id : null,
    location: typeof d.location === "string" ? d.location : null,
  };
}

export function draftContext(
  draft: ReferralDraft,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  return { referral_draft: draft, ...extras };
}

export async function listOpenJobsForOrg(
  organisationId: string | null,
): Promise<Array<{ id: string; title: string; location: string | null }>> {
  const supabase = createSupabaseAdmin();
  let query = supabase
    .from("jobs")
    .select("id, title, location, organisation_id")
    .eq("status", "open")
    .order("updated_at", { ascending: false })
    .limit(15);

  if (organisationId) {
    query = query.eq("organisation_id", organisationId);
  }

  const { data, error } = await query;
  if (error) {
    logger.warn("referral-flow: open jobs query failed", { error: error.message });
    return [];
  }
  return (data ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title ?? "Open role"),
    location: (row.location as string | null) ?? null,
  }));
}

export function formatJobList(
  jobs: Array<{ id: string; title: string; location: string | null }>,
): string {
  return jobs
    .map((j, i) => {
      const loc = j.location?.trim();
      return `${i + 1}. ${j.title}${loc ? ` — ${loc}` : ""}`;
    })
    .join("\n");
}

export function nextMissingField(
  draft: ReferralDraft,
  openJobCount: number,
): ReferralCollectField | null {
  if (!draft.candidate_name?.trim()) return "candidate_name";
  if (!draft.candidate_phone?.trim()) return "candidate_phone";
  if (openJobCount > 0 && !draft.job_id?.trim()) return "job_id";
  return null;
}
