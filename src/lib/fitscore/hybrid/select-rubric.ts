import { findBestIndiaTemplate, type IndiaJdTemplate } from "./jd-india-templates";
import { recordRubricSelectedMetric } from "../observability/scoring-metrics";

export type RubricSelectionResult = {
  template: IndiaJdTemplate | null;
  rubricId: string;
  role: string;
  matchScore: number;
  fallbackUsed: boolean;
};

const GENERIC_RUBRIC_ID = "template-generic";

/**
 * Select the best India JD template for a job description blob.
 * Thin wrapper around findBestIndiaTemplate with observability.
 */
export function selectRubric(jdBlob: string): RubricSelectionResult {
  const match = findBestIndiaTemplate(jdBlob);

  if (match) {
    recordRubricSelectedMetric({
      rubricId: match.template.id,
      role: match.template.roleTitle,
      fallbackUsed: false,
    });
    return {
      template: match.template,
      rubricId: match.template.id,
      role: match.template.roleTitle,
      matchScore: match.score,
      fallbackUsed: false,
    };
  }

  recordRubricSelectedMetric({
    rubricId: GENERIC_RUBRIC_ID,
    role: "generic",
    fallbackUsed: true,
  });
  return {
    template: null,
    rubricId: GENERIC_RUBRIC_ID,
    role: "generic",
    matchScore: 0,
    fallbackUsed: true,
  };
}
