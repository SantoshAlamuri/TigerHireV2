import type { SupabaseClient } from "@supabase/supabase-js";
import type { CandidateAcknowledgementChannel, CandidateAcknowledgementEventType } from "./types";

export const ACK_DEDUP_WINDOW_HOURS = 24;

export function ackWindowStartIso(
  now: Date = new Date(),
  windowHours: number = ACK_DEDUP_WINDOW_HOURS,
): string {
  const ms = now.getTime() - windowHours * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

export function isWithinDedupWindow(
  previousSentAt: Date,
  now: Date = new Date(),
  windowHours: number = ACK_DEDUP_WINDOW_HOURS,
): boolean {
  return now.getTime() - previousSentAt.getTime() < windowHours * 60 * 60 * 1000;
}

interface HasSentAttemptWithinWindowInput {
  supabase: SupabaseClient;
  applicationId?: string | null;
  candidateId: string;
  eventType: CandidateAcknowledgementEventType;
  channel: CandidateAcknowledgementChannel;
  templateVariant?: string | null;
  now?: Date;
  windowHours?: number;
}

export async function hasSentAttemptWithinWindow(
  input: HasSentAttemptWithinWindowInput,
): Promise<boolean> {
  const windowStart = ackWindowStartIso(input.now, input.windowHours);
  let query = input.supabase
    .from("candidate_acknowledgement_attempts")
    .select("id")
    .eq("event_type", input.eventType)
    .eq("channel", input.channel)
    .eq("outcome", "sent")
    .gte("created_at", windowStart)
    .limit(1);

  if (input.templateVariant?.trim()) {
    query = query.eq("template_variant", input.templateVariant.trim());
  }

  if (input.applicationId?.trim()) {
    query = query.eq("application_id", input.applicationId.trim());
  } else {
    query = query.eq("candidate_id", input.candidateId.trim()).is("application_id", null);
  }

  const { data } = await query;
  return (data ?? []).length > 0;
}
