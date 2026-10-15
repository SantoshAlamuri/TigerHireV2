/** Thrown when a candidate cannot submit or re-apply (A3 cooling-off / duplicates). */

export type ApplicationApplyErrorCode =
  | "cooling_off"
  | "already_applied"
  | "hired"
  | "screening_incomplete"
  | "screening_not_passed"
  | "public_apply_invalid_target";

export class ApplicationApplyError extends Error {
  readonly code: ApplicationApplyErrorCode;
  readonly retryAfterIso?: string;

  constructor(message: string, code: ApplicationApplyErrorCode, retryAfterIso?: string) {
    super(message);
    this.name = "ApplicationApplyError";
    this.code = code;
    this.retryAfterIso = retryAfterIso;
  }
}
