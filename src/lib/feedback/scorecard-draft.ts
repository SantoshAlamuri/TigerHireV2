import { z } from "zod";
import { MODELS } from "@/lib/config/models";
import { callClaude, extractJsonObject } from "@/lib/services/anthropic";
import { ratingScaleFor, type ScorecardField } from "@/lib/feedback/scorecard";

/**
 * Draft an interview scorecard from a notetaker transcript. The model maps the transcript to the
 * scorecard's competencies and proposes a rating/text value + a verbatim evidence quote for each,
 * plus an overall recommendation. This is ALWAYS a draft the interviewer reviews and submits —
 * nothing here writes feedback. The evidence quote is surfaced in the UI so suggestions are
 * accountable, not rubber-stamped.
 */

const RECOMMENDATIONS = ["strong_hire", "hire", "no_hire", "strong_no_hire"] as const;
type Recommendation = (typeof RECOMMENDATIONS)[number];

/** Form-ready: number = 1-based scale index for rating/yes_no; string for text/select. */
export interface ScorecardDraftField {
  label: string;
  value: number | string;
  evidence?: string;
}
export interface ScorecardDraft {
  fields: ScorecardDraftField[];
  recommendation?: Recommendation;
  overall_rating?: number;
  notes?: string;
}

const draftSchema = z.object({
  fields: z.array(
    z.object({ label: z.string(), value: z.string(), evidence: z.string().optional() }),
  ),
  recommendation: z.enum(RECOMMENDATIONS).optional(),
  notes: z.string().optional(),
});

const OVERALL_BY_REC: Record<Recommendation, number> = {
  strong_hire: 5,
  hire: 4,
  no_hire: 2,
  strong_no_hire: 1,
};

function buildPrompt(roleTitle: string, fields: ScorecardField[], transcript: string): string {
  const competencies = fields
    .map((f) => {
      const scale = ratingScaleFor(f);
      const kind = scale
        ? `rating — choose exactly one of: ${scale.join(" | ")}`
        : f.type === "select"
          ? `select — choose one of: ${(f.options ?? []).join(" | ")}`
          : "free text (1–2 sentences)";
      return `- "${f.label}" (${kind})${f.guidance ? ` — guidance: ${f.guidance}` : ""}`;
    })
    .join("\n");

  return `You are drafting an interview scorecard for the role "${roleTitle}" from the interview transcript below. Base EVERY answer strictly on what the transcript shows — never invent. If a competency was not assessed in this interview, set its value to "" (empty string).

Competencies to fill:
${competencies}

For each competency, also give a short VERBATIM "evidence" quote (max 140 chars) from the transcript that supports the value (omit evidence when value is empty). Then give an overall "recommendation" — exactly one of: strong_hire, hire, no_hire, strong_no_hire — and 2–3 sentence "notes" summarising the interview.

Return JSON only, no markdown:
{
  "fields": [ { "label": "<exact competency label>", "value": "<chosen scale label, or text, or empty>", "evidence": "<verbatim quote>" } ],
  "recommendation": "hire",
  "notes": "..."
}

Transcript:
${transcript}`;
}

export async function draftScorecard(args: {
  roleTitle: string;
  fields: ScorecardField[];
  transcript: string;
  attribution?: { jobId?: string; candidateId?: string; organisationId?: string };
}): Promise<ScorecardDraft> {
  const res = await callClaude({
    model: MODELS.HAIKU,
    max_tokens: 2000,
    temperature: 0,
    label: "scorecard-draft-v1",
    jobId: args.attribution?.jobId,
    candidateId: args.attribution?.candidateId,
    organisationId: args.attribution?.organisationId,
    messages: [
      { role: "user", content: buildPrompt(args.roleTitle, args.fields, args.transcript) },
    ],
  });

  const parsed = draftSchema.parse(extractJsonObject(res.text, "scorecard-draft-v1"));
  const byLabel = new Map(args.fields.map((f) => [f.label.toLowerCase(), f]));

  const fields: ScorecardDraftField[] = [];
  for (const item of parsed.fields) {
    const field = byLabel.get(item.label.trim().toLowerCase());
    if (!field) continue;
    const value = item.value?.trim() ?? "";
    if (!value) continue; // not assessed → leave blank for the interviewer
    const scale = ratingScaleFor(field);
    if (scale) {
      const idx = scale.findIndex((s) => s.toLowerCase() === value.toLowerCase());
      if (idx < 0) continue; // model picked an off-scale value — skip rather than guess
      fields.push({
        label: field.label,
        value: idx + 1,
        evidence: item.evidence?.trim() || undefined,
      });
    } else {
      fields.push({ label: field.label, value, evidence: item.evidence?.trim() || undefined });
    }
  }

  return {
    fields,
    recommendation: parsed.recommendation,
    overall_rating: parsed.recommendation ? OVERALL_BY_REC[parsed.recommendation] : undefined,
    notes: parsed.notes?.trim() || undefined,
  };
}
