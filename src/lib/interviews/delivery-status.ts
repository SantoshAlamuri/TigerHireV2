export type DeliveryChannelKey = "candidate_email" | "interviewer_email" | "candidate_whatsapp";

export type DeliveryChannelStatus = null | "sent" | "failed" | "resent" | "not_applicable";

export interface SlotDeliveryFields {
  candidate_email_status: DeliveryChannelStatus;
  interviewer_email_status: DeliveryChannelStatus;
  candidate_whatsapp_status: DeliveryChannelStatus;
  last_delivery_attempt_at: string | null;
}

export function hasCriticalDeliveryFailure(fields: SlotDeliveryFields): boolean {
  return (
    fields.candidate_email_status === "failed" ||
    fields.interviewer_email_status === "failed" ||
    fields.candidate_whatsapp_status === "failed"
  );
}

export function listFailedChannelLabels(fields: SlotDeliveryFields): string[] {
  const labels: string[] = [];
  if (fields.candidate_email_status === "failed") labels.push("candidate email");
  if (fields.interviewer_email_status === "failed") labels.push("interviewer ICS email");
  if (fields.candidate_whatsapp_status === "failed") labels.push("candidate WhatsApp");
  return labels;
}

export function failedChannelsToRetry(fields: SlotDeliveryFields): DeliveryChannelKey[] {
  const keys: DeliveryChannelKey[] = [];
  if (fields.candidate_email_status === "failed") keys.push("candidate_email");
  if (fields.interviewer_email_status === "failed") keys.push("interviewer_email");
  if (fields.candidate_whatsapp_status === "failed") keys.push("candidate_whatsapp");
  return keys;
}

export function nextDeliveryStatus(
  previous: DeliveryChannelStatus,
  outcome: "sent" | "failed" | "not_applicable",
): DeliveryChannelStatus {
  if (outcome === "not_applicable") return "not_applicable";
  if (outcome === "failed") return "failed";
  if (previous === "failed") return "resent";
  return "sent";
}

export function deliveryFieldsFromRow(row: {
  candidate_email_status?: string | null;
  interviewer_email_status?: string | null;
  candidate_whatsapp_status?: string | null;
  last_delivery_attempt_at?: string | null;
}): SlotDeliveryFields {
  return {
    candidate_email_status: (row.candidate_email_status as DeliveryChannelStatus) ?? null,
    interviewer_email_status: (row.interviewer_email_status as DeliveryChannelStatus) ?? null,
    candidate_whatsapp_status: (row.candidate_whatsapp_status as DeliveryChannelStatus) ?? null,
    last_delivery_attempt_at: row.last_delivery_attempt_at ?? null,
  };
}
