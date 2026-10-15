/** Origin of a FitScore scoring invocation (logged on cost events and dedupe skips). */
export type FitScoreScoringSource =
  | "upload"
  | "api"
  | "tryout"
  | "rescore"
  | "script"
  | "investigation"
  | "idibu"
  | "agency_upload";

export const FITSCORE_DEDUPE_WINDOW_MS = 4 * 60 * 60 * 1000;

/** Stale in_progress lock — allow a new worker after this age. */
export const FITSCORE_SCORING_LOCK_STALE_MS = 2 * 60 * 1000;
