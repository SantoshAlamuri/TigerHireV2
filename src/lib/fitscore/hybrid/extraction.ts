/**
 * Stage 2A: dynamic extraction prompt that adapts to the JD Base dimensions.
 */

import { callClaude } from "@/lib/services/anthropic";
import { resolveHybridExtractionModel } from "@/lib/fitscore/resolve-scoring-models";
import type { FitScoreCostAttribution } from "@/lib/fitscore/scoring-attribution";
import type { JDBaseDocument } from "./types";

async function hybridExtractionModel(attribution?: FitScoreCostAttribution): Promise<string> {
  if (attribution?.extractionModel) return attribution.extractionModel;
  return resolveHybridExtractionModel({
    organisationId: attribution?.organisationId,
    scoringSource: attribution?.scoringSource,
  });
}

export function buildExtractionSystemPrompt(): string {
  return `You are an expert technical recruiter evaluating candidates against role-specific dimensions.
Extract structured signals from the resume.

SCORING GUIDANCE (for each dimension):
  8-10: Direct, strong, demonstrated evidence
  5-7:  Relevant adjacent experience
  3-4:  Minimal or indirect exposure
  1-2:  No evidence found

RULES:
1. Score ONLY the dimensions listed in the DIMENSIONS section below
2. red_flags MUST be an array of objects, each with this exact shape: red_flags: [{"flag": "<specific concern>", "severity": "critical|moderate|minor"}]
3. Be GENEROUS with green_flags — list notable strengths as an array of strings: green_flags: ["<specific strength>", ...]
4. quantified_impact = ONLY metrics with actual numbers (strings)
5. role_match_tag = short label for how this candidate matches the role (e.g. "Senior Backend Engineer", "Junior UX with potential", "Career Transitioner")
6. DISTINCTNESS: every red_flags entry and every green_flags entry must be a DISTINCT concern. Never state the same gap twice in different words (e.g. do NOT output both "No Apache Spark exposure" and "No Spark evident despite data engineering context"). If ADDITIONAL EXTRACTION GUIDANCE lists typical red flags, treat them as a checklist — when one applies, emit it ONCE as a single resume-grounded red flag; do not also emit a reworded duplicate. Cap at 5 red_flags and 5 green_flags; fewer is better.

OUTPUT: Valid JSON only. No markdown. No preamble.`;
}

function cacheableBlock(text: string): {
  type: "text";
  text: string;
  cache_control: { type: "ephemeral" };
} {
  return {
    type: "text",
    text,
    cache_control: { type: "ephemeral" },
  };
}

function dimensionsList(weights: Record<string, number>): string {
  return Object.entries(weights)
    .filter(([, w]) => w > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, weight]) => `  ${name} (weight: ${weight}%)`)
    .join("\n");
}

export function buildExtractionStaticContext(jdBase: JDBaseDocument): string {
  const dimKeys = Object.keys(jdBase.weights).filter((k) => jdBase.weights[k] > 0);
  const additions = jdBase.extractionAdditions?.trim();
  const profile = jdBase.idealCandidateProfile;

  let block = `ROLE: ${jdBase.roleTitle} at ${jdBase.company}
CONTEXT: ${jdBase.context}
`;

  if (profile) {
    block += `\nIDEAL CANDIDATE: ${profile.summary}
MUST-HAVES: ${profile.must_haves.join(", ")}
`;
  }

  block += `\nDIMENSIONS TO SCORE (rate each 1-10):
${dimensionsList(jdBase.weights)}
`;
  if (additions) {
    block += `\nADDITIONAL EXTRACTION GUIDANCE:\n${additions}\n`;
  }

  if (profile) {
    block += `\nIDEAL PROFILE SCORING:
ideal_match_pct = what percentage of the ideal candidate profile this person matches (0-100)
ideal_gaps = specific things missing vs the ideal profile (be concrete, list each gap as a separate string)
`;
  }

  block += `\nReturn a single JSON object with keys:
candidate_name, total_years, dimension_scores (object with keys: ${dimKeys.join(", ")}), certifications, quantified_impact, red_flags, green_flags, role_match_tag, summary${profile ? ", ideal_match_pct, ideal_gaps" : ""}`;
  return block;
}

export function buildExtractionCandidateContent(resumeText: string): string {
  return `RESUME TEXT:\n${resumeText.slice(0, 120_000)}`;
}

export async function runHybridExtraction(
  jdBase: JDBaseDocument,
  resumeText: string,
  attribution?: FitScoreCostAttribution,
): Promise<{ text: string; model: string }> {
  const model = await hybridExtractionModel(attribution);
  const res = await callClaude({
    model,
    max_tokens: 4096,
    jobId: attribution?.jobId ?? jdBase.jobId,
    candidateId: attribution?.candidateId,
    organisationId: attribution?.organisationId,
    temperature: 0,
    system: [cacheableBlock(buildExtractionSystemPrompt())],
    messages: [
      {
        role: "user",
        content: [
          cacheableBlock(buildExtractionStaticContext(jdBase)),
          { type: "text", text: buildExtractionCandidateContent(resumeText) },
        ],
      },
    ],
    label: "fitscore-hybrid-extraction",
    scoringSource: attribution?.scoringSource,
  });
  return { text: res.text, model };
}
