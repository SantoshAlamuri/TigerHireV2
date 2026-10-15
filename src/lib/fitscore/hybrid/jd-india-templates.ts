/**
 * 121-role JD template library (from TigerHire_JD_Templates_All_India.xlsx v2.0).
 * Each template stores its own dimension names + weights (no mapping needed).
 * Match posted JD text → template weights + context; no LLM.
 */

import indiaData from "./data/jd-templates-all-india.json";
import type { ScoringWeights, FitThresholds } from "./types";
import { normalizeWeightsTo100 } from "./templates";

export interface IndiaJdTemplate {
  id: string;
  category: string;
  roleTitle: string;
  weights: ScoringWeights;
  signals: string;
  redFlags?: string;
  scoreFloor: number;
  fitThresholds: FitThresholds;
  /** Expanded keywords for matching (computed at load time). */
  keywords: string[];
}

function expandKeywords(roleTitle: string, category: string, signals: string): string[] {
  const set = new Set<string>();

  const titleLower = roleTitle.toLowerCase().replace(/[()]/g, " ");
  const titleTokens = titleLower.split(/[^a-z0-9]+/).filter((x) => x.length >= 3);
  for (const t of titleTokens) set.add(t);
  for (let i = 0; i < titleTokens.length - 1; i++) {
    set.add(`${titleTokens[i]} ${titleTokens[i + 1]}`);
  }

  const catTokens = category
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((x) => x.length >= 3);
  for (const t of catTokens) set.add(t);

  if (signals) {
    const sigTokens = signals
      .toLowerCase()
      .split(/[,;/]+/)
      .map((s) => s.trim());
    for (const s of sigTokens) {
      if (s.length >= 3) set.add(s);
      const words = s.split(/\s+/).filter((w) => w.length >= 3);
      for (const w of words) set.add(w);
    }
  }

  return [...set];
}

interface RawTemplate {
  id: string;
  category: string;
  role_title: string;
  weights: Record<string, number>;
  signals?: string;
  red_flags?: string;
  score_floor?: number;
  fit_thresholds?: { strong: number; good: number; moderate: number; weak: number };
}

function loadTemplates(): IndiaJdTemplate[] {
  const raw = indiaData as unknown as { templates: RawTemplate[] };
  return (raw.templates ?? []).map((t) => ({
    id: t.id,
    category: t.category,
    roleTitle: t.role_title,
    weights: normalizeWeightsTo100(t.weights),
    signals: t.signals ?? "",
    redFlags: t.red_flags,
    scoreFloor: t.score_floor ?? 15,
    fitThresholds: t.fit_thresholds ?? { strong: 78, good: 60, moderate: 40, weak: 25 },
    keywords: expandKeywords(t.role_title, t.category, t.signals ?? ""),
  }));
}

let cached: IndiaJdTemplate[] | null = null;

export function getIndiaJdTemplates(): IndiaJdTemplate[] {
  if (!cached) cached = loadTemplates();
  return cached;
}

export function getIndiaJdTemplateById(id: string): IndiaJdTemplate | undefined {
  return getIndiaJdTemplates().find((t) => t.id === id);
}

const MIN_TEMPLATE_SCORE = 2;

function escapeRegexChars(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match a library keyword against JD text. Single-token keywords use word boundaries
 * so "sales" does not match inside "salesforce" / "Salesforce Service Cloud" (support roles).
 * Multi-word phrases keep substring match (discriminative phrases from templates).
 */
export function keywordMatchesJd(jdLower: string, kw: string): boolean {
  const trimmed = kw.trim().toLowerCase();
  if (trimmed.length < 2) return false;
  if (trimmed.includes(" ")) {
    return jdLower.includes(trimmed);
  }
  return new RegExp(`\\b${escapeRegexChars(trimmed)}\\b`, "i").test(jdLower);
}

const SALES_BD_CATEGORY = "Sales & Business Development";

/** First line is usually the job title in ensureJdBaseForJob (`title` + body). */
function titleLineSignalsSupportRole(jdText: string): boolean {
  const first = jdText.split(/\r?\n/)[0]?.toLowerCase().trim() ?? "";
  if (!first) return false;
  return /\bsupport\b/.test(first) || /\bhelp\s*desk\b/.test(first) || /\bhelpdesk\b/.test(first);
}

/** When the job title is support-shaped, prefer ops/support templates over CS/sales-adjacent ones. */
function supportTitleTemplateAffinity(t: IndiaJdTemplate): number {
  const rt = t.roleTitle.toLowerCase();
  if (/\b(bpo|call\s+center|helpdesk|help\s*desk|service\s+desk)\b/.test(rt)) return 2;
  if (t.category === "Operations & Customer Success" && /\bteam\s+lead\b/.test(rt)) return 1;
  return 0;
}

/** First line is usually the job title in ensureJdBaseForJob (`title` + body). */
function titleLineSignalsBusinessAnalystRole(jdText: string): boolean {
  const first = jdText.split(/\r?\n/)[0]?.toLowerCase().trim() ?? "";
  if (!first) return false;
  return (
    /\bbusiness\s+analyst\b/.test(first) ||
    /\b(product|marketing|financial)\s+analyst\b/.test(first)
  );
}

/**
 * Business-analyst titles often mention pipelines/SQL in the JD body, which wrongly boosts
 * Data Engineer. Prefer analyst-family presets when the title line is analyst-shaped.
 */
function businessAnalystTemplateAffinity(t: IndiaJdTemplate): number {
  const rt = t.roleTitle.toLowerCase();
  if (rt.includes("product analyst")) return 4;
  if (rt.includes("marketing analyst")) return 3;
  if (rt.includes("financial analyst")) return 2;
  if (/\bdata engineer\b/.test(rt) || t.id === "india-005") return -8;
  return 0;
}

/** How many significant words from the template role title appear as whole words in the JD (tie-breaker). */
function roleTitleWordHits(jdLower: string, roleTitle: string): number {
  const tokens = roleTitleTokens(roleTitle);
  let hits = 0;
  for (const w of tokens) {
    if (new RegExp(`\\b${escapeRegexChars(w)}\\b`, "i").test(jdLower)) hits++;
  }
  return hits;
}

function roleTitleTokens(roleTitle: string): string[] {
  return roleTitle
    .toLowerCase()
    .replace(/[()/]/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
}

/**
 * Seniority/level words that appear across many role titles and carry no
 * role-family information on their own ("Lead Business Analyst" must not give
 * title evidence for "BPO / Call Center Team Lead" just because both say lead).
 */
const GENERIC_ROLE_TITLE_TOKENS = new Set([
  "lead",
  "leader",
  "senior",
  "junior",
  "head",
  "chief",
  "executive",
  "associate",
  "assistant",
  "specialist",
  "officer",
  "staff",
  "team",
  "manager",
]);

/**
 * Role-family words shared across many templates ("Analyst", "Engineer", …).
 * They count as title evidence, but on their own they are too weak: a
 * "Lead Business Analyst" title must not pull in "Cybersecurity Analyst".
 */
const ROLE_FAMILY_TITLE_TOKENS = new Set([
  "analyst",
  "engineer",
  "developer",
  "consultant",
  "architect",
  "coordinator",
]);

/** People-leadership markers used to keep leadership templates off IC job titles. */
const LEADERSHIP_TITLE_RE = /\b(lead|leader|head|director|chief|cto|coo|ceo|cxo|vp|president)\b/i;

/** First line of the JD blob — callers pass `${job.title}\n${body}` (or buildJdText, whose first line is `Title: …`). */
function jobTitleLine(jdLower: string): string {
  return jdLower.split(/\r?\n/)[0]?.trim() ?? "";
}

/**
 * Title-to-title evidence: at least one distinctive (non-generic) token from the
 * template's role title must appear as a whole word in the JOB TITLE line — not
 * just anywhere in the JD blob. Prevents body-keyword-only false positives.
 */
function hasTitleToTitleEvidence(
  titleLine: string,
  jdLower: string,
  template: IndiaJdTemplate,
): boolean {
  if (!titleLine) return false;
  const tokens = roleTitleTokens(template.roleTitle);
  const distinctive = tokens.filter((w) => !GENERIC_ROLE_TITLE_TOKENS.has(w));
  const candidates = distinctive.length > 0 ? distinctive : tokens;
  const hits = candidates.filter((w) =>
    new RegExp(`\\b${escapeRegexChars(w)}\\b`, "i").test(titleLine),
  );
  if (hits.length === 0) return false;
  // Evidence made up solely of role-family words ("Analyst") needs the template's
  // domain word (e.g. "cybersecurity") somewhere in the JD to count.
  if (hits.every((w) => ROLE_FAMILY_TITLE_TOKENS.has(w))) {
    const domainTokens = distinctive.filter((w) => !ROLE_FAMILY_TITLE_TOKENS.has(w));
    if (domainTokens.length > 0) {
      return domainTokens.some((w) =>
        new RegExp(`\\b${escapeRegexChars(w)}\\b`, "i").test(jdLower),
      );
    }
  }
  return true;
}

/**
 * A leadership-flavoured template (e.g. "Talent Acquisition Lead") must not match a
 * job whose title carries no leadership marker (e.g. "Talent Acquisition Executive"):
 * leadership rubrics carry red flags like "no team management" that would hit every IC.
 */
function leadershipTemplateOnIcTitle(titleLine: string, template: IndiaJdTemplate): boolean {
  return LEADERSHIP_TITLE_RE.test(template.roleTitle) && !LEADERSHIP_TITLE_RE.test(titleLine);
}

export function findBestIndiaTemplate(
  jdText: string,
): { template: IndiaJdTemplate; score: number } | null {
  const lower = jdText.toLowerCase();
  const titleLine = jobTitleLine(lower);
  const supportShaped = titleLineSignalsSupportRole(jdText);
  const baShaped = titleLineSignalsBusinessAnalystRole(jdText);
  const templates = getIndiaJdTemplates();
  let best: IndiaJdTemplate | null = null;
  let bestScore = 0;
  let bestTitleHits = 0;

  for (const t of templates) {
    // Support- and analyst-shaped titles keep their dedicated affinity paths;
    // everyone else needs title-to-title evidence before body keywords can
    // score at all. Without the analyst waiver, a plain "Business Analyst"
    // title can never reach the analyst presets: "analyst" is a role-family
    // token whose evidence requires the template's domain word (product/
    // marketing/…) in the JD, which generic BA JDs don't contain.
    const supportWaiver = supportShaped && supportTitleTemplateAffinity(t) > 0;
    const analystWaiver = baShaped && businessAnalystTemplateAffinity(t) > 0;
    if (!supportWaiver && !analystWaiver) {
      if (!hasTitleToTitleEvidence(titleLine, lower, t)) continue;
      if (leadershipTemplateOnIcTitle(titleLine, t)) continue;
    }
    let score = 0;
    for (const kw of t.keywords) {
      if (keywordMatchesJd(lower, kw)) {
        score += kw.trim().split(/\s+/).filter(Boolean).length;
      }
    }
    const titleLower = t.roleTitle.toLowerCase();
    if (titleLower.length >= 6 && lower.includes(titleLower)) {
      score += 5;
    }
    if (supportShaped && t.category === SALES_BD_CATEGORY) {
      score -= 8;
    }
    if (supportShaped) {
      score += supportTitleTemplateAffinity(t);
    }
    if (baShaped) {
      score += businessAnalystTemplateAffinity(t);
    }
    const titleHits = roleTitleWordHits(lower, t.roleTitle);
    if (score > bestScore || (score === bestScore && score > 0 && titleHits > bestTitleHits)) {
      bestScore = score;
      bestTitleHits = titleHits;
      best = t;
    }
  }

  if (!best || bestScore < MIN_TEMPLATE_SCORE) return null;
  return { template: best, score: bestScore };
}

/** Find all templates in the same category. */
export function findTemplatesByCategory(category: string): IndiaJdTemplate[] {
  return getIndiaJdTemplates().filter((t) => t.category.toLowerCase() === category.toLowerCase());
}

/** Get all unique category names. */
export function getCategories(): string[] {
  const cats = new Set<string>();
  for (const t of getIndiaJdTemplates()) cats.add(t.category);
  return [...cats].sort();
}
