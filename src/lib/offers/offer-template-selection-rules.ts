export type OfferTemplateSelectionRules = {
  roleTitleContains: string[];
  locations: string[];
  employmentTypes: string[];
  seniorityLevels: string[];
};

const EMPTY_RULES: OfferTemplateSelectionRules = {
  roleTitleContains: [],
  locations: [],
  employmentTypes: [],
  seniorityLevels: [],
};

function normalizeArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const raw of input) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

export function parseOfferTemplateSelectionRules(input: unknown): OfferTemplateSelectionRules {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ...EMPTY_RULES };
  const row = input as Record<string, unknown>;
  return {
    roleTitleContains: normalizeArray(row.roleTitleContains),
    locations: normalizeArray(row.locations),
    employmentTypes: normalizeArray(row.employmentTypes),
    seniorityLevels: normalizeArray(row.seniorityLevels),
  };
}

export function isMissingOfferTemplateSelectionRulesColumn(
  err: { message?: string } | null | undefined,
): boolean {
  const msg = String(err?.message ?? "").toLowerCase();
  return msg.includes("selection_rules") && msg.includes("offer_pdf_templates");
}

export function scoreTemplateSelectionRules(
  rulesInput: unknown,
  context: {
    roleTitle?: string | null;
    location?: string | null;
    employmentType?: string | null;
    seniorityLevel?: string | null;
  },
): number {
  const rules = parseOfferTemplateSelectionRules(rulesInput);

  const roleTitle = String(context.roleTitle ?? "")
    .trim()
    .toLowerCase();
  const location = String(context.location ?? "")
    .trim()
    .toLowerCase();
  const employmentType = String(context.employmentType ?? "")
    .trim()
    .toLowerCase();
  const seniorityLevel = String(context.seniorityLevel ?? "")
    .trim()
    .toLowerCase();

  let score = 0;
  let activeCriteria = 0;

  if (rules.roleTitleContains.length > 0) {
    activeCriteria += 1;
    const matched = rules.roleTitleContains.some((needle) =>
      roleTitle.includes(needle.trim().toLowerCase()),
    );
    if (!matched) return 0;
    score += 1;
  }

  if (rules.locations.length > 0) {
    activeCriteria += 1;
    const matched = rules.locations.some((needle) =>
      location.includes(needle.trim().toLowerCase()),
    );
    if (!matched) return 0;
    score += 1;
  }

  if (rules.employmentTypes.length > 0) {
    activeCriteria += 1;
    const matched = rules.employmentTypes.some(
      (needle) => employmentType === needle.trim().toLowerCase(),
    );
    if (!matched) return 0;
    score += 1;
  }

  if (rules.seniorityLevels.length > 0) {
    activeCriteria += 1;
    const matched = rules.seniorityLevels.some(
      (needle) => seniorityLevel === needle.trim().toLowerCase(),
    );
    if (!matched) return 0;
    score += 1;
  }

  if (activeCriteria === 0) return 0;
  return score;
}
