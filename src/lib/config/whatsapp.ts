/**
 * WhatsApp bot phone number (E.164 without '+').
 * Change this single constant to update all wa.me links site-wide.
 */
export const WHATSAPP_BOT_PHONE = "919880444688";

/** Direct chat link */
export const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_BOT_PHONE}`;

/** Pre-filled message for candidate CV drop */
export const WHATSAPP_CV_DROP_LINK = `https://wa.me/${WHATSAPP_BOT_PHONE}?text=${encodeURIComponent("Hi, I'd like to drop my CV for job matching.")}`;

/** QR code URL using the Google Charts API (200x200) */
export const WHATSAPP_QR_URL = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(WHATSAPP_LINK)}`;
