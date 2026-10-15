import { callClaude, extractJsonObject } from "@/lib/services/anthropic";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import type { ScoringRubric } from "./jd-intelligence";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ScreeningResult {
  candidateId: string;
  jobId: string;
  overallScore: number;
  band: string;
  greenFlags: string[];
  redFlags: string[];
  amberFlags: string[];
  interviewAngles: string[];
  summary: string;
  alreadyExisted: boolean;
}

/* ------------------------------------------------------------------ */
/*  Agent                                                              */
/* ------------------------------------------------------------------ */

function scoreToBand(score: number): string {
  if (score >= 85) return "Strong Fit";
  if (score >= 70) return "Good Fit";
  if (score >= 50) return "Moderate Fit";
  if (score >= 30) return "Weak Fit";
  return "Not a Fit";
}

const SYSTEM_PROMPT = `You are a recruitment screening agent. Given a job's skills rubric and a candidate's CV, evaluate the candidate objectively.

Return ONLY valid JSON:
{
  "overallScore": 0-100,
  "greenFlags": ["positive signal 1", "positive signal 2"],
  "redFlags": ["concern 1"],
  "amberFlags": ["area to probe 1"],
  "interviewAngles": ["question/topic to explore in interview"],
  "summary": "2-3 sentence assessment"
}

Scoring rules:
- Score against the rubric's must-haves (high weight) and nice-to-haves (lower weight)
- Use the scoring criteria dimensions and their weights
- greenFlags: concrete evidence of skill/experience match (cite specifics from CV)
- redFlags: missing must-haves, red flag indicators from rubric, gaps
- amberFlags: areas that need clarification or could go either way
- interviewAngles: specific questions to validate ambiguous signals
- Be specific, not generic. Reference actual content from the CV.`;

/**
 * Run the Screening Agent for a candidate-job pair.
 * If a fit_score already exists, returns it. Otherwise generates a new one using the rubric.
 */
export async function runScreening(
  candidateId: string,
  jobId: string,
  options?: { forceRescore?: boolean },
): Promise<ScreeningResult> {
  const supabase = createSupabaseAdmin();

  // 1. Check for existing score (unless force rescore)
  if (!options?.forceRescore) {
    const { data: existing } = await supabase
      .from("fit_scores")
      .select("overall_score, band, green_flags, red_flags, amber_flags, interview_angles, summary")
      .eq("job_id", jobId)
      .eq("candidate_id", candidateId)
      .single();

    if (existing) {
      logger.info("[screening] returning existing score", { candidateId, jobId });
      return {
        candidateId,
        jobId,
        overallScore: existing.overall_score,
        band: existing.band ?? scoreToBand(existing.overall_score),
        greenFlags: existing.green_flags ?? [],
        redFlags: existing.red_flags ?? [],
        amberFlags: existing.amber_flags ?? [],
        interviewAngles: existing.interview_angles ?? [],
        summary: existing.summary ?? "",
        alreadyExisted: true,
      };
    }
  }

  // 2. Fetch job with rubric + candidate CV
  const [jobRes, candidateRes] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, description, skills_rubric, jd_sections, organisation_id")
      .eq("id", jobId)
      .single(),
    supabase
      .from("candidates")
      .select("id, cv_raw_text, name, skills")
      .eq("id", candidateId)
      .single(),
  ]);

  if (jobRes.error || !jobRes.data) throw new Error("Job not found");
  if (candidateRes.error || !candidateRes.data) throw new Error("Candidate not found");

  const job = jobRes.data;
  const candidate = candidateRes.data;

  if (!candidate.cv_raw_text) {
    throw new Error("Candidate has no CV text for screening");
  }

  // 3. Build the prompt with rubric context
  const rubric = job.skills_rubric as ScoringRubric | null;
  let rubricContext: string;

  if (rubric?.mustHaves) {
    rubricContext = `## Skills Rubric
### Must-Haves (high weight):
${rubric.mustHaves.map((s) => `- ${s.skill} (weight: ${s.weight}/10): ${s.description}`).join("\n")}

### Nice-to-Haves (lower weight):
${rubric.niceToHaves.map((s) => `- ${s.skill} (weight: ${s.weight}/10): ${s.description}`).join("\n")}

### Scoring Dimensions:
${rubric.scoringCriteria.map((d) => `- ${d.dimensionName} (${d.weight}%): ${d.description}`).join("\n")}

### Red Flag Indicators:
${rubric.redFlagIndicators.map((r) => `- ${r}`).join("\n")}

### Ideal Candidate: ${rubric.idealCandidateProfile}`;
  } else {
    // Fallback: use job description directly
    rubricContext = `## Job Description\n${job.description ?? "No description available."}`;
  }

  const cvText =
    (candidate.cv_raw_text as string).length > 15000
      ? (candidate.cv_raw_text as string).slice(0, 15000) + "\n[...truncated]"
      : (candidate.cv_raw_text as string);

  const userMessage = `## Job: ${job.title ?? "Untitled"}

${rubricContext}

---

## Candidate CV:
${cvText}`;

  // 4. Call Claude
  logger.info("[screening] scoring candidate", { candidateId, jobId, hasRubric: !!rubric });
  const response = await callClaude({
    max_tokens: 1536,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    label: "screening-agent",
    temperature: 0.2,
    jobId,
    candidateId,
    organisationId: (job.organisation_id as string | null) ?? undefined,
  });

  const result = extractJsonObject(response.text, "screening-agent") as {
    overallScore: number;
    greenFlags: string[];
    redFlags: string[];
    amberFlags: string[];
    interviewAngles: string[];
    summary: string;
  };

  const band = scoreToBand(result.overallScore);

  // 5. Save to fit_scores — check if row exists, then update or insert
  // Clear criterion-level fields from any prior FitScore pipeline run. The screening agent only
  // returns an overall + flags; leaving old criteria_breakdown/dimensions causes 0% bars vs a new overall.
  const scorePayload = {
    job_id: jobId,
    candidate_id: candidateId,
    overall_score: result.overallScore,
    band,
    green_flags: result.greenFlags,
    red_flags: result.redFlags,
    amber_flags: result.amberFlags,
    interview_angles: result.interviewAngles,
    summary: result.summary,
    ai_recommendation:
      result.overallScore >= 70 ? "Recommend for interview" : "Review before proceeding",
    rubric_snapshot: rubric ?? null,
    criteria_breakdown: null,
    dimensions: null,
  };

  const { data: existingRow } = await supabase
    .from("fit_scores")
    .select("id")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .maybeSingle();

  const { error: saveErr } = existingRow
    ? await supabase.from("fit_scores").update(scorePayload).eq("id", existingRow.id)
    : await supabase.from("fit_scores").insert(scorePayload);

  if (saveErr) {
    logger.error("[screening] failed to save score", {
      candidateId,
      jobId,
      error: saveErr.message,
    });
    throw new Error(`Failed to save screening score: ${saveErr.message}`);
  }

  logger.info("[screening] complete", { candidateId, jobId, score: result.overallScore, band });

  return {
    candidateId,
    jobId,
    overallScore: result.overallScore,
    band,
    greenFlags: result.greenFlags,
    redFlags: result.redFlags,
    amberFlags: result.amberFlags,
    interviewAngles: result.interviewAngles,
    summary: result.summary,
    alreadyExisted: false,
  };
}
