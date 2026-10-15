import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";

export interface MissingInfoResult {
  requested: boolean;
  missingFields: string[];
  reason?: string;
}

function humanizeField(field: string): string {
  return field
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function triggerMissingInfoAgent(candidateId: string): Promise<MissingInfoResult> {
  const supabase = createSupabaseAdmin();
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, phone, full_name, name, email, location, experience_years, current_role")
    .eq("id", candidateId)
    .single();

  if (!candidate?.phone) {
    return { requested: false, missingFields: [], reason: "no_candidate_phone" };
  }

  const required: Array<keyof typeof candidate> = [
    "email",
    "location",
    "experience_years",
    "current_role",
  ];
  const missingFields = required.filter((field) => {
    const value = candidate[field];
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim().length === 0;
    return false;
  });

  if (missingFields.length === 0) {
    return { requested: false, missingFields };
  }

  const firstName = (candidate.full_name ?? candidate.name ?? "there").split(" ")[0] ?? "there";
  const missingText = missingFields.map((field) => humanizeField(field)).join(", ");
  const message = `Hi ${firstName}, to improve your job matches please reply with your: ${missingText}.`;
  const sendResult = await sendWhatsAppMessage(candidate.phone, message);
  if (!sendResult.success) {
    return {
      requested: false,
      missingFields,
      reason: sendResult.error ?? "send_failed",
    };
  }

  return { requested: true, missingFields };
}
