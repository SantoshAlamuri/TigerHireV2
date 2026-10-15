import type { IndiaJdTemplate } from "@/lib/fitscore/hybrid/jd-india-templates";
import type { ScoringWeights } from "@/lib/fitscore/hybrid/types";

const ACRONYM_LABELS: Record<string, string> = {
  api: "API",
  cicd: "CI/CD",
  ci: "CI",
  cd: "CD",
  qa: "QA",
  ui: "UI",
  ux: "UX",
  sql: "SQL",
  aws: "AWS",
  gcp: "GCP",
  iac: "IaC",
  devops: "DevOps",
  hr: "HR",
  b2b: "B2B",
  b2c: "B2C",
  roi: "ROI",
  kpi: "KPI",
  sla: "SLA",
};

/** Human-readable dimension label for tryout UI. */
export function formatDimensionLabel(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map(
      (part) => ACRONYM_LABELS[part.toLowerCase()] ?? part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(" ");
}

const DIMENSION_SIGNAL_HINTS: Record<string, string[]> = {
  test_automation: ["selenium", "playwright", "cypress", "automation", "framework"],
  test_strategy: ["strategy", "plan", "coverage", "regression", "test plan"],
  api_testing: ["api", "postman", "rest", "graphql", "contract"],
  performance_testing: ["jmeter", "load", "performance", "stress", "latency"],
  cicd_integration: ["ci/cd", "pipeline", "jenkins", "github actions", "deployment"],
  programming: ["java", "python", "javascript", "typescript", "coding"],
  tools: ["tool", "framework", "platform", "stack"],
  years_exp: ["experience", "years", "seniority"],
};

function pickSignalsForDimension(key: string, signals: string[]): string[] {
  const hints = DIMENSION_SIGNAL_HINTS[key] ?? [key.replace(/_/g, " ")];
  const lower = signals.map((s) => s.toLowerCase());
  const matched = lower.filter((s) => hints.some((h) => s.includes(h) || h.includes(s)));
  const unique = [...new Set(matched.length ? matched : hints.slice(0, 2))];
  return unique.slice(0, 3).map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}

const GENERIC_BENCHMARK =
  /demonstrates strong evidence in .+ through relevant projects and measurable outcomes/i;

/** Build recruiter-friendly dimension descriptions from India template signals. */
export function dimensionDescriptionsFromTemplate(
  template: IndiaJdTemplate,
  weights: ScoringWeights,
): Record<string, string> {
  const signals = template.signals
    .split(/[,;/]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return Object.fromEntries(
    Object.keys(weights).map((key) => {
      const label = formatDimensionLabel(key);
      const picks = pickSignalsForDimension(key, signals);
      const hint =
        picks.length > 0
          ? `Look for evidence such as ${picks.join(", ")}.`
          : `Evidence tied to ${label.toLowerCase()} requirements in the JD.`;
      return [
        key,
        `${label} — ${hint} Strong scores reflect depth, ownership, and outcomes relevant to ${template.roleTitle}.`,
      ];
    }),
  );
}

export function mergeDimensionDescriptions(
  weights: ScoringWeights,
  templateDescriptions: Record<string, string>,
  icpBenchmarks: Record<string, string> | undefined,
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const key of Object.keys(weights)) {
    const fromIcp = icpBenchmarks?.[key]?.trim();
    const fromTemplate = templateDescriptions[key]?.trim();
    if (fromIcp && !GENERIC_BENCHMARK.test(fromIcp)) {
      merged[key] = fromIcp;
    } else if (fromTemplate) {
      merged[key] = fromTemplate;
    } else if (fromIcp) {
      merged[key] = fromIcp;
    } else {
      merged[key] =
        `${formatDimensionLabel(key)} — scored from CV evidence against this role's requirements.`;
    }
  }
  return merged;
}
