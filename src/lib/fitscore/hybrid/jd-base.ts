/**
 * JD Base Document: DB mapping, fetch, template match → LLM auto-generation for any role.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { callClaude } from "@/lib/services/anthropic";
import { parseJsonFromLLM } from "@/lib/fitscore/three-stage/parse-llm-json";
import { buildJdText } from "@/lib/fitscore/job-text";
import {
  DEFAULT_SCORE_FLOOR,
  DEFAULT_FIT_THRESHOLDS,
  FEATURE_FLAG_HYBRID_V2,
  HYBRID_EXTRACTION_MODEL,
} from "./constants";
import type { JobData } from "@/lib/fitscore/types";
import type { FitThresholds, JDBaseDocument, ScoringWeights } from "./types";
import { isIdealCandidateProfile, type IdealCandidateProfile } from "./ideal-profile";
import { normalizeWeightsTo100 } from "./templates";
import { fitThresholdsSchema, scoringWeightsSchema } from "@/lib/validations/fitscore-hybrid";
import { getFitscoreHybridHaikuModel } from "@/lib/config/models";
import { isEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/observability/logger";
import { maybeSyncFeedbackTemplateFromIdealProfile } from "@/lib/feedback/ideal-profile-feedback-template";
import {
  findBestIndiaTemplate,
  getIndiaJdTemplates,
  type IndiaJdTemplate,
} from "./jd-india-templates";
import { isStructuredJdEnabled } from "@/lib/feature-flags/cascade";
import { parseStructuredJd, type StructuredJd } from "./structured-jd";
import { syncJdRequirementsFromStructuredJd } from "@/lib/jd-base/sync-requirements";

/** Optional tuning for JD Base writes (e.g. tryout fast path). */
export type JdBaseWriteOptions = {
  /** When "deterministic", skip the extra LLM call after India template match. */
  idealProfileSource?: "llm" | "deterministic";
  /** Model for template ideal-profile generation (defaults to hybrid extraction model). */
  idealProfileModel?: string;
  /** When false, skip syncing interview feedback form templates. */
  syncFeedbackTemplate?: boolean;
  /** Override model for full LLM JD-base generation (no template match). */
  generationModel?: string;
  /** Cap output tokens for faster LLM generation (tryout). */
  generationMaxTokens?: number;
};

type JdBaseRow = {
  id: string;
  job_id: string;
  role_title: string;
  company: string;
  context: string;
  weights: unknown;
  score_floor: number;
  fit_thresholds: unknown;
  extraction_additions: string | null;
  ideal_candidate_profile?: unknown;
  approved_by?: string | null;
  approved_at?: string | null;
  structured_jd?: unknown;
  version?: number;
};

/** Parse `[tigerhire.template_id=…]` written by `upsertJdBaseFromTemplate`. */
export function parseIndiaTemplateIdFromExtractionAdditions(
  extractionAdditions: string | null | undefined,
): string | null {
  const m = extractionAdditions?.match(/\[tigerhire\.template_id=([^\]]+)\]/);
  const id = m?.[1]?.trim();
  return id || null;
}

export function resolveIndiaTemplateMetadata(extractionAdditions: string | null | undefined): {
  templateId: string | null;
  templateCategory: string | null;
  templateRoleTitle: string | null;
  foundation: "india_template" | "llm";
} {
  const templateId = parseIndiaTemplateIdFromExtractionAdditions(extractionAdditions);
  if (!templateId) {
    return {
      templateId: null,
      templateCategory: null,
      templateRoleTitle: null,
      foundation: "llm",
    };
  }
  const t = getIndiaJdTemplates().find((x) => x.id === templateId);
  return {
    templateId,
    templateCategory: t?.category ?? null,
    templateRoleTitle: t?.roleTitle ?? null,
    foundation: "india_template",
  };
}

export function rowToJdBase(row: JdBaseRow): JDBaseDocument {
  const rawWeights = scoringWeightsSchema.parse(row.weights);
  const weights = normalizeWeightsTo100(rawWeights);
  const fitThresholds = fitThresholdsSchema.parse(row.fit_thresholds) as FitThresholds;
  const idealProfile = isIdealCandidateProfile(row.ideal_candidate_profile)
    ? row.ideal_candidate_profile
    : null;
  return {
    id: row.id,
    jobId: row.job_id,
    roleTitle: row.role_title,
    company: row.company,
    context: row.context,
    weights,
    scoreFloor: row.score_floor,
    fitThresholds,
    extractionAdditions: row.extraction_additions,
    idealCandidateProfile: idealProfile,
    approvedBy: row.approved_by ?? null,
    approvedAt: row.approved_at ?? null,
    structuredJd: parseStructuredJd(row.structured_jd),
    version: row.version ?? 1,
  };
}

export async function getJdBaseByJobId(
  supabase: SupabaseClient,
  jobId: string,
): Promise<JDBaseDocument | null> {
  const { data, error } = await supabase
    .from("jd_base_documents")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowToJdBase(data as JdBaseRow);
}

const idealCandidateProfileSchema = z.object({
  summary: z.string().min(10),
  must_haves: z.array(z.string()).min(3),
  nice_to_haves: z.array(z.string()),
  years_range: z.string(),
  benchmarks: z.record(z.string(), z.string()),
  /** Ranked, measurable results the hire must deliver (outcomes-first spine). Optional/additive. */
  outcomes: z.array(z.string()).optional(),
  /** Role-specific behavioural competencies (highest-validity signal). Optional/additive. */
  competencies: z.array(z.string()).optional(),
});

const generationResponseSchema = z.object({
  context: z.string().min(10),
  weights: z.record(z.string(), z.coerce.number()),
  ideal_candidate_profile: idealCandidateProfileSchema.optional(),
});

function buildDeterministicIdealProfile(
  job: JobData,
  template: IndiaJdTemplate,
): IdealCandidateProfile {
  const dimensionKeys = Object.keys(template.weights)
    .filter((k) => template.weights[k] > 0)
    .slice(0, 5);
  const mustHaves = [
    ...dimensionKeys.map((k) => k.replace(/_/g, " ")),
    ...template.signals
      .split(/[,;/]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3),
  ]
    .filter((v, idx, arr) => arr.indexOf(v) === idx)
    .slice(0, 6);
  const niceToHaves = template.redFlags
    ? ["Track record of avoiding common delivery risks", "Cross-functional communication"]
    : ["Cross-functional communication", "Ownership mindset"];
  const benchmarks = Object.fromEntries(
    dimensionKeys.map((k) => [
      k,
      `Demonstrates strong evidence in ${k.replace(/_/g, " ")} through relevant projects and measurable outcomes.`,
    ]),
  );
  return {
    summary: `Ideal ${job.title} candidates show reliable execution in ${template.category.toLowerCase()} contexts, with clear evidence tied to role-critical signals and consistent delivery outcomes.`,
    must_haves:
      mustHaves.length >= 3
        ? mustHaves
        : ["Role-relevant domain experience", "Proven delivery outcomes", "Clear communication"],
    nice_to_haves: niceToHaves,
    years_range: "3-8 years",
    benchmarks,
  };
}

async function generateIdealProfileFromTemplate(
  job: JobData,
  template: IndiaJdTemplate,
  source: "llm" | "deterministic" = "llm",
  model: string = HYBRID_EXTRACTION_MODEL,
): Promise<IdealCandidateProfile> {
  const fallback = buildDeterministicIdealProfile(job, template);
  if (source === "deterministic") return fallback;
  const jdText = buildJdText(job);
  try {
    const res = await callClaude({
      model,
      max_tokens: 900,
      jobId: job.id,
      organisationId: job.organisation_id,
      temperature: 0,
      system: `Generate an ideal candidate profile for recruiter scoring.
Return valid JSON only with keys:
- summary (string, 3-4 sentences)
- must_haves (array of 4-6 strings)
- nice_to_haves (array of 3-4 strings)
- years_range (string)
- benchmarks (object mapping dimension key -> description for what 8+/10 evidence looks like)
- outcomes (array of 3-5 strings — the specific, measurable results this hire must deliver in the first 6–12 months; each phrased as a concrete deliverable, most important first)
- competencies (array of 3-5 strings — the role-specific behaviours that predict success, each phrased as an observable capability, e.g. "structures ambiguous problems independently"; distinct from generic soft traits)`,
      messages: [
        {
          role: "user",
          content: `Role: ${job.title}
Category: ${template.category}
Template role: ${template.roleTitle}
Signals: ${template.signals}
Weights JSON: ${JSON.stringify(template.weights)}
Red flags: ${template.redFlags ?? "none"}

Job description:
${jdText.slice(0, 12_000)}

Tailor must_haves, benchmarks, and years_range to THIS job description. Use the exact dimension keys from Weights JSON as benchmark keys.

Respond with JSON only.`,
        },
      ],
      label: "fitscore-hybrid-template-ideal-profile",
    });
    const parsed = parseJsonFromLLM<unknown>(res.text);
    return idealCandidateProfileSchema.parse(parsed);
  } catch (err) {
    logger.warn("Falling back to deterministic ideal profile for template", {
      job_id: job.id,
      template_id: template.id,
      message: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}

/**
 * Generate a JD Base via LLM for ANY role type. The LLM picks 8 role-specific
 * dimensions with percentage weights, plus a context paragraph.
 */
export async function generateJdBaseDocument(
  supabase: SupabaseClient,
  job: JobData,
  options?: JdBaseWriteOptions,
): Promise<JDBaseDocument> {
  const jdText = buildJdText(job);
  const model = options?.generationModel ?? HYBRID_EXTRACTION_MODEL;
  const res = await callClaude({
    model,
    max_tokens: options?.generationMaxTokens ?? 2048,
    jobId: job.id,
    organisationId: job.organisation_id,
    temperature: 0,
    system: `You analyze job descriptions to identify the 8 most important scoring dimensions for candidate evaluation.
Return JSON only with keys:
- context: 2-5 sentences describing what this role needs (skills, environment, stakeholders, seniority)
- weights: object with exactly 8 dimension keys (snake_case) and integer percentage values summing to ~100
  Pick dimensions that best capture this specific role's requirements.
  Example for a backend engineer: {"core_language": 20, "system_design": 20, "database_skills": 15, "devops_cicd": 10, "testing_quality": 10, "problem_solving": 10, "years_exp": 10, "domain_knowledge": 5}
  Example for a scrum master: {"agile_mastery": 20, "stakeholder_mgmt": 20, "team_scale": 15, "delivery_ownership": 15, "coaching": 10, "technical_understanding": 5, "certifications": 10, "sm_years": 5}
- ideal_candidate_profile: object describing the perfect candidate with:
  - summary: 3-4 sentence description of the perfect candidate for this role
  - must_haves: array of 4-6 non-negotiable requirements (strings)
  - nice_to_haves: array of 3-4 bonus qualifications (strings)
  - years_range: expected years of experience (e.g. "5-8 years")
  - benchmarks: object where keys are dimension names and values describe what a score of 8+ looks like`,
    messages: [
      {
        role: "user",
        content: `Job title: ${job.title}\n\n${jdText}\n\nRespond with JSON only.`,
      },
    ],
    label: "fitscore-hybrid-jd-base-generate",
  });

  const parsed = parseJsonFromLLM<unknown>(res.text);
  const gen = generationResponseSchema.parse(parsed);
  const weights = normalizeWeightsTo100(gen.weights);

  const row = {
    job_id: job.id,
    role_title: job.title,
    company: "TigerHire Client",
    context: gen.context,
    weights,
    score_floor: DEFAULT_SCORE_FLOOR,
    fit_thresholds: DEFAULT_FIT_THRESHOLDS,
    extraction_additions: null as string | null,
    ideal_candidate_profile: gen.ideal_candidate_profile ?? null,
    approved_by: null as string | null,
    approved_at: null as string | null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("jd_base_documents")
    .upsert(row, { onConflict: "job_id" })
    .select("*")
    .single();
  if (error) throw error;
  const doc = rowToJdBase(data as JdBaseRow);
  if (options?.syncFeedbackTemplate !== false) {
    await maybeSyncFeedbackTemplateFromIdealProfile(supabase, job.id, doc.idealCandidateProfile);
  }
  return doc;
}

/** Persist JD Base from a matched template (no LLM). */
export async function upsertJdBaseFromTemplate(
  supabase: SupabaseClient,
  job: JobData,
  template: IndiaJdTemplate,
  options?: JdBaseWriteOptions,
): Promise<JDBaseDocument> {
  const context =
    `${template.category}. ${template.roleTitle}. Prioritize evidence tied to: ${template.signals}`.slice(
      0,
      8000,
    );
  const extraction_additions = [
    `[tigerhire.template_id=${template.id}]`,
    `Template category: ${template.category}`,
    `Key signals: ${template.signals}`,
    template.redFlags ? `Typical red flags to watch for: ${template.redFlags}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 12_000);

  const idealCandidateProfile = await generateIdealProfileFromTemplate(
    job,
    template,
    options?.idealProfileSource ?? "llm",
    options?.idealProfileModel ?? HYBRID_EXTRACTION_MODEL,
  );
  const row = {
    job_id: job.id,
    role_title: job.title,
    company: "TigerHire Client",
    context,
    weights: template.weights,
    score_floor: template.scoreFloor,
    fit_thresholds: template.fitThresholds,
    extraction_additions,
    ideal_candidate_profile: idealCandidateProfile,
    approved_by: null as string | null,
    approved_at: null as string | null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("jd_base_documents")
    .upsert(row, { onConflict: "job_id" })
    .select("*")
    .single();
  if (error) throw error;
  const doc = rowToJdBase(data as JdBaseRow);
  if (options?.syncFeedbackTemplate !== false) {
    await maybeSyncFeedbackTemplateFromIdealProfile(supabase, job.id, doc.idealCandidateProfile);
  }
  return doc;
}

/**
 * Ensure a JD Base exists for a job:
 * 1. Reuse existing → done
 * 2. Match India template library (121 roles) → create from template
 * 3. LLM-generate role-specific dimensions (if flag is on)
 */
export async function ensureJdBaseForJob(supabase: SupabaseClient, job: JobData): Promise<void> {
  const existing = await getJdBaseByJobId(supabase, job.id);
  if (existing) return;

  const jdBlob = `${job.title}\n${buildJdText(job)}`;
  const match = findBestIndiaTemplate(jdBlob);
  if (match) {
    await upsertJdBaseFromTemplate(supabase, job, match.template);
    logger.info("JD Base created from template", {
      job_id: job.id,
      template_id: match.template.id,
      template_role: match.template.roleTitle,
      match_score: match.score,
    });
    return;
  }

  if (await isEnabled(FEATURE_FLAG_HYBRID_V2, job.organisation_id)) {
    await generateJdBaseDocument(supabase, job);
    logger.info("JD Base created via LLM (no template match)", { job_id: job.id });
  } else {
    logger.info("JD Base skipped: no template match and fitscore_hybrid_v2 off", {
      job_id: job.id,
    });
  }
}

/** Deep JSON equality (key-order-insensitive) for change detection. */
export function jsonValueEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => jsonValueEquals(v, b[i]));
  }
  if (a && b && typeof a === "object") {
    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;
    const keysA = Object.keys(objA);
    if (keysA.length !== Object.keys(objB).length) return false;
    return keysA.every((k) => k in objB && jsonValueEquals(objA[k], objB[k]));
  }
  return false;
}

export type JdBaseUpdatePatch = Partial<{
  roleTitle: string;
  company: string;
  context: string;
  weights: ScoringWeights;
  scoreFloor: number;
  fitThresholds: FitThresholds;
  extractionAdditions: string | null;
  idealCandidateProfile: Record<string, unknown> | null;
  structuredJd: StructuredJd | null;
}>;

/**
 * True when the patch actually changes an approval-relevant scoring foundation
 * (weights, context, ideal candidate profile, structured JD) relative to the
 * stored document. A no-op save — e.g. the wizard's saveDraft that always runs
 * right before Approve, or an Approve retry after a timeout — must NOT count as
 * a change, otherwise the retry wipes approved_by/approved_at, re-approves, and
 * triggers a duplicate full rescore.
 */
export function jdBasePatchChangesApprovalFields(
  existing: JDBaseDocument | null,
  patch: JdBaseUpdatePatch,
): boolean {
  if (!existing) {
    return (
      patch.weights != null ||
      patch.context != null ||
      patch.idealCandidateProfile !== undefined ||
      patch.structuredJd !== undefined
    );
  }
  if (patch.weights != null && !jsonValueEquals(patch.weights, existing.weights)) return true;
  if (patch.context != null && patch.context !== existing.context) return true;
  if (
    patch.idealCandidateProfile !== undefined &&
    !jsonValueEquals(patch.idealCandidateProfile, existing.idealCandidateProfile ?? null)
  ) {
    return true;
  }
  if (
    patch.structuredJd !== undefined &&
    !jsonValueEquals(patch.structuredJd, existing.structuredJd ?? null)
  ) {
    return true;
  }
  return false;
}

export async function updateJdBaseDocument(
  supabase: SupabaseClient,
  jobId: string,
  patch: JdBaseUpdatePatch,
): Promise<JDBaseDocument> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.roleTitle != null) update.role_title = patch.roleTitle;
  if (patch.company != null) update.company = patch.company;
  if (patch.context != null) update.context = patch.context;
  if (patch.weights != null) update.weights = patch.weights;
  if (patch.scoreFloor != null) update.score_floor = patch.scoreFloor;
  if (patch.fitThresholds != null) update.fit_thresholds = patch.fitThresholds;
  if (patch.extractionAdditions !== undefined)
    update.extraction_additions = patch.extractionAdditions;
  if (patch.idealCandidateProfile !== undefined)
    update.ideal_candidate_profile = patch.idealCandidateProfile;
  if (patch.structuredJd !== undefined) update.structured_jd = patch.structuredJd;

  // Editing scoring foundations resets approval — forces re-review. Compared against
  // the stored document so an unchanged save (saveDraft-then-approve retry) is a no-op
  // for approval state instead of resetting it and forcing a duplicate rescore.
  const existing = await getJdBaseByJobId(supabase, jobId);
  if (jdBasePatchChangesApprovalFields(existing, patch)) {
    update.approved_by = null;
    update.approved_at = null;
  }

  const { data, error } = await supabase
    .from("jd_base_documents")
    .update(update)
    .eq("job_id", jobId)
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("JD Base document not found");
  const doc = rowToJdBase(data as JdBaseRow);
  if (patch.idealCandidateProfile !== undefined) {
    await maybeSyncFeedbackTemplateFromIdealProfile(supabase, jobId, doc.idealCandidateProfile);
  }
  return doc;
}

/** Mark a JD Base as approved by a hiring manager. Unlocks scoring for this job. */
export async function approveJdBase(
  supabase: SupabaseClient,
  jobId: string,
  userId: string,
  organisationId?: string | null,
): Promise<JDBaseDocument> {
  const existing = await getJdBaseByJobId(supabase, jobId);
  const nextVersion = (existing?.version ?? 1) + 1;

  const { data, error } = await supabase
    .from("jd_base_documents")
    .update({
      approved_by: userId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: nextVersion,
    })
    .eq("job_id", jobId)
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("JD Base document not found");
  const doc = rowToJdBase(data as JdBaseRow);

  if (await isStructuredJdEnabled(organisationId)) {
    // When no structured JD exists yet, fall back to the ideal candidate profile so
    // approval never syncs an empty requirement set (which would wipe jd_requirements).
    const structured: StructuredJd = doc.structuredJd
      ? doc.structuredJd
      : doc.idealCandidateProfile?.must_haves?.length
        ? {
            must_haves: doc.idealCandidateProfile.must_haves,
            need_to_haves: [],
            nice_to_haves: doc.idealCandidateProfile.nice_to_haves ?? [],
            responsibilities: [],
            role_basics: {},
          }
        : {
            must_haves: [],
            need_to_haves: [],
            nice_to_haves: [],
            responsibilities: [],
            role_basics: {},
          };
    await syncJdRequirementsFromStructuredJd(supabase, doc.id, structured);
  } else if (doc.idealCandidateProfile?.must_haves?.length) {
    await syncJdRequirementsFromStructuredJd(supabase, doc.id, {
      must_haves: doc.idealCandidateProfile.must_haves,
      need_to_haves: [],
      nice_to_haves: doc.idealCandidateProfile.nice_to_haves ?? [],
      responsibilities: [],
      role_basics: {},
    });
  }

  const { deriveGatingPrescreenQuestionsIfEmpty } =
    await import("@/lib/screening/whatsapp-screening-setup");
  await deriveGatingPrescreenQuestionsIfEmpty(supabase, doc.id);

  return doc;
}
