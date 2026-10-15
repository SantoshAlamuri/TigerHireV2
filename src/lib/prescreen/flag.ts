import { isOrgWhatsappScreeningEnabled } from "@/lib/screening/org-whatsapp-screening";

/**
 * Prescreen gate follows the customer org's Settings → Screening → Default mode.
 * When set to WhatsApp, new applications receive prescreen questions before scoring.
 */
export async function isPrescreenGateEnabled(organisationId?: string | null): Promise<boolean> {
  if (!organisationId) return false;
  return isOrgWhatsappScreeningEnabled(organisationId);
}
