import { z } from "zod";
import { MODELS } from "@/lib/config/models";
import { callClaude, extractJsonObject } from "@/lib/services/anthropic";
import { RATING_SCALE_4, type ScorecardField } from "@/lib/feedback/scorecard";

/**
 * Generate a Greenhouse-style set of scorecard competencies from a role's JD Base rubric
 * (scoring dimensions + ICP). Removes the blank-page problem when setting up a scorecard.
 * Returns ScorecardField[] the editor pre-fills — the recruiter reviews and saves.
 */

const genSchema = z.object({
  fields: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        group: z.string().trim().max(60).optional(),
        guidance: z.string().trim().max(400).optional(),
        type: z.enum(["rating", "text"]).optional(),
      }),
    )
    .min(1),
});

export async function generateCompetenciesFromRubric(args: {
  roleTitle: string;
  context?: string | null;
  weights?: Record<string, number> | null;
  idealSummary?: string | null;
  mustHaves?: string[] | null;
  attribution?: { jobId?: string; organisationId?: string };
}): Promise<ScorecardField[]> {
  const dims = args.weights
    ? Object.entries(args.weights)
        .filter(([, w]) => Number(w) > 0)
        .sort(([, a], [, b]) => Number(b) - Number(a))
        .map(([k, w]) => `${k} (${w}%)`)
        .join(", ")
    : "";

  const prompt = `Design a structured interview scorecard for the role "${args.roleTitle}".

Role context: ${(args.context ?? "").slice(0, 1000) || "n/a"}
Scoring dimensions (with weights): ${dims || "n/a"}
Ideal candidate: ${(args.idealSummary ?? "").slice(0, 600) || "n/a"}
Must-haves: ${(args.mustHaves ?? []).slice(0, 12).join("; ") || "n/a"}

Produce 5–7 competencies. They must be MECE — distinct, no overlap, and collectively cover the role. Each needs a concise label, a short "group" CATEGORY for sectioning (e.g. "Focus area", "Technical skills", "Problem solving", "Communication", "Culture & values"), and one line of interviewer guidance (what "good" looks like). Most should be rating competencies; include at most one open-text competency (e.g. "Strengths" or "Concerns / risks"). Return JSON only, no markdown:
{ "fields": [ { "label": "Problem solving", "group": "Technical skills", "guidance": "...", "type": "rating" } ] }`;

  const res = await callClaude({
    model: MODELS.HAIKU,
    max_tokens: 1200,
    temperature: 0.2,
    label: "scorecard-from-rubric-v1",
    jobId: args.attribution?.jobId,
    organisationId: args.attribution?.organisationId,
    messages: [{ role: "user", content: prompt }],
  });

  const parsed = genSchema.parse(extractJsonObject(res.text, "scorecard-from-rubric-v1"));
  return parsed.fields.slice(0, 8).map((f) => {
    const type: ScorecardField["type"] = f.type === "text" ? "text" : "rating";
    const field: ScorecardField = {
      label: f.label.trim(),
      type,
      group: f.group?.trim() || "Focus area",
    };
    if (f.guidance?.trim()) field.guidance = f.guidance.trim();
    if (type === "rating") field.scale = [...RATING_SCALE_4];
    return field;
  });
}
