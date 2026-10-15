import type { IdealCandidateProfile, ScoringWeights } from "@/lib/fitscore/hybrid/types";
import { formatDimensionLabel } from "./dimension-labels";
import { parseYearsRange } from "./years-range";

export type JdBaseMismatchSeverity = "warning" | "error";

export type JdBaseMismatch = {
  id: string;
  severity: JdBaseMismatchSeverity;
  message: string;
  jdSnippet?: string;
  scoringSnippet?: string;
};

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ");
}

function extractJdYearHints(jobDescriptionText: string): { min?: number; max?: number } {
  const t = normalizeText(jobDescriptionText);
  const range = t.match(/(\d+)\s*[-–]\s*(\d+)\s*years?/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  return {};
}

function parseIdealYearsMax(yearsRange: string): number | null {
  const p = parseYearsRange(yearsRange);
  return p?.max ?? null;
}

function parseIdealYearsMin(yearsRange: string): number | null {
  const p = parseYearsRange(yearsRange);
  return p?.min ?? null;
}

function isSeniorIdealRange(yearsRange: string): boolean {
  const min = parseIdealYearsMin(yearsRange);
  return min != null && min >= 5;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Word-boundary keyword matcher: "rest" matches "REST APIs" but not
 * "interested" or "restaurant". Allows plural/verb suffixes so "api test"
 * still matches "API testing", and s/z spelling variants so "visualization"
 * matches "visualisation".
 */
function keywordRegex(keyword: string): RegExp {
  const pattern = escapeRegExp(keyword.toLowerCase()).replace(/[sz]/g, "[sz]");
  return new RegExp(`(?<![a-z0-9])${pattern}(?:s|es|ing|ed)?(?![a-z0-9])`, "i");
}

function skillMentionedInJd(jobText: string, skillKeywords: string[]): boolean {
  const t = normalizeText(jobText);
  return skillKeywords.some((k) => keywordRegex(k).test(t));
}

/** Short quote from the JD around the first keyword hit, for the review panel. */
function extractJdSnippet(jobText: string, keyword: string): string | null {
  const flat = jobText.replace(/\s+/g, " ");
  const m = flat.match(keywordRegex(keyword));
  if (!m || m.index == null) return null;
  const winStart = Math.max(0, m.index - 40);
  const winEnd = Math.min(flat.length, m.index + m[0].length + 40);
  let snippet = flat.slice(winStart, winEnd).trim();
  if (winStart > 0) snippet = `…${snippet.replace(/^\S*\s/, "")}`;
  if (winEnd < flat.length) snippet = `${snippet.replace(/\s\S*$/, "")}…`;
  return snippet;
}

const DIMENSION_JD_KEYWORDS: Record<string, string[]> = {
  test_automation: ["selenium", "playwright", "cypress", "automation framework", "test automation"],
  cicd_integration: ["ci/cd", "cicd", "jenkins", "github actions", "gitlab ci", "pipeline"],
  performance_testing: ["jmeter", "load test", "performance test", "gatling", "k6"],
  api_testing: ["api test", "postman", "rest", "soap"],
  tools: ["jira", "azure devops", "sql"],
};

/** Label-derived words too generic to prove a JD actually asks for the skill. */
const GENERIC_LABEL_WORDS = new Set([
  "years",
  "experience",
  "level",
  "skills",
  "knowledge",
  "tools",
  "practices",
  "management",
  "general",
  "other",
  "core",
  "design",
  "strategy",
  "testing",
  "integration",
]);

function keywordsForDimension(dimKey: string): string[] {
  const catalog = DIMENSION_JD_KEYWORDS[dimKey];
  if (catalog) return catalog;
  const phrase = dimKey.replace(/_/g, " ").toLowerCase();
  const words = phrase.split(" ").filter((w) => w.length >= 4 && !GENERIC_LABEL_WORDS.has(w));
  return [phrase, ...words];
}

function isPreferredInJd(jobText: string, topic: string): boolean {
  const t = normalizeText(jobText);
  const patterns = [
    new RegExp(`${topic}[^.]{0,80}(preferred|nice to have|nice-to-have|advantage|plus)`, "i"),
    new RegExp(`(preferred|nice to have|nice-to-have)[^.]{0,80}${topic}`, "i"),
  ];
  return patterns.some((p) => p.test(t));
}

function isEssentialInJd(jobText: string, topic: string): boolean {
  const t = normalizeText(jobText);
  return new RegExp(`(essential|required|must have|must-have)[^.]{0,120}${topic}`, "i").test(t);
}

export function detectJdBaseMismatches(input: {
  jobDescriptionText: string;
  jobTitle?: string;
  idealProfile: IdealCandidateProfile | null;
  weights: ScoringWeights;
  templateId?: string | null;
  templateWeights?: ScoringWeights | null;
}): JdBaseMismatch[] {
  const out: JdBaseMismatch[] = [];
  const jd = input.jobDescriptionText;
  const ideal = input.idealProfile;
  const jdYears = extractJdYearHints(jd);
  const idealRange = ideal?.years_range ?? "";

  if (jdYears.min != null && jdYears.max != null && idealRange) {
    const idealMin = parseIdealYearsMin(idealRange);
    const idealMax = parseIdealYearsMax(idealRange);
    if (idealMin != null && idealMax != null) {
      if (idealMin >= 5 && jdYears.max <= 4) {
        out.push({
          id: "years_senior_ideal_vs_junior_jd",
          severity: "error",
          message:
            "Years range in scoring looks senior, but the job description targets fewer years of experience.",
          jdSnippet: `${jdYears.min}-${jdYears.max} years in JD`,
          scoringSnippet: idealRange,
        });
      } else {
        if (idealMin < jdYears.min) {
          out.push({
            id: "years_ideal_min_below_jd",
            severity: "warning",
            message: `Scoring accepts candidates from ${idealMin} years, but the JD asks for at least ${jdYears.min}.`,
            jdSnippet: `${jdYears.min}-${jdYears.max} years in JD`,
            scoringSnippet: idealRange,
          });
        }
        if (idealMax > jdYears.max + 1) {
          out.push({
            id: "years_ideal_max_above_jd",
            severity: "warning",
            message: "Ideal profile years exceed what the job description states.",
            jdSnippet: `${jdYears.min}-${jdYears.max} years in JD`,
            scoringSnippet: idealRange,
          });
        }
      }
    }
  }

  const title = (input.jobTitle ?? "").toLowerCase();
  if (idealRange && isSeniorIdealRange(idealRange) && /\b(junior|associate|entry)\b/.test(title)) {
    out.push({
      id: "title_junior_vs_senior_ideal",
      severity: "error",
      message:
        "Job title suggests junior/associate level but ideal profile targets senior experience.",
      jdSnippet: input.jobTitle,
      scoringSnippet: idealRange,
    });
  }

  for (const mh of ideal?.must_haves ?? []) {
    const m = mh.toLowerCase();
    if (
      (m.includes("selenium") || m.includes("playwright") || m.includes("automation")) &&
      isPreferredInJd(jd, "automation")
    ) {
      out.push({
        id: `must_have_automation_preferred_${mh.slice(0, 24)}`,
        severity: "warning",
        message: "A must-have mentions automation, but the JD lists automation as preferred.",
        jdSnippet: "Automation: preferred / nice to have",
        scoringSnippet: mh,
      });
    }
  }

  for (const [dimKey, weight] of Object.entries(input.weights)) {
    if (weight <= 20) continue;
    const keywords = keywordsForDimension(dimKey);
    if (keywords.length === 0) continue;
    if (!skillMentionedInJd(jd, keywords)) {
      out.push({
        id: `weight_high_unmentioned_${dimKey}`,
        severity: "warning",
        message: `${formatDimensionLabel(dimKey)} has ${weight}% weight but the skill is not clearly mentioned in the job description.`,
        scoringSnippet: `${formatDimensionLabel(dimKey)}: ${weight}%`,
      });
    }
    if (
      dimKey === "test_automation" &&
      weight > 15 &&
      isPreferredInJd(jd, "automation") &&
      !isEssentialInJd(jd, "automation")
    ) {
      out.push({
        id: "automation_weight_vs_preferred_jd",
        severity: "warning",
        message: `test_automation is weighted at ${weight}% but the JD treats automation as preferred, not required.`,
        jdSnippet: "Automation: preferred",
        scoringSnippet: `test_automation: ${weight}%`,
      });
    }
  }

  if (input.templateId && input.templateWeights) {
    const tplAuto = input.templateWeights.test_automation ?? 0;
    const curAuto = input.weights.test_automation ?? 0;
    if (tplAuto >= 20 && curAuto <= 12 && isPreferredInJd(jd, "automation")) {
      out.push({
        id: "template_automation_vs_jd",
        severity: "warning",
        message: `Template ${input.templateId} suggests ${tplAuto}% test_automation; your JD says automation is preferred. Current weight: ${curAuto}%.`,
        jdSnippet: "Automation: preferred",
        scoringSnippet: `Template default: ${tplAuto}% → current: ${curAuto}%`,
      });
    }
  }

  return out;
}

const MAX_DIMENSION_ROWS = 6;

/**
 * Rows for the "Your JD says" vs "Scoring will use" review panel.
 * Built from the job's actual scoring dimensions (highest weight first),
 * quoting the JD where the skill is found. A dimension weighted above 20%
 * with no JD mention is marked not-ok, matching detectJdBaseMismatches.
 */
export function buildReviewRows(input: {
  jobDescriptionText: string;
  idealProfile: IdealCandidateProfile | null;
  weights: ScoringWeights;
}): Array<{
  jdLabel: string;
  scoringLabel: string;
  ok: boolean;
  mismatchId?: string;
}> {
  const jd = input.jobDescriptionText;
  const jdYears = extractJdYearHints(jd);
  const idealRange = input.idealProfile?.years_range ?? "—";
  const idealMin = parseIdealYearsMin(idealRange);
  const idealMax = parseIdealYearsMax(idealRange);

  const yearsOk =
    jdYears.min == null ||
    jdYears.max == null ||
    idealMin == null ||
    idealMax == null ||
    (idealMin >= jdYears.min && idealMax <= jdYears.max + 1);

  const rows: Array<{
    jdLabel: string;
    scoringLabel: string;
    ok: boolean;
    mismatchId?: string;
  }> = [
    {
      jdLabel:
        jdYears.min != null && jdYears.max != null
          ? `${jdYears.min}-${jdYears.max} years experience`
          : "Years (not explicit in JD)",
      scoringLabel: `years_range: ${idealRange}`,
      ok: yearsOk,
      mismatchId: yearsOk ? undefined : "years_ideal_min_below_jd",
    },
  ];

  const dimensionRows = Object.entries(input.weights)
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_DIMENSION_ROWS)
    .map(([dimKey, weight]) => {
      const label = formatDimensionLabel(dimKey);
      const snippet = keywordsForDimension(dimKey)
        .map((k) => extractJdSnippet(jd, k))
        .find((s): s is string => s != null);
      const mentioned = snippet != null;
      const ok = mentioned || weight <= 20;
      return {
        jdLabel: mentioned ? `${label}: “${snippet}”` : `${label}: not clearly stated in JD`,
        scoringLabel: `${dimKey}: ${weight}%`,
        ok,
        mismatchId: ok ? undefined : `weight_high_unmentioned_${dimKey}`,
      };
    });

  return [...rows, ...dimensionRows];
}
