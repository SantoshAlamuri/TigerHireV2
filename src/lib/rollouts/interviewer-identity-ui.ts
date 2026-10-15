/**
 * Client bundle: only `NEXT_PUBLIC_FF_INTERVIEWER_IDENTITY_V1` is inlined here.
 * In production this must be `true` for picker + round ladder; keep it aligned with
 * `FF_INTERVIEWER_IDENTITY_V1` on the server (see `env.ffInterviewerIdentityV1` and `.env.example`).
 */
export function isInterviewerIdentityV1UiEnabled(): boolean {
  const pub = process.env.NEXT_PUBLIC_FF_INTERVIEWER_IDENTITY_V1;
  if (process.env.NODE_ENV === "production") {
    return pub === "true";
  }
  return pub !== "false";
}
