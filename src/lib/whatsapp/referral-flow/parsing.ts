import { normalizeIndianPhone } from "../normalize-phone";
import { parseReferralText } from "../referral-handler";

const SELF_APPLY_PATTERN =
  /\b(i want to apply|i'?d like to apply|like to apply|applying for|my cv|my score|jobs for me|my application|my profile)\b/i;

const APPLY_ROLE_HINT = /\brole:\s*([^\n]+)/i;
const APPLY_COMPANY_HINT = /\bcompany:\s*([^\n]+)/i;

export const REFERRAL_KEYWORD_PATTERN =
  /\b(refer|referr|recommend|suggest someone|my friend|my colleague)\b/i;

const INDIAN_MOBILE_IN_TEXT = /(?:\+?91[\s-]?)?([6-9]\d{9})\b/;

const PHONE_FOR_JOB_PATTERN = /refer(?:ring)?\s+(.+?)\s+([6-9]\d{9})\s+for\s+(.+)$/i;

const REFERRAL_STATUS_OR_RESEND_PATTERN =
  /\b(haven'?t|hasn'?t|didn'?t|not)\s+(received|got|get)\b|\b(resend|send again|message yet|no message|didn'?t get)\b|\b(can you|could you|please)\s+(resend|send)\b|^(yes,?\s+)?(can you|please)\s+resend\b/i;

export function extractPhoneFromMessage(text: string): string | null {
  const match = (text ?? "").match(INDIAN_MOBILE_IN_TEXT);
  if (!match?.[1]) return null;
  return normalizeIndianPhone(match[1]);
}

/** Name from text that also contains a phone (e.g. "Sam 7674911055"). */
export function extractNameFromMessageIgnoringPhone(text: string): string | null {
  const cleaned = (text ?? "").trim();
  if (!cleaned) return null;
  const stripped = cleaned.replace(INDIAN_MOBILE_IN_TEXT, " ").replace(/\s+/g, " ").trim();
  if (!stripped) return null;
  return extractNameFromMessage(stripped);
}

export function extractNameFromMessage(text: string): string | null {
  const cleaned = (text ?? "").trim();
  if (!cleaned || cleaned.length > 80) return null;
  if (extractPhoneFromMessage(cleaned)) return null;
  if (looksLikeSelfApply(cleaned)) return null;
  if (REFERRAL_KEYWORD_PATTERN.test(cleaned) && cleaned.split(/\s+/).length > 4) return null;

  const withoutPrefix = cleaned
    .replace(/^refer(?:ring)?\s+/i, "")
    .replace(/\s+for\s+.+$/i, "")
    .trim();
  if (!withoutPrefix || withoutPrefix.length < 2) return null;
  if (/^\d+$/.test(withoutPrefix)) return null;
  if (isGenericReferralPlaceholderName(withoutPrefix)) return null;
  if (!isLikelyPersonName(withoutPrefix)) return null;
  return withoutPrefix
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function looksLikeSelfApply(text: string): boolean {
  return SELF_APPLY_PATTERN.test((text ?? "").trim());
}

/** Optional hints from site/WhatsApp prefill (e.g. "Role: QA Engineer"). */
export function parseApplyPrefillHints(text: string): {
  roleHint?: string;
  companyHint?: string;
} {
  const t = text ?? "";
  const roleHint = APPLY_ROLE_HINT.exec(t)?.[1]?.trim();
  const companyHint = APPLY_COMPANY_HINT.exec(t)?.[1]?.trim();
  return {
    ...(roleHint ? { roleHint } : {}),
    ...(companyHint ? { companyHint } : {}),
  };
}

export function parseReferralFastPath(
  text: string,
): { candidateName: string; roleCategory: string; location: string } | null {
  const cleaned = (text ?? "").trim();
  if (!cleaned) return null;

  const phoneJobMatch = cleaned.match(PHONE_FOR_JOB_PATTERN);
  if (phoneJobMatch) {
    return {
      candidateName: phoneJobMatch[1]?.trim() ?? "",
      roleCategory: phoneJobMatch[3]?.trim() ?? "",
      location: "",
    };
  }

  const legacy = parseReferralText(cleaned);
  if (legacy) return legacy;

  const dashParts = cleaned.split(/\s*[-–—]\s*/);
  if (/^refer(?:ring)?\s+/i.test(cleaned) && dashParts.length >= 3) {
    const namePart = dashParts[0].replace(/^refer(?:ring)?\s+/i, "").trim();
    const rolePart = dashParts[1]?.trim() ?? "";
    const locationPart = dashParts.slice(2).join(" - ").trim();
    if (namePart && rolePart) {
      return {
        candidateName: namePart,
        roleCategory: rolePart,
        location: locationPart,
      };
    }
  }

  return null;
}

/** Placeholder phrases from "refer a friend" — not a real candidate name. */
export function isGenericReferralPlaceholderName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return /^(a\s+)?(friend|colleague|someone|anyone|person)$/.test(n) || n === "my friend";
}

/** User is asking about delivery / resend — not providing a candidate name. */
export function looksLikeReferralStatusOrResendText(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (REFERRAL_STATUS_OR_RESEND_PATTERN.test(t)) return true;
  if (t.includes("?") && /\b(message|whatsapp|receive|got|sent)\b/i.test(t)) return true;
  return t.split(/\s+/).length > 5;
}

export function parseResendReferralPhone(text: string): string | null {
  const t = (text ?? "").trim();
  if (!/^resend\b/i.test(t)) return null;
  return extractPhoneFromMessage(t);
}

/** Short human name (1–4 words); rejects sentences and status complaints. */
export function isLikelyPersonName(name: string): boolean {
  const trimmed = (name ?? "").trim();
  if (!trimmed || trimmed.length < 2 || trimmed.length > 40) return false;
  if (isGenericReferralPlaceholderName(trimmed)) return false;
  if (looksLikeReferralStatusOrResendText(trimmed)) return false;
  const words = trimmed.split(/\s+/);
  if (words.length > 4) return false;
  return words.every((w) => /^[a-zA-Z][a-zA-Z'.-]*$/.test(w) && w.length <= 20);
}
