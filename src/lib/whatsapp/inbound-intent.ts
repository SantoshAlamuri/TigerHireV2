/**
 * Rules-based routing for first inbound text on session state `new`.
 * Keeps marketing / sales / waitlist messages out of the CV consent funnel (no LLM — fast, predictable).
 *
 * Distinctive phrases only — do not match bare "Hi TigerHire" (candidates use that too).
 * When you change `publicWhatsAppPrefill` copy on the site, update these literals to match.
 */
const MARKETING_SUBSTRINGS = [
  "from your contact page",
  "through the form on your website",
  "following up here for a quicker reply",
  "join the tigerhire waitlist as a company or recruiter",
  "join the tigerhire waitlist as a job seeker",
  "hear more about what you're building",
] as const;

const CANDIDATE_SIGNALS =
  /\b(apply|application|cv|resume|résumé|curriculum vitae|fitscore|fit score|job\s*seek|looking\s+for\s+(a\s+)?job|upload\s+(my\s+)?cv|send\s+(my\s+)?cv|need\s+(a\s+)?job)\b/i;

/** User explicitly switches from business thread to candidate flow */
const CANDIDATE_SWITCH = /^apply\s*$/i;

const EXTRA_MARKETING_PATTERNS: RegExp[] = [
  /\bbook\s+(a\s+)?demo\b/i,
  /\bschedule\s+(a\s+)?(call|demo)\b/i,
  /\b(partnership|press)\s+(inquiry|enquiry)?\b/i,
  /\benterprise\s+(sales|plan|pricing)?\b/i,
  /\b(pricing|billing|invoice)\b/i,
  /tigerhire\.io\/contact/i,
];

export function isCandidateIntentText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (CANDIDATE_SWITCH.test(t)) return true;
  return CANDIDATE_SIGNALS.test(t);
}

/**
 * True when the first message clearly looks like site/marketing contact (not a job seeker applying).
 */
export function isMarketingHandoffText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isCandidateIntentText(t)) return false;

  const lower = t.toLowerCase();
  for (const phrase of MARKETING_SUBSTRINGS) {
    if (lower.includes(phrase)) return true;
  }

  return EXTRA_MARKETING_PATTERNS.some((re) => re.test(t));
}

export const MARKETING_HANDOFF_REPLY =
  "Thanks — we've flagged this for our team. We typically reply on WhatsApp within about 4 business hours (Mon–Fri, 9am–7pm IST).\n\n" +
  "If you want to apply with your CV instead, reply APPLY and we'll send the next step.";

export const BUSINESS_INQUIRY_FOLLOWUP_REPLY =
  "Our team still has your message. For anything else, just reply here.\n\n" +
  "To start a job application (FitScore), reply APPLY.";
