/**
 * B8: Creating an offer requires the application's job to be tied to a hiring requisition
 * in a state that allows offer work (approved headcount, or already converted to a job).
 */

export const HIRING_REQUEST_STATUSES_ALLOWING_OFFER_DRAFT = new Set(["approved", "converted"]);

export type HiringRequestSummaryForOfferGate = {
  id: string;
  status: string;
  req_code: string | null;
} | null;

export type JobHiringRequestContext = {
  hiringRequestId: string | null | undefined;
  hiringRequest: HiringRequestSummaryForOfferGate;
};

export function hiringRequestGateErrorForOffer(
  params: JobHiringRequestContext,
):
  | { ok: true; hiringRequest: NonNullable<HiringRequestSummaryForOfferGate> }
  | { ok: false; status: number; error: string } {
  const hiringRequestId =
    params.hiringRequestId === undefined || params.hiringRequestId === null
      ? null
      : String(params.hiringRequestId).trim() || null;

  if (!hiringRequestId) {
    return {
      ok: false,
      status: 400,
      error:
        "This job is not linked to a hiring requisition. Link an approved requisition to the job before creating an offer.",
    };
  }

  const hr = params.hiringRequest;
  if (!hr?.id) {
    return {
      ok: false,
      status: 400,
      error: "The hiring requisition linked to this job could not be loaded.",
    };
  }

  if (!HIRING_REQUEST_STATUSES_ALLOWING_OFFER_DRAFT.has(hr.status)) {
    return {
      ok: false,
      status: 400,
      error: `Offers can only be created when the hiring requisition is approved or converted (current status: ${hr.status}).`,
    };
  }

  return { ok: true, hiringRequest: hr };
}
