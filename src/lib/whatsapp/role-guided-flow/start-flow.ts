import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { ALERT_SUBSCRIPTION_MONTHS } from "../constants";
import { withSessionCAS } from "../sessions";
import { fetchCandidateMenuOpenJobs } from "../candidate-menu-jobs";
import { addMonths, buildRoleOptionsFromJobs, presentCategoryMenu } from "./helpers";

export async function startRoleGuidedFlow(
  phone: string,
  context: Record<string, unknown>,
  candidateId: string,
): Promise<void> {
  const supabase = createSupabaseAdmin();
  const list = await fetchCandidateMenuOpenJobs(supabase);

  if (list.length === 0) {
    await sendWhatsAppMessage(
      phone,
      "No open roles are posted right now. I saved your profile and will notify you when relevant roles open.",
    );
    await withSessionCAS(phone, () => ({
      state: "active_alerts",
      context: { ...context, candidate_id: candidateId },
      extras: { alerts_expires_at: addMonths(new Date(), ALERT_SUBSCRIPTION_MONTHS) },
    }));
    return;
  }

  const roleOptions = buildRoleOptionsFromJobs(list);

  if (roleOptions.length === 0) {
    await sendWhatsAppMessage(
      phone,
      "I could not categorize open roles yet. Please try again in a bit or send your CV again.",
    );
    await withSessionCAS(phone, () => ({
      state: "cv_requested",
      context: { ...context, candidate_id: candidateId },
    }));
    return;
  }

  await presentCategoryMenu(phone, context, candidateId, roleOptions);
}
