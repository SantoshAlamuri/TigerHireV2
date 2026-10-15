/**
 * Rubric weights as people see them: whole numbers that add up to 100.
 *
 * The scoring engine stores weights already normalised to 100, but older rows
 * can hold fractions that sum to 1, so both shapes are read and written back in
 * the shape they came in.
 */

export interface DisplayWeights {
  values: Record<string, number>;
  /** Multiply stored weights by this to show them; divide to store them. */
  scale: number;
}

export function toDisplayWeights(raw: Record<string, number>): DisplayWeights {
  const entries = Object.entries(raw).filter(([, v]) => Number.isFinite(v) && v >= 0);
  const sum = entries.reduce((a, [, v]) => a + v, 0);
  const scale = sum > 0 && sum <= 1.5 ? 100 : 1;
  return {
    scale,
    values: Object.fromEntries(entries.map(([k, v]) => [k, Math.round(v * scale)])),
  };
}

export function fromDisplayWeights(
  shown: Record<string, number>,
  scale: number,
): Record<string, number> {
  return Object.fromEntries(Object.entries(shown).map(([k, v]) => [k, v / scale]));
}

export function weightTotal(shown: Record<string, number>): number {
  return Object.values(shown).reduce((a, v) => a + v, 0);
}

const WORDS: Record<string, string> = {
  devops: "DevOps",
  cicd: "CI/CD",
  ci: "CI",
  cd: "CD",
  api: "API",
  apis: "APIs",
  sql: "SQL",
  ml: "ML",
  ai: "AI",
  ui: "UI",
  ux: "UX",
  qa: "QA",
  aws: "AWS",
  gcp: "GCP",
};

/** "devops_cicd" → "DevOps CI/CD"; "yearsExperienceLevel" → "Years experience level". */
export function rubricLabel(key: string): string {
  const words = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  return words
    .map((w, i) => WORDS[w] ?? (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}
