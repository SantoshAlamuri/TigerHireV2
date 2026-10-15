import { callClaude, extractJsonObject } from "@/lib/services/anthropic";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { nanoid } from "nanoid";
import type { JdSection, DynamicJdSections } from "@/components/dashboard/JDWizard/types";
import { normalizeSections, toDynamicJdSections } from "@/lib/jobs/normalize-sections";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SkillCriterion {
  skill: string;
  weight: number; // 1-10
  description: string;
}

export interface ScoringRubric {
  mustHaves: SkillCriterion[];
  niceToHaves: SkillCriterion[];
  scoringCriteria: {
    dimensionName: string;
    weight: number; // percentage, all should sum to 100
    description: string;
  }[];
  idealCandidateProfile: string;
  redFlagIndicators: string[];
}

export interface JdIntelligenceResult {
  jobId: string;
  rubric: ScoringRubric;
  sectionsUpdated: boolean;
}

/* ------------------------------------------------------------------ */
/*  Agent                                                              */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are a recruitment intelligence agent. Given a job title and description, you generate a structured skills rubric that hiring teams use to evaluate candidates objectively.

Return ONLY valid JSON matching this exact schema:
{
  "mustHaves": [
    { "skill": "skill name", "weight": 1-10, "description": "why this matters" }
  ],
  "niceToHaves": [
    { "skill": "skill name", "weight": 1-10, "description": "why this is a bonus" }
  ],
  "scoringCriteria": [
    { "dimensionName": "dimension", "weight": percentage, "description": "what to evaluate" }
  ],
  "idealCandidateProfile": "2-3 sentence summary of the ideal candidate",
  "redFlagIndicators": ["list of things that should raise concerns"]
}

Rules:
- mustHaves: 4-8 critical skills. Weight 7-10 only.
- niceToHaves: 3-6 bonus skills. Weight 1-6.
- scoringCriteria: 4-6 dimensions whose weights sum to exactly 100.
  Always include: Technical Skills, Experience Relevance, Cultural Fit, Communication.
- redFlagIndicators: 3-5 concrete red flags specific to this role.
- Be specific to the role, not generic. A senior backend engineer rubric should differ from a junior designer rubric.`;

/**
 * Run the JD Intelligence Agent for a given job.
 * Reads the job, calls Claude to generate a rubric, merges it into jd_sections.
 */
export async function runJdIntelligence(jobId: string): Promise<JdIntelligenceResult> {
  const supabase = createSupabaseAdmin();

  // 1. Fetch the job
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, title, description, jd_sections, organisation_id")
    .eq("id", jobId)
    .single();

  if (jobErr || !job) {
    throw new Error(jobErr?.message ?? "Job not found");
  }

  if (!job.title && !job.description) {
    throw new Error("Job has no title or description to analyse");
  }

  // 2. Call Claude to generate the rubric
  const userMessage = `Job Title: ${job.title ?? "Untitled"}\n\nJob Description:\n${job.description ?? "No description provided."}`;

  logger.info("[jd-intelligence] generating rubric", { jobId });
  const response = await callClaude({
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    label: "jd-intelligence",
    jobId,
    organisationId: (job.organisation_id as string | null) ?? undefined,
  });

  const rubric = extractJsonObject(response.text, "jd-intelligence") as ScoringRubric;

  // 3. Validate rubric shape
  if (!Array.isArray(rubric.mustHaves) || !Array.isArray(rubric.niceToHaves)) {
    throw new Error("jd-intelligence: invalid rubric structure from Claude");
  }

  // 4. Merge rubric into jd_sections — add rubric-specific sections without clobbering existing ones
  const existingSections = normalizeSections(job.jd_sections);

  const rubricSections: JdSection[] = [
    {
      id: nanoid(8),
      label: "Must-Have Skills (AI Rubric)",
      type: "tags",
      value: rubric.mustHaves.map((s) => s.skill),
    },
    {
      id: nanoid(8),
      label: "Nice-to-Have Skills (AI Rubric)",
      type: "tags",
      value: rubric.niceToHaves.map((s) => s.skill),
    },
    {
      id: nanoid(8),
      label: "Ideal Candidate Profile",
      type: "text",
      value: rubric.idealCandidateProfile,
    },
    {
      id: nanoid(8),
      label: "Red Flag Indicators",
      type: "list",
      value: rubric.redFlagIndicators,
    },
  ];

  // Remove any previous AI rubric sections to avoid duplicates
  const rubricLabels = new Set(rubricSections.map((s) => s.label));
  const filtered = existingSections.filter((s) => !rubricLabels.has(s.label));
  const merged = [...filtered, ...rubricSections];

  const updatedSections: DynamicJdSections = toDynamicJdSections(merged);

  // 5. Save rubric as dedicated column + update jd_sections
  const { error: updateErr } = await supabase
    .from("jobs")
    .update({
      jd_sections: updatedSections,
      // Store full rubric in skills_rubric for downstream agents (Screening Agent reads this)
      skills_rubric: rubric,
    })
    .eq("id", jobId);

  if (updateErr) {
    logger.error("[jd-intelligence] failed to save rubric", { jobId, error: updateErr.message });
    throw new Error(`Failed to save rubric: ${updateErr.message}`);
  }

  logger.info("[jd-intelligence] rubric saved", {
    jobId,
    mustHaves: rubric.mustHaves.length,
    niceToHaves: rubric.niceToHaves.length,
  });

  return { jobId, rubric, sectionsUpdated: true };
}
