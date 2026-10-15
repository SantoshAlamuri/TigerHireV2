/**
 * Typed template registry for Meta WhatsApp Cloud API (launch plan P2).
 * Map logical keys to template names and required body parameter keys.
 * Actual template names in Meta WhatsApp Manager must match `templateName` for each key.
 */
export const WA_TEMPLATES = {
  application_received: {
    name: "application_received",
    language: "en" as const,
    paramKeys: ["candidate_first_name", "job_title", "company_name"] as const,
  },
  /** Meta `template.name` defaults to this; set `WHATSAPP_SCREENING_TEMPLATE_NAME` for a different WABA name. */
  screening_questions: {
    name: "screening_questions",
    language: "en" as const,
    paramKeys: ["candidate_first_name", "job_title", "screening_url"] as const,
  },
  interview_invite: {
    name: "interview_invite",
    language: "en" as const,
    paramKeys: ["candidate_first_name", "job_title", "schedule_url"] as const,
  },
  offer_ready: {
    name: "offer_ready",
    language: "en" as const,
    paramKeys: ["candidate_first_name", "company_name", "offer_url"] as const,
  },
  rejection: {
    name: "rejection",
    language: "en" as const,
    paramKeys: ["candidate_first_name", "job_title"] as const,
  },
} as const;

export type WaTemplateKey = keyof typeof WA_TEMPLATES;

export function buildTemplateBodyParams(
  key: WaTemplateKey,
  params: Record<string, string>,
): string[] {
  const def = WA_TEMPLATES[key];
  const out: string[] = [];
  for (const k of def.paramKeys) {
    const v = params[k];
    if (v == null || String(v).trim() === "") {
      throw new Error(`Missing WA template param "${k}" for template "${key}"`);
    }
    out.push(String(v).trim());
  }
  return out;
}
