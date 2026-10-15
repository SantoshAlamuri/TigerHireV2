import type { FitScoreScoringSource } from "./scoring-source";

/** Passed through hybrid pipeline → callClaude → platform_cost_events.metadata.source */
export type FitScoreCostAttribution = {
  jobId?: string;
  candidateId?: string;
  organisationId?: string;
  scoringSource?: FitScoreScoringSource;
  /** Resolved extraction model (ff_haiku_extraction / tryout). */
  extractionModel?: string;
};
