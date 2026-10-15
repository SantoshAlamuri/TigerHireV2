import type {
  JobPosting,
  JdSectionsView,
  Candidate,
  FitScore,
  FitScoreEvidenceQuote,
  FitScoreRating,
  Organisation,
  AgentRun,
  Application,
  ApplicationStatus,
  InterestLevel,
  RoleFunction,
  SeniorityLevel,
  IntentLabel,
} from "@/types";
import { getFitScoreRating } from "@/types";
import { getGhostRiskLabel } from "@/lib/agents/ghostbuster";
import { V2_CRITERIA_KEYS } from "@/lib/fitscore/types";
import { NO_DEFENSIBLE_QUOTE } from "@/lib/fitscore/hybrid/quote-validation";
import { resolveCandidateScreeningFlag } from "@/lib/screening/candidate-flag";

/** Matches three-stage GRADE_POINTS; local to avoid importing Node crypto into client-bound mappers. */
const CRITERIA_GRADE_PCT: Record<string, number> = { A: 100, B: 75, C: 50, D: 25, E: 0 };
import { normalizeSections, toLegacyView } from "@/lib/jobs/normalize-sections";

const SHOW_VERDICT_CV_EVIDENCE = process.env.NEXT_PUBLIC_FF_VERDICT_CV_EVIDENCE !== "false";
const SHOW_CONFIDENCE_BAND = process.env.NEXT_PUBLIC_FF_CONFIDENCE_BAND !== "false";

/**
 * Build a JdSectionsView from raw jd_sections JSONB, supporting both
 * legacy fixed-schema and v2 dynamic formats.
 */
function buildJdSectionsView(raw: unknown): JdSectionsView | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;

  if (obj.version === 2 && Array.isArray(obj.sections)) {
    const legacy = toLegacyView(normalizeSections(raw));
    if (!Object.values(legacy).some(Boolean)) return undefined;
    return toLegacySectionsView(legacy);
  }

  // Legacy path
  const readSection = (camelKey: string, snakeKey?: string): unknown =>
    obj[camelKey] ?? (snakeKey ? obj[snakeKey] : undefined);
  const asString = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() ? value : undefined;
  const asStringArray = (value: unknown): string[] | undefined => {
    if (Array.isArray(value)) {
      const out = value.map((v) => String(v).trim()).filter(Boolean);
      return out.length > 0 ? out : undefined;
    }
    if (typeof value === "string" && value.trim()) {
      const out = value
        .split(/\r?\n|,/)
        .map((v) => v.trim())
        .filter(Boolean);
      return out.length > 0 ? out : undefined;
    }
    return undefined;
  };

  const view: JdSectionsView = {
    designation: asString(readSection("designation")),
    reportingTo: asString(readSection("reportingTo", "reporting_to")),
    aboutCompany: asString(readSection("aboutCompany", "about_company")),
    rolesAndResponsibilities: asStringArray(
      readSection("rolesAndResponsibilities", "roles_and_responsibilities"),
    ),
    technicalSkills: asStringArray(readSection("technicalSkills", "technical_skills")),
    leadershipSkills: asStringArray(readSection("leadershipSkills", "leadership_skills")),
    softSkills: asStringArray(readSection("softSkills", "soft_skills")),
    preferredSkills: asStringArray(readSection("preferredSkills", "preferred_skills")),
    niceToHave: asStringArray(readSection("niceToHave", "nice_to_have")),
    benefits: asStringArray(readSection("benefits")),
    educationRequirements: asString(readSection("educationRequirements", "education_requirements")),
    employmentType: asString(readSection("employmentType", "employment_type")),
    experienceRange: asString(readSection("experienceRange", "experience_range")),
    noticePeriod: asString(readSection("noticePeriod", "notice_period")),
  };
  return Object.values(view).some(Boolean) ? view : undefined;
}

function toLegacySectionsView(legacy: Record<string, unknown>): JdSectionsView {
  const asStr = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
  const asArr = (v: unknown) => (Array.isArray(v) && v.length > 0 ? v.map(String) : undefined);
  return {
    designation: asStr(legacy.designation),
    reportingTo: asStr(legacy.reportingTo),
    aboutCompany: asStr(legacy.aboutCompany),
    rolesAndResponsibilities: asArr(legacy.rolesAndResponsibilities),
    technicalSkills: asArr(legacy.technicalSkills),
    leadershipSkills: asArr(legacy.leadershipSkills),
    softSkills: asArr(legacy.softSkills),
    preferredSkills: asArr(legacy.preferredSkills),
    niceToHave: asArr(legacy.niceToHave),
    benefits: asArr(legacy.benefits),
    educationRequirements: asStr(legacy.educationRequirements),
    employmentType: asStr(legacy.employmentType),
    experienceRange: asStr(legacy.experienceRange),
    noticePeriod: asStr(legacy.noticePeriod),
  };
}

/**
 * Map a DB job row (from /api/jobs) to the view-model JobPosting type.
 * Fields not present in the DB are given sensible defaults.
 */
/** Resolve organisation name from DB row (handles object or array from Supabase join). */
function resolveOrgName(row: Record<string, unknown>): string {
  const org = row.organisations;
  if (org && typeof org === "object" && !Array.isArray(org) && "name" in org)
    return (org.name as string) ?? "";
  if (
    Array.isArray(org) &&
    org.length > 0 &&
    org[0] &&
    typeof org[0] === "object" &&
    "name" in org[0]
  )
    return ((org[0] as Record<string, unknown>).name as string) ?? "";
  return (row.organisation_name as string) ?? "";
}

function resolveJobReferralBonus(row: Record<string, unknown>): {
  referralDirectBonusAmount?: number;
  referralBonusCurrency?: string;
} {
  const cfg = row.job_referral_config;
  const cfgObj = Array.isArray(cfg) ? cfg[0] : cfg;
  if (!cfgObj || typeof cfgObj !== "object") return {};
  const o = cfgObj as Record<string, unknown>;
  const raw = o.direct_bonus_amount;
  const n = typeof raw === "string" ? Number(raw) : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return {};
  const cur =
    typeof o.bonus_currency === "string" && o.bonus_currency.trim()
      ? o.bonus_currency.trim()
      : "INR";
  return { referralDirectBonusAmount: n, referralBonusCurrency: cur };
}

export function mapDbJobToPosting(row: Record<string, unknown>): JobPosting {
  const orgName = resolveOrgName(row) || "Unknown";
  const compensationMin = (row.compensation_min as number) ?? 0;
  const compensationMax = (row.compensation_max as number) ?? 0;
  const status = (row.status as string) ?? "open";

  const jdSections = buildJdSectionsView(row.jd_sections);
  const referral = resolveJobReferralBonus(row);

  const rawUrgencyScore =
    typeof row.urgency_score === "number" && Number.isFinite(row.urgency_score)
      ? (row.urgency_score as number)
      : null;
  const requestObj = Array.isArray(row.hiring_requests)
    ? (row.hiring_requests[0] as Record<string, unknown> | undefined)
    : ((row.hiring_requests as Record<string, unknown> | null | undefined) ?? undefined);
  const urgencyRaw =
    typeof requestObj?.urgency === "string" ? requestObj.urgency.toLowerCase() : null;
  const internalPriority =
    urgencyRaw && ["low", "normal", "high", "urgent", "critical"].includes(urgencyRaw)
      ? (urgencyRaw as "low" | "normal" | "high" | "urgent" | "critical")
      : undefined;

  return {
    id: row.id as string,
    companyId: (row.organisation_id as string) ?? "",
    companyName: orgName,
    titleRaw: (row.title as string) ?? "",
    titleNormalised: (row.title as string) ?? "",
    roleFunction: ((row.role_function as string) ?? "Engineering") as RoleFunction,
    seniorityLevel: ((row.seniority_level as string) ?? "Mid") as SeniorityLevel,
    location: (row.location as string) ?? "Remote",
    remoteAllowed: (row.remote_allowed as boolean) ?? false,
    skillsRequired: (row.skills_required as string[]) ?? [],
    skillsPreferred: (row.skills_preferred as string[]) ?? [],
    salaryMin: compensationMin,
    salaryMax: compensationMax,
    jdTextRaw: (row.description as string) ?? "",
    jdSections,
    urgencyScore: rawUrgencyScore,
    internalPriority,
    sourceUrl: (row.source_url as string) ?? undefined,
    postedDate: (row.created_at as string) ?? new Date().toISOString(),
    lastSeenDate: (row.updated_at as string) ?? new Date().toISOString(),
    isActive: status === "open",
    matchedCandidatesCount: (row.matched_count as number) ?? 0,
    ...referral,
  };
}

/**
 * Derive profile completeness (0-100) from candidate row when DB value is missing.
 * Mirrors logic in fitscore/score-input-helpers deriveProfileCompleteness.
 */
function deriveProfileCompletenessFromRow(row: Record<string, unknown>): number {
  let score = 0;
  const name = (row.name as string)?.trim();
  const fullName = (row.full_name as string)?.trim();
  if (name || fullName) score += 15;
  const skills = (row.skills as string[] | null | undefined) ?? [];
  if (skills.length > 0) score += 20;
  if (row.experience_years != null) score += 15;
  const cvLen = ((row.cv_raw_text as string) ?? "").trim().length;
  if (cvLen >= 500) score += 30;
  else if (cvLen >= 300) score += 20;
  else if (cvLen >= 100) score += 10;
  const status = (row.processing_status as string) ?? "";
  if (status === "complete") score += 20;
  else if (status === "pending") score += 10;
  return Math.min(100, score);
}

/**
 * Map a DB candidate row (from /api/candidates) to the view-model Candidate type.
 */
export function mapDbCandidateToView(row: Record<string, unknown>): Candidate {
  const name = (row.name as string) ?? "Unknown";
  const skills = (row.skills as string[]) ?? [];
  const intentScore = (row.intent_score as number) ?? 0;

  let intentLabel: IntentLabel = "Unknown";
  if (intentScore >= 80) intentLabel = "Active Now";
  else if (intentScore >= 60) intentLabel = "Actively Exploring";
  else if (intentScore >= 40) intentLabel = "Passively Open";
  else if (intentScore >= 20) intentLabel = "Lightly Passive";

  const location = (row.location as string) ?? "";
  const [city, state] = location.split(",").map((s) => s.trim());

  const storedCompleteness = row.profile_completeness as number | null | undefined;
  const profileCompleteness =
    storedCompleteness != null && Number.isFinite(storedCompleteness)
      ? Math.min(100, Math.max(0, storedCompleteness))
      : deriveProfileCompletenessFromRow(row);
  const screeningStatusRaw =
    typeof row.screening_status === "string" ? row.screening_status : undefined;
  const screeningModeRaw = typeof row.screening_mode === "string" ? row.screening_mode : undefined;
  const screeningUpdatedAtRaw =
    typeof row.screening_updated_at === "string" ? row.screening_updated_at : undefined;
  const screeningFlagRaw = typeof row.screening_flag === "string" ? row.screening_flag : undefined;
  const screeningFlag =
    screeningFlagRaw === "not_started" ||
    screeningFlagRaw === "in_progress" ||
    screeningFlagRaw === "completed" ||
    screeningFlagRaw === "attention"
      ? screeningFlagRaw
      : resolveCandidateScreeningFlag(screeningStatusRaw);

  return {
    id: row.id as string,
    name,
    nameMasked: (row.name_masked as string) ?? maskName(name),
    claimed: (row.claimed as boolean) ?? (row.user_id as string | null) !== null,
    roleTitle: (row.role_title as string) ?? "Professional",
    roleFunction: ((row.role_function as string) ?? "Engineering") as RoleFunction,
    seniorityLevel: ((row.seniority_level as string) ?? "Mid") as SeniorityLevel,
    currentCompany: (row.current_company as string) ?? "",
    locationCity: city ?? "",
    locationState: state ?? "",
    remotePreference: ((row.remote_preference as string) ?? "hybrid") as
      | "onsite"
      | "hybrid"
      | "remote",
    skillsVerified: skills,
    skillsInferred: (row.skills_inferred as string[]) ?? [],
    intentScore,
    intentLabel,
    signalFreshnessDate: (row.updated_at as string) ?? new Date().toISOString(),
    salaryMinInferred: (row.salary_min as number) ?? 0,
    salaryMaxInferred: (row.salary_max as number) ?? 0,
    yearsExperience: (row.experience_years as number) ?? 0,
    profileCompleteness,
    signalSources: (row.signal_sources as string[]) ?? [],
    avatarUrl: (row.avatar_url as string) ?? undefined,
    screeningFlag,
    screeningStatus: screeningStatusRaw,
    screeningMode: screeningModeRaw,
    screeningUpdatedAt: screeningUpdatedAtRaw,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    updatedAt: (row.updated_at as string) ?? new Date().toISOString(),
  };
}

/** Three-stage criteria breakdown item from DB. */
interface CriteriaBreakdownRow {
  criterion_id?: string;
  criterion_name?: string;
  weight?: number;
  grade?: string;
  points_earned?: number;
  evidence_text?: string;
  evidence_rule_matched?: string;
}

/** Human-readable label for hybrid JD dimension keys (snake_case or single tokens). */
function formatHybridDimensionLabel(key: string): string {
  const spaced = key.replace(/_/g, " ").trim();
  if (!spaced) return key;
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Hybrid v2 persists per-dimension value (1–10) + weight (JD weights sum to ~100) under v2_score_breakdown.
 * The UI DimensionBar expects score 0–100 and weight as a 0–1 fraction (display ×100).
 */
function hybridDimensionsFromV2Breakdown(
  v2Breakdown: unknown,
): Record<string, { label: string; score: number; weight: number }> | null {
  if (!v2Breakdown || typeof v2Breakdown !== "object") return null;
  const dims = (v2Breakdown as { dimensions?: unknown }).dimensions;
  if (!dims || typeof dims !== "object") return null;

  const out: Record<string, { label: string; score: number; weight: number }> = {};
  for (const [key, val] of Object.entries(dims as Record<string, unknown>)) {
    if (!val || typeof val !== "object") continue;
    const data = val as { value?: unknown; weight?: unknown };
    const rawV = typeof data.value === "number" && Number.isFinite(data.value) ? data.value : 1;
    const rawW = typeof data.weight === "number" && Number.isFinite(data.weight) ? data.weight : 0;
    const clamped = Math.min(10, Math.max(1, rawV));
    const weightFrac = rawW > 0 && rawW <= 1 ? rawW : rawW / 100;
    out[key] = {
      label: formatHybridDimensionLabel(key),
      score: Math.round((clamped / 10) * 100),
      weight: weightFrac,
    };
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Deterministic-fallback rows persist machine tokens like "skill_match:technical_depth" as
 * green flags. Humanize them for recruiters ("Matched: Technical Depth"); leave real sentences
 * untouched (the token pattern never contains spaces).
 */
const MACHINE_FLAG_TOKEN_RE = /^[a-z][a-z0-9_]*:[a-z0-9][a-z0-9_+#.-]*$/i;

function humanizeMachineFlagToken(value: string): string {
  const trimmed = value.trim();
  if (!MACHINE_FLAG_TOKEN_RE.test(trimmed)) return value;
  const idx = trimmed.indexOf(":");
  const prefix = trimmed.slice(0, idx);
  const detail = trimmed
    .slice(idx + 1)
    .replace(/_/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  if (prefix.toLowerCase() === "skill_match") return `Matched: ${detail}`;
  const prettyPrefix = prefix.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return `${prettyPrefix}: ${detail}`;
}

function humanizeFlagList(items: unknown[]): string[] {
  return items
    .filter((item): item is string => typeof item === "string")
    .map(humanizeMachineFlagToken);
}

/** Machine placeholders persisted when the model had no defensible CV quote — never recruiter-facing. */
const NON_DISPLAYABLE_QUOTE_TEXTS = new Set<string>([
  NO_DEFENSIBLE_QUOTE,
  "No quote entry returned by model",
]);

function mapHybridEvidenceQuotes(row: Record<string, unknown>): FitScoreEvidenceQuote[] {
  const root = row.evidence_json as { quotes?: unknown } | undefined;
  const quotes = root?.quotes;
  if (!Array.isArray(quotes)) return [];
  const mapped: FitScoreEvidenceQuote[] = [];
  for (const item of quotes) {
    if (!item || typeof item !== "object") continue;
    const quote = item as Record<string, unknown>;
    const dimension = typeof quote.dimension === "string" ? quote.dimension.trim() : "";
    const text = typeof quote.quote === "string" ? quote.quote.trim() : "";
    if (!dimension || !text || NON_DISPLAYABLE_QUOTE_TEXTS.has(text)) continue;
    const locationHint =
      typeof quote.location_hint === "string" ? quote.location_hint.trim() : undefined;

    if (locationHint) {
      mapped.push({ dimension, quote: text, location_hint: locationHint });
    } else {
      mapped.push({ dimension, quote: text });
    }
  }
  return mapped;
}

function hybridEvidenceSnapshotFromQuotes(
  quotes: FitScoreEvidenceQuote[],
): Record<string, unknown> | null {
  if (quotes.length === 0) return null;
  const byDimension = new Map<string, string[]>();
  for (const quote of quotes) {
    const current = byDimension.get(quote.dimension) ?? [];
    current.push(quote.quote);
    byDimension.set(quote.dimension, current);
  }
  const out: Record<string, unknown> = {};
  for (const [dimension, dimensionQuotes] of byDimension) {
    out[dimension] = dimensionQuotes.join("\n\n");
  }
  return out;
}

/**
 * Map a DB fit_score row to the view-model FitScore type.
 * Supports three-stage (band, criteria_breakdown, key_strengths, key_gaps) and legacy dimensions.
 */
export function mapDbFitScoreToView(row: Record<string, unknown>): FitScore {
  const overallFromDb = (row.overall_score as number) ?? 0;
  const primaryFromDb = row.primary_score as number | null | undefined;
  const scoringVersionEarly =
    row.scoring_version != null && row.scoring_version !== "" ? Number(row.scoring_version) : 1;
  /**
   * Persisted overall_score is the headline: the hybrid pipeline writes it as the calibrated
   * blend (calibrate(primary ?? engine score)) and select-blend rewrites it when a recruiter
   * picks the shadow blend. Raw primary_score only fills in for legacy/partial v2 rows where
   * overall_score is missing or zero — it must never override a recruiter's blend selection.
   */
  const overall =
    overallFromDb > 0
      ? overallFromDb
      : scoringVersionEarly >= 2 && primaryFromDb != null && primaryFromDb > 0
        ? primaryFromDb
        : overallFromDb;
  const scoringVersionNum =
    row.scoring_version != null && row.scoring_version !== "" ? Number(row.scoring_version) : 1;
  const band = row.band as string | undefined;
  const criteriaBreakdownRaw = (row.criteria_breakdown as CriteriaBreakdownRow[] | undefined) ?? [];
  /** Screening-only rescoring can raise overall_score while leaving an old all-E breakdown (0 points). */
  const staleAllEBreakdown =
    overall >= 55 &&
    criteriaBreakdownRaw.length > 0 &&
    criteriaBreakdownRaw.every((c) => {
      const g = String(c.grade ?? "E").toUpperCase();
      return g === "E" && (c.points_earned ?? 0) === 0;
    });
  const criteriaRowsForView = staleAllEBreakdown ? [] : criteriaBreakdownRaw;
  const keyStrengths = Array.isArray(row.key_strengths) ? row.key_strengths : [];
  const keyGaps = Array.isArray(row.key_gaps) ? row.key_gaps : [];
  const greenFlagsRaw = Array.isArray(row.green_flags) ? row.green_flags : [];
  const redFlagsRaw = Array.isArray(row.red_flags) ? row.red_flags : [];
  const amberFlagsRaw = Array.isArray(row.amber_flags) ? row.amber_flags : [];
  const missingMustHavesRaw = Array.isArray(row.missing_must_haves) ? row.missing_must_haves : [];
  const idealGapsRaw = Array.isArray(row.ideal_gaps) ? row.ideal_gaps : [];
  const oneLineSummary = (row.one_line_summary as string) ?? "";
  const blendReasoning = (row.blend_reasoning as string) ?? "";
  const scoringFormula = row.scoring_formula as string | undefined;
  const provenanceHash = row.provenance_hash as string | undefined;
  const scoringStatusRaw = row.scoring_status as string | undefined;
  const confidenceFromRow = row.confidence as "high" | "medium" | "low" | undefined;
  const verdictEvidenceQuotes = SHOW_VERDICT_CV_EVIDENCE ? mapHybridEvidenceQuotes(row) : [];
  const hybridEvidenceSnapshot = hybridEvidenceSnapshotFromQuotes(verdictEvidenceQuotes);
  const scoringMethodRaw = typeof row.scoring_method === "string" ? row.scoring_method : undefined;
  const isDeterministicFallback = scoringMethodRaw === "deterministic_fallback";
  // Prefer explicit flags; fall back to three-stage key_strengths/key_gaps when flags are empty
  const greenFlags = humanizeFlagList(greenFlagsRaw.length > 0 ? greenFlagsRaw : keyStrengths);
  const keyStrengthsView = humanizeFlagList(keyStrengths);
  const redFlags = redFlagsRaw.length > 0 ? redFlagsRaw : keyGaps;

  const dims =
    (row.dimensions as Record<
      string,
      { score: number; weight: number; label?: string; reasoning?: string } | unknown
    >) ?? {};
  const meta =
    (dims._meta as
      | {
          confidence?: string;
          flags?: string[];
          role_type?: string;
          recommendation?: string;
          holistic_rationale?: string;
        }
      | undefined) ?? {};

  function dim(key: string, fallbackScore: number, label?: string) {
    const d = dims[key] as
      | { score?: number; weight?: number; label?: string; reasoning?: string }
      | undefined;
    return {
      label: d?.label ?? label ?? key,
      score: d?.score ?? fallbackScore,
      weight: d?.weight ?? 0,
      ...(d?.reasoning != null && d.reasoning !== "" ? { reasoning: d.reasoning } : {}),
    };
  }

  let dimensions: Record<
    string,
    { label: string; score: number; weight: number; reasoning?: string }
  >;

  if (criteriaRowsForView.length > 0) {
    dimensions = Object.fromEntries(
      criteriaRowsForView.map((c) => {
        const weight = c.weight ?? 0;
        const pointsEarned = c.points_earned ?? 0;
        const fromPoints = weight > 0 ? Math.round((pointsEarned / weight) * 100) : 0;
        const gradeKey = String(c.grade ?? "E").toUpperCase();
        const fromGrade = CRITERIA_GRADE_PCT[gradeKey] ?? 0;
        // Prefer weighted points; if they're zero but the letter grade isn't E, trust the grade
        // (fixes inconsistent rows where overall was refreshed without updating points_earned).
        const score = fromPoints > 0 ? fromPoints : fromGrade;
        return [
          c.criterion_id ?? c.criterion_name ?? "",
          {
            label: c.criterion_name ?? "",
            score,
            weight,
            reasoning: c.evidence_text,
          },
        ];
      }),
    );
  } else {
    const fromHybridBreakdown =
      scoringVersionNum >= 2 ? hybridDimensionsFromV2Breakdown(row.v2_score_breakdown) : null;
    if (fromHybridBreakdown) {
      dimensions = fromHybridBreakdown;
    } else {
      const isV2 = V2_CRITERIA_KEYS.some((k) => dims[k] != null);
      dimensions = isV2
        ? Object.fromEntries(
            V2_CRITERIA_KEYS.map((key) => [
              key,
              dim(
                key,
                key === "primary_skill_match"
                  ? ((row.skills_score as number) ?? overall)
                  : key === "experience_depth"
                    ? ((row.experience_score as number) ?? overall)
                    : overall,
              ),
            ]),
          )
        : {
            skillsMatch: dim("skillsMatch", (row.skills_score as number) ?? overall),
            experienceRelevance: dim(
              "experienceRelevance",
              (row.experience_score as number) ?? overall,
            ),
            seniorityAlignment: dim("seniorityAlignment", overall),
            locationAvailability: dim("locationAvailability", overall),
            signalFreshness: dim("signalFreshness", overall),
          };
    }
  }

  const criteriaBreakdown: FitScore["criteriaBreakdown"] =
    criteriaRowsForView.length > 0
      ? criteriaRowsForView.map((c) => ({
          criterion_id: c.criterion_id ?? "",
          criterion_name: c.criterion_name ?? "",
          weight: c.weight ?? 0,
          grade: c.grade ?? "E",
          points_earned: c.points_earned ?? 0,
          evidence_text: c.evidence_text ?? "",
          evidence_rule_matched: c.evidence_rule_matched,
        }))
      : undefined;

  const rating: FitScoreRating =
    (band as FitScoreRating) ??
    (meta.recommendation as FitScoreRating) ??
    (getFitScoreRating(overall) as FitScoreRating);

  const parseQualityRaw = row.parse_quality_score ?? row.parseQualityScore;
  let parseQualityScore: number | null =
    typeof parseQualityRaw === "number"
      ? parseQualityRaw
      : typeof parseQualityRaw === "string" && parseQualityRaw.trim() !== ""
        ? Number.parseFloat(parseQualityRaw)
        : null;
  if (parseQualityScore != null && !Number.isFinite(parseQualityScore)) {
    parseQualityScore = null;
  }
  // Hybrid saves omit parse_quality_score; DB/API often surfaces 0 — not a real Stage 0 score.
  if (scoringVersionNum >= 2 && parseQualityScore === 0) {
    parseQualityScore = null;
  }

  const v2Breakdown = row.v2_score_breakdown as Record<string, unknown> | null | undefined;
  const v2ConfidenceRaw = v2Breakdown?.confidence_score;
  const evidenceConfidenceScore =
    scoringVersionNum >= 2 &&
    typeof v2ConfidenceRaw === "number" &&
    Number.isFinite(v2ConfidenceRaw) &&
    v2ConfidenceRaw > 0
      ? v2ConfidenceRaw
      : null;

  return {
    id: row.id as string,
    candidateId: (row.candidate_id as string) ?? "",
    candidateName:
      (row.candidate_name as string) ??
      ((row.candidates as Record<string, unknown>)?.name as string) ??
      ((row.candidates as Record<string, unknown>)?.full_name as string) ??
      "Candidate",
    candidateNameMasked:
      (row.candidate_name_masked as string) ??
      ((row.candidates as Record<string, unknown>)?.name as string) ??
      ((row.candidates as Record<string, unknown>)?.full_name as string) ??
      "Candidate",
    jobPostingId: (row.job_id as string) ?? "",
    jobTitle:
      (row.job_title as string) ??
      ((row.jobs as Record<string, unknown>)?.title as string) ??
      "Role",
    companyName:
      (row.company_name as string) ??
      // /api/candidates/matches embeds the org name as jobs.organisations.name
      (((row.jobs as Record<string, unknown>)?.organisations as Record<string, unknown> | null)
        ?.name as string) ??
      "",
    overallScore: overall,
    rating,
    dimensions,
    criteriaBreakdown,
    band,
    greenFlags,
    amberFlags: amberFlagsRaw,
    redFlags,
    aiSummary: (row.summary as string) ?? oneLineSummary ?? "",
    aiRecommendation: (row.ai_recommendation as string) ?? undefined,
    keyStrengths: keyStrengthsView.length > 0 ? keyStrengthsView : undefined,
    keyGaps: keyGaps.length > 0 ? keyGaps : undefined,
    oneLineSummary: oneLineSummary || undefined,
    blendReasoning: blendReasoning || undefined,
    scoringFormula: scoringFormula || undefined,
    provenanceHash: provenanceHash || undefined,
    scoringStatus:
      scoringStatusRaw === "deferred" ||
      scoringStatusRaw === "failed" ||
      scoringStatusRaw === "scored"
        ? scoringStatusRaw
        : undefined,
    scoringStatusReason: (row.scoring_status_reason as string | null | undefined) ?? null,
    scoringStatusUpdatedAt: (row.scoring_status_updated_at as string | undefined) ?? undefined,
    signalScore: (row.signal_score as number | null | undefined) ?? null,
    gradeBasedScore: (row.grade_based_score as number | null | undefined) ?? null,
    matchedKeywords: Array.isArray(row.matched_keywords)
      ? (row.matched_keywords as string[]).filter((value) => typeof value === "string")
      : undefined,
    rubricSnapshot: ((row.rubric_snapshot as Record<string, unknown> | null | undefined) ??
      null) as Record<string, unknown> | null,
    evidenceSnapshot: ((row.evidence_snapshot as Record<string, unknown> | null | undefined) ??
      hybridEvidenceSnapshot ??
      null) as Record<string, unknown> | null,
    verdictEvidenceQuotes:
      SHOW_VERDICT_CV_EVIDENCE && verdictEvidenceQuotes.length > 0 ? verdictEvidenceQuotes : null,
    extractionModel: (row.extraction_model as string | null | undefined) ?? null,
    // Hybrid saves never write extraction_fallback; scoring_method carries the fallback signal,
    // so deterministic-fallback rows surface the existing "(fallback)" badge in the UI.
    extractionFallback: isDeterministicFallback
      ? true
      : ((row.extraction_fallback as boolean | null | undefined) ?? null),
    parseQualityScore:
      parseQualityScore != null && Number.isFinite(parseQualityScore) ? parseQualityScore : null,
    evidenceConfidenceScore,
    skillsSignal:
      (row.primary_blend as { skills_signal?: number } | undefined)?.skills_signal ?? undefined,
    intentMatch:
      (row.primary_blend as { intent_match?: number } | undefined)?.intent_match ?? undefined,
    primaryScore:
      (row.primary_score as number | undefined) ??
      (() => {
        const sig = row.signal_score as number | undefined;
        const grade = row.grade_based_score as number | undefined;
        if (sig != null && grade != null) return Math.round(0.2 * sig + 0.8 * grade);
        return undefined;
      })(),
    shadowScore:
      (row.shadow_score as number | undefined) ??
      (() => {
        const sig = row.signal_score as number | undefined;
        const grade = row.grade_based_score as number | undefined;
        if (sig != null && grade != null) return Math.round(0.4 * sig + 0.6 * grade);
        return undefined;
      })(),
    recruiterSelected:
      (row.recruiter_selected as "primary" | "shadow" | null | undefined) ?? undefined,
    primaryBlendFormula: (row.primary_blend as { formula?: string } | undefined)?.formula,
    shadowBlendFormula: (row.shadow_blend as { formula?: string } | undefined)?.formula,
    shadowBlendVersion: (row.shadow_blend as { version?: string } | undefined)?.version,
    holisticRationale: (meta.holistic_rationale as string) ?? undefined,
    interviewAngles: (row.interview_angles as string[]) ?? undefined,
    // Historical backfill: legacy rows pre-date the model_version column. Keep the literal
    // (do NOT swap to MODELS.SONNET) — this should reflect the model that actually scored
    // those rows, not the current default.
    modelVersion: (row.model_version as string) ?? "claude-sonnet-4-20250514",
    // No fabricated fallback: nothing writes prompt_version yet, and defaulting to
    // "v2.2" made every score display a decision-standard version that corresponded
    // to nothing. Undefined lets the UI say "not recorded" instead of asserting.
    promptVersion: (row.prompt_version as string | null) ?? undefined,
    scoringVersion: scoringVersionNum,
    scoredAt: (row.created_at as string) ?? new Date().toISOString(),
    confidence: SHOW_CONFIDENCE_BAND
      ? (confidenceFromRow ?? (meta.confidence as "high" | "medium" | "low" | undefined))
      : undefined,
    flags: meta.flags,
    peerReviewed: (row.peer_reviewed as boolean) ?? undefined,
    pass1Score: (row.pass1_score as number) ?? undefined,
    pass2Score: (row.pass2_score as number) ?? undefined,
    divergence: (row.divergence as number) ?? undefined,
    humanReviewRequired: (row.human_review_required as boolean) ?? undefined,
    humanReviewReason: (row.human_review_reason as string) ?? undefined,
    candidateTrustScore:
      ((row.candidates as Record<string, unknown>)?.trust_score as number | undefined) ?? undefined,
    candidateGhostRiskLabel: (() => {
      const g = (row.candidates as Record<string, unknown>)?.ghost_risk_score as number | undefined;
      return g != null ? getGhostRiskLabel(g) : undefined;
    })(),
    candidateVouches:
      ((row.candidates as Record<string, unknown>)?.vouches as Array<Record<string, unknown>>) ??
      undefined,
    candidateVerificationClaims:
      ((row.candidates as Record<string, unknown>)?.verification_claims as Array<
        Record<string, unknown>
      >) ?? undefined,
    candidateAuthenticitySignal:
      ((row.candidates as Record<string, unknown>)?.authenticity_signal as
        | "likely_authentic"
        | "review_carefully"
        | "likely_ai_generated"
        | null) ?? undefined,
    candidateAuthenticityConfidence:
      ((row.candidates as Record<string, unknown>)?.authenticity_confidence as number | null) ??
      undefined,
    candidateAuthenticityReasons:
      ((row.candidates as Record<string, unknown>)?.authenticity_reasons as string[] | null) ??
      undefined,
    missingMustHaves: missingMustHavesRaw.length > 0 ? missingMustHavesRaw : undefined,
    marketPercentile: (row.market_percentile as number | null | undefined) ?? null,
    marketLabel: (row.market_label as string | null | undefined) ?? null,
    idealMatchPct: (row.ideal_match_pct as number | null | undefined) ?? null,
    idealGaps: idealGapsRaw.length > 0 ? idealGapsRaw : undefined,
    verdict: (row.verdict as string | null | undefined) ?? null,
    verdictAction: (row.verdict_action as string | null | undefined) ?? null,
    candidateCurrentRole:
      ((row.candidates as Record<string, unknown> | null)?.current_role as
        | string
        | null
        | undefined) ?? null,
  };
}

export function mapDbOrgToView(row: Record<string, unknown>): Organisation {
  const plan = (row.company_plan as string) ?? "free";
  const quotas: Record<string, number> = {
    starter: 15,
    growth: 50,
    scale: 500,
    free: 5,
  };
  // Prefer quota from API (billing_plans); -1 = unlimited
  const quotaFromApi = row.unlock_quota as number | undefined;
  const unlockQuotaMonthly = typeof quotaFromApi === "number" ? quotaFromApi : (quotas[plan] ?? 5);

  return {
    id: row.id as string,
    name: (row.name as string) ?? "",
    billingTier: plan === "starter" || plan === "growth" || plan === "scale" ? plan : "free",
    unlockQuotaMonthly,
    unlocksUsedThisMonth: (row.unlocks_used as number) ?? 0,
    seatsUsed: (row.seats_used as number) ?? 1,
    seatsTotal: (row.seats_total as number) ?? (plan === "scale" ? 15 : plan === "growth" ? 5 : 2),
    stripeCustomerId: (row.stripe_customer_id as string) ?? undefined,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  };
}

export function mapDbAgentRunToView(row: Record<string, unknown>): AgentRun {
  const payload = (row.payload as Record<string, unknown>) ?? {};
  return {
    id: row.id as string,
    agentType: ((row.agent_name as string) ?? "talent_scout") as AgentRun["agentType"],
    startedAt: (row.started_at as string) ?? (row.created_at as string) ?? new Date().toISOString(),
    completedAt: (row.completed_at as string) ?? (payload.completed_at as string) ?? null,
    recordsProcessed:
      (row.records_processed as number) ?? (payload.records_processed as number) ?? 0,
    recordsCreated: (row.records_created as number) ?? (payload.records_created as number) ?? 0,
    recordsUpdated: (row.records_updated as number) ?? (payload.records_updated as number) ?? 0,
    errorsCount: (row.errors_count as number) ?? (payload.errors_count as number) ?? 0,
    costUsd: (row.cost_usd as number) ?? (payload.cost_usd as number) ?? 0,
    status: ((row.status as string) ?? "completed") as AgentRun["status"],
  };
}

export function mapDbApplicationToView(row: Record<string, unknown>): Application {
  const job = (row.jobs as Record<string, unknown>) ?? {};
  const candidate = (row.candidates as Record<string, unknown>) ?? {};
  const fitScore = (row.fit_scores as Record<string, unknown>) ?? {};
  const org = (job.organisations as Record<string, unknown>) ?? {};

  const candidateName = (candidate.name as string) ?? "Candidate";

  const directRef = row.direct_referrer_id as string | null | undefined;
  const referralLink = row.referral_link_id as string | null | undefined;

  return {
    id: row.id as string,
    candidateId: (row.candidate_id as string) ?? "",
    jobId: (row.job_id as string) ?? "",
    fitScoreId: (row.fit_score_id as string) ?? null,
    interest: ((row.interest as string) ?? "interested") as InterestLevel,
    coverNote: (row.cover_note as string) ?? null,
    status: ((row.status as string) ?? "applied") as ApplicationStatus,
    jobTitle: (job.title as string) ?? "Role",
    companyName: (org.name as string) ?? "",
    overallScore: (fitScore.overall_score as number) ?? null,
    candidateName,
    candidateNameMasked: maskName(candidateName),
    viewedAt: (row.viewed_at as string) ?? null,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    updatedAt: (row.updated_at as string) ?? new Date().toISOString(),
    appliedViaReferral: Boolean(directRef) || Boolean(referralLink),
    confidentialApply: Boolean(row.confidential_apply),
  };
}

function maskName(name: string): string {
  const parts = name.split(" ");
  if (parts.length <= 1) return name;
  return `${parts[0]} ${parts[1][0]}.`;
}
