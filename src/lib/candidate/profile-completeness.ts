/**
 * Candidate-facing profile completeness.
 *
 * Distinct from deriveProfileCompleteness() in src/lib/fitscore (which is
 * scoring-side and needs parsed résumé text). This one is field-based so the
 * candidate dashboard, the onboarding progress bar and the "finish your profile"
 * checklist can all read the same numbers and link to the right onboarding step.
 */

/** localStorage flag set when a candidate skips/finishes onboarding, so the
 * dashboard stops auto-routing them into it. */
export const CANDIDATE_ONBOARDING_DISMISS_KEY = "th.candidateOnboarding.dismissed";

export type OnboardingStepKey = "resume" | "basics" | "skills" | "preferences";

export interface CompletenessInput {
  fullName?: string | null;
  roleTitle?: string | null;
  location?: string | null;
  skills?: string[] | null;
  experienceYears?: number | null;
  resumeUrl?: string | null;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
  githubUrl?: string | null;
  hasPreferences?: boolean;
}

export interface CompletenessItem {
  key: string;
  label: string;
  step: OnboardingStepKey;
  weight: number;
  done: boolean;
  /** Required items gate "setup complete"; optional ones only raise the %. */
  required: boolean;
}

export interface CompletenessResult {
  pct: number;
  items: CompletenessItem[];
  missing: CompletenessItem[];
  /** All required items satisfied — used to stop the dashboard nudge once the
   * substantive profile is done, so optional extras (links) don't nag forever. */
  setupComplete: boolean;
  requiredMissing: CompletenessItem[];
}

function nonEmpty(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function candidateProfileCompleteness(input: CompletenessInput): CompletenessResult {
  const items: CompletenessItem[] = [
    {
      key: "resume",
      label: "Upload your résumé",
      step: "resume",
      weight: 25,
      required: true,
      done: nonEmpty(input.resumeUrl),
    },
    {
      key: "basics",
      label: "Add your role and location",
      step: "basics",
      weight: 20,
      required: true,
      done: nonEmpty(input.fullName) && nonEmpty(input.roleTitle) && nonEmpty(input.location),
    },
    {
      key: "skills",
      label: "Confirm your skills",
      step: "skills",
      weight: 20,
      required: true,
      done: (input.skills?.length ?? 0) > 0,
    },
    {
      key: "experience",
      label: "Set your experience",
      step: "basics",
      weight: 15,
      required: true,
      done: input.experienceYears != null && input.experienceYears > 0,
    },
    {
      key: "preferences",
      label: "Tell us what you want",
      step: "preferences",
      weight: 10,
      required: false,
      done: input.hasPreferences === true,
    },
    {
      key: "links",
      label: "Add a profile link",
      step: "basics",
      weight: 10,
      required: false,
      done:
        nonEmpty(input.linkedinUrl) || nonEmpty(input.portfolioUrl) || nonEmpty(input.githubUrl),
    },
  ];

  const earned = items.reduce((sum, item) => sum + (item.done ? item.weight : 0), 0);
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const pct = total === 0 ? 0 : Math.round((earned / total) * 100);
  const requiredMissing = items.filter((item) => item.required && !item.done);

  return {
    pct,
    items,
    missing: items.filter((item) => !item.done),
    requiredMissing,
    setupComplete: requiredMissing.length === 0,
  };
}
