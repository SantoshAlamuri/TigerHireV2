export const COUNTRY_CODES = [
  { code: "+91", label: "India" },
  { code: "+1", label: "United States/Canada" },
  { code: "+44", label: "United Kingdom" },
  { code: "+61", label: "Australia" },
  { code: "+65", label: "Singapore" },
  { code: "+971", label: "UAE" },
] as const;

export const REMOTE_OPTIONS = ["any", "remote", "hybrid", "onsite"] as const;

export const STEP_ORDER = ["resume", "basics", "skills", "preferences", "verify", "done"] as const;
export type StepKey = (typeof STEP_ORDER)[number];
export const STEP_LABELS: Record<StepKey, string> = {
  resume: "Résumé",
  basics: "Basics",
  skills: "Skills",
  preferences: "Preferences",
  verify: "Verify",
  done: "Done",
};

export const inputClass =
  "w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] focus-ring";
