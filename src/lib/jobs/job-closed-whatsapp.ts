import { sendTemplateMessage, sendWhatsAppMessage } from "@/lib/services/whatsapp";

export async function sendCandidateClosedWhatsApp(params: {
  phone: string;
  firstName: string;
  jobTitle: string;
  companyName: string;
  referralLine: string;
}) {
  const template = await sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_role_closed",
    bodyParams: [params.firstName, params.jobTitle, params.companyName],
  });
  if (template.success) return template;
  return sendWhatsAppMessage(
    params.phone,
    `Hi ${params.firstName}, ${params.jobTitle} at ${params.companyName} is now closed and is no longer accepting applications. You do not need to apply again for this role.${params.referralLine}\n\nNext step: reply MATCHES to check other roles, or send an updated CV any time to refresh your profile.`,
  );
}

export async function sendReferrerClosedWhatsApp(params: {
  phone: string;
  firstName: string;
  jobTitle: string;
  companyName: string;
}) {
  const template = await sendTemplateMessage({
    phoneNumber: params.phone,
    templateName: "th_referral_role_closed",
    bodyParams: [params.firstName, params.jobTitle, params.companyName],
  });
  if (template.success) return template;
  return sendWhatsAppMessage(
    params.phone,
    `Hi ${params.firstName}, ${params.jobTitle} at ${params.companyName} is now closed. Your referral links for this role are no longer active for new applications.\n\nNext step: reply REFER when you want to refer someone for another open role.`,
  );
}
