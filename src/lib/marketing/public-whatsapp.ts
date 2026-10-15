/**
 * wa.me link for the public WhatsApp Business line (marketing footer, contact, waitlist).
 *
 * Override with `NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER` (E.164 with or without +). This is the
 * customer-facing number (wa.me), not the BSP/API phone number id.
 *
 * Optional `prefillText` becomes the `text` query param so the user opens chat with a clear
 * starter message (better handoff and closure than an empty thread).
 */
const DEFAULT_PUBLIC_WHATSAPP_E164 = "919880444688";

/** Starter lines for wa.me — keep concise; user can edit before sending. */
export const publicWhatsAppPrefill = {
  footer: "Hi TigerHire — I'd like to hear more about what you're building.",
  contact: "Hi TigerHire — I'm reaching out from your contact page.\n\n",
  contactAfterForm:
    "Hi TigerHire — I just sent a message through the form on your website. Following up here for a quicker reply.\n\n",
  waitlistCompany: "Hi — I'd like to join the TigerHire waitlist as a company or recruiter.",
  waitlistCandidate: "Hi — I'd like to join the TigerHire waitlist as a job seeker.",
  candidateApply:
    "Hi TigerHire — I'd like to apply. I'll share my CV here and check my fit against open roles.",
} as const;

export function getPublicWhatsAppChatUrl(prefillText?: string): string {
  const raw =
    process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER?.trim() ?? DEFAULT_PUBLIC_WHATSAPP_E164;
  const digits = raw.replace(/\D/g, "");
  const base =
    digits.length < 10
      ? `https://wa.me/${DEFAULT_PUBLIC_WHATSAPP_E164}`
      : `https://wa.me/${digits}`;
  const trimmed = prefillText?.trim();
  if (!trimmed) return base;
  return `${base}?text=${encodeURIComponent(trimmed)}`;
}
