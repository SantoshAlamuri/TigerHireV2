export class HybridFitScoreError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "no_jd_base"
      | "jd_base_not_approved"
      | "extraction_parse"
      | "extraction_invalid"
      | "merged_extraction_verdict_failed",
    public readonly rawLlmText?: string,
  ) {
    super(message);
    this.name = "HybridFitScoreError";
  }
}
