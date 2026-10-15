import type { CandidateAcknowledgementChannel, CandidateAcknowledgementEventType } from "./types";

interface BuildAckDedupeKeyInput {
  applicationId?: string | null;
  candidateId: string;
  eventType: CandidateAcknowledgementEventType;
  channel: CandidateAcknowledgementChannel;
  templateVariant?: string | null;
  occurredAt?: Date;
}

function utcDateBucket(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 24h dedupe key for acknowledgement attempts.
 * Buckets by UTC day to collapse retry storms while preserving daily visibility.
 */
export function buildAckDedupeKey(input: BuildAckDedupeKeyInput): string {
  const bucket = utcDateBucket(input.occurredAt ?? new Date());
  const subject = input.applicationId?.trim() || input.candidateId.trim();
  const variant = input.templateVariant?.trim() || "default";
  return [subject, input.eventType, input.channel, variant, bucket].join(":");
}
