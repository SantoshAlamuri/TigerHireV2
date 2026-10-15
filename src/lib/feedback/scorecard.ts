import { z } from "zod";

/**
 * Greenhouse-style interview scorecard model.
 *
 * A template is a list of competencies (fields). Rating competencies use an ordered scale
 * (worst → best); the default is the 4-point Strong-No → Strong-Yes scale. Competencies are
 * grouped into "Focus areas" (the few attributes this interview is responsible for) and
 * "Other" (nice-to-haves / open notes), and each can carry interviewer guidance.
 *
 * Stored in feedback_form_templates.fields (jsonb). Backward compatible with legacy fields that
 * have only { label, type } — a rating field with no `scale` renders as the legacy 1–5 stars.
 */

export type ScorecardFieldType = "rating" | "yes_no" | "text" | "select";
/** Free-text category used to group competencies (e.g. "Focus area", "Technical skills"). */
export type ScorecardGroup = string;

/** Suggested categories surfaced in the editor; users can also type their own. */
export const SCORECARD_GROUP_SUGGESTIONS = [
  "Focus area",
  "Technical skills",
  "Problem solving",
  "Communication",
  "Leadership",
  "Culture & values",
  "Other",
] as const;

export interface ScorecardField {
  label: string;
  type: ScorecardFieldType;
  /** Category for grouping competencies (free text). Defaults to "Focus area". */
  group?: ScorecardGroup;
  /** Interviewer guidance shown under the competency on the scorecard. */
  guidance?: string;
  required?: boolean;
  /** Choices for a `select` field. */
  options?: string[];
  /** Ordered labels (worst → best) for a `rating` field. Absent → legacy 1–5 stars. */
  scale?: string[];
}

/** The 4-point recommendation scale (worst → best). */
export const RATING_SCALE_4 = ["Strong No", "No", "Yes", "Strong Yes"] as const;
export const YES_NO_SCALE = ["No", "Yes"] as const;

export const scorecardFieldSchema = z.object({
  label: z.string().trim().min(1, "Competency label is required").max(200),
  type: z.enum(["rating", "yes_no", "text", "select"]),
  group: z.string().trim().max(60).optional(),
  guidance: z.string().trim().max(2000).optional(),
  required: z.boolean().optional(),
  options: z.array(z.string().trim().min(1)).max(20).optional(),
  scale: z.array(z.string().trim().min(1)).min(2).max(7).optional(),
});

export const scorecardFieldsSchema = z
  .array(scorecardFieldSchema)
  .min(1, "Add at least one competency")
  .max(40);

export type ScorecardFieldInput = z.infer<typeof scorecardFieldSchema>;

/** Greenhouse-style default preset for a new scorecard. */
export const GREENHOUSE_SCORECARD_PRESET: { defaultName: string; fields: ScorecardField[] } = {
  defaultName: "Interview Scorecard",
  fields: [
    {
      label: "Role-specific skills",
      type: "rating",
      group: "Focus area",
      scale: [...RATING_SCALE_4],
      guidance: "Depth and relevance of the skills this role actually needs.",
      required: true,
    },
    {
      label: "Problem solving",
      type: "rating",
      group: "Focus area",
      scale: [...RATING_SCALE_4],
      required: true,
    },
    {
      label: "Communication",
      type: "rating",
      group: "Focus area",
      scale: [...RATING_SCALE_4],
    },
    {
      label: "Culture & values add",
      type: "rating",
      group: "Other",
      scale: [...RATING_SCALE_4],
    },
    { label: "Strengths", type: "text", group: "Other" },
    { label: "Concerns / risks", type: "text", group: "Other" },
  ],
};

/**
 * Resolve the rating scale to render for a field:
 * - yes_no → ["No","Yes"]
 * - rating with an explicit scale → that scale
 * - rating without a scale → null (caller falls back to legacy 1–5 stars)
 * - non-rating → null
 */
export function ratingScaleFor(field: Pick<ScorecardField, "type" | "scale">): string[] | null {
  if (field.type === "yes_no") return [...YES_NO_SCALE];
  if (field.type === "rating" && field.scale && field.scale.length >= 2) return field.scale;
  return null;
}

export function fieldGroup(field: Pick<ScorecardField, "group">): string {
  return field.group?.trim() || "Focus area";
}

/* ── Simple editor: prebuilt feedback types + competency library ────────────────────────── */

/** The handful of feedback types a user picks from — the scales are prebuilt. */
export type FeedbackTypeId = "scale4" | "scale5" | "yes_no" | "text";

export const FEEDBACK_TYPE_OPTIONS: { id: FeedbackTypeId; label: string }[] = [
  { id: "scale4", label: "Rating · Strong No → Strong Yes" },
  { id: "scale5", label: "Rating · 1 to 5" },
  { id: "yes_no", label: "Yes / No" },
  { id: "text", label: "Open text / notes" },
];

const RATING_SCALE_5 = ["1", "2", "3", "4", "5"] as const;

/** Which prebuilt feedback type a stored field corresponds to (for the editor select). */
export function feedbackTypeIdOf(field: Pick<ScorecardField, "type" | "scale">): FeedbackTypeId {
  if (field.type === "yes_no") return "yes_no";
  if (field.type !== "rating") return "text";
  if (field.scale && field.scale.length === 5 && field.scale[0] === "1") return "scale5";
  return "scale4";
}

/** Turn a chosen feedback type into the field's type/scale (prebuilt). */
export function applyFeedbackType(
  id: FeedbackTypeId,
): Pick<ScorecardField, "type" | "scale" | "options"> {
  switch (id) {
    case "scale5":
      return { type: "rating", scale: [...RATING_SCALE_5], options: undefined };
    case "yes_no":
      return { type: "yes_no", scale: undefined, options: undefined };
    case "text":
      return { type: "text", scale: undefined, options: undefined };
    case "scale4":
    default:
      return { type: "rating", scale: [...RATING_SCALE_4], options: undefined };
  }
}

/**
 * Sentiment tone for a rating option at `index` of `total` (worst → best).
 * Used to colour the scale buttons/preview so "Strong No" reads negative and
 * "Strong Yes" reads positive. Position-based, so it works for any scale length.
 */
export type RatingTone = "neg" | "warn" | "mid" | "pos" | "strongpos";
export function ratingToneAt(index: number, total: number): RatingTone {
  if (total <= 1) return "pos";
  const t = index / (total - 1);
  if (t === 0) return "neg";
  if (t < 0.4) return "warn";
  if (t < 0.6) return "mid";
  if (t < 1) return "pos";
  return "strongpos";
}

/** Common competencies offered as quick-pick / autocomplete in the editor. */
export const COMPETENCY_SUGGESTIONS = [
  "Problem solving",
  "Technical depth",
  "System design",
  "Coding / craft",
  "Communication",
  "Collaboration",
  "Ownership & drive",
  "Role-specific skills",
  "Culture & values add",
  "Leadership",
  "Stakeholder management",
  "Strengths",
  "Concerns / risks",
] as const;
