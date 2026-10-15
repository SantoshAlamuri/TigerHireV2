export type OfferTemplateVariables = {
  company_name: string;
  candidate_name: string;
  role_title: string;
  start_date: string;
  compensation: string;
  /** Multi-line breakdown from the in-app CTC calculator (optional). */
  compensation_breakdown: string;
  /** Human-readable CTC in LPA + INR when applicable (optional). */
  ctc_lpa: string;
  notes: string;
  generated_date: string;
};

function escapeRegExpKey(key: string): string {
  return key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace {{key}} placeholders (simple, no nested logic).
 * Optional `custom` maps org-defined keys (snake_case) after built-ins.
 */
export function interpolateOfferTemplate(
  body: string,
  vars: OfferTemplateVariables,
  custom?: Record<string, string>,
): string {
  let out = body;
  (Object.entries(vars) as [keyof OfferTemplateVariables, string][]).forEach(([key, value]) => {
    const token = new RegExp(`\\{\\{\\s*${escapeRegExpKey(key)}\\s*\\}\\}`, "gi");
    out = out.replace(token, value);
  });
  if (custom) {
    for (const [key, value] of Object.entries(custom)) {
      if (!/^[a-z][a-z0-9_]{0,62}$/.test(key)) continue;
      const token = new RegExp(`\\{\\{\\s*${escapeRegExpKey(key)}\\s*\\}\\}`, "gi");
      out = out.replace(token, value);
    }
  }
  return out;
}
