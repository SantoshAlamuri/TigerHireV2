import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { getOrganisationEntitlement } from "@/lib/entitlements";
import { compareCtcToBand } from "@/lib/offers/compensation-band-math";
import { parseOfferCtcValue } from "@/lib/offers/compensation-normalize";

export type CompensationBand = {
  id: string;
  organisation_id: string;
  label: string;
  currency: string;
  min_amount: number;
  max_amount: number;
  is_active: boolean;
};

export type BandCheckResult =
  | "within_band"
  | "outside_band"
  | "no_band"
  | "bands_disabled"
  // A band WAS selected but the check could not be completed (DB error, band row
  // with non-finite bounds, or an unparseable CTC). Distinct from "no_band" so
  // the guardrail fails CLOSED instead of silently waving the offer through.
  | "band_check_error";

export interface CheckCompensationBandResult {
  result: BandCheckResult;
  band?: CompensationBand;
  offeredAmount?: number;
  currency?: string;
  deviation?: number;
}

function parseCtcFromCompensationJson(compensationJson: unknown): number | null {
  if (
    !compensationJson ||
    typeof compensationJson !== "object" ||
    Array.isArray(compensationJson)
  ) {
    return null;
  }
  return parseOfferCtcValue((compensationJson as Record<string, unknown>).ctc);
}

export { compareCtcToBand, deviationFromBand } from "@/lib/offers/compensation-band-math";

/**
 * B7: validate offer comp against an optional org band when the entitlement is on.
 */
export async function checkCompensationBand(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    bandId?: string | null;
    compensationJson: unknown;
  },
): Promise<CheckCompensationBandResult> {
  const { organisationId, bandId, compensationJson } = params;

  const entitlement = await getOrganisationEntitlement(organisationId, "compensation_bands");
  if (!entitlement.allowed) {
    return { result: "bands_disabled" };
  }

  if (!bandId) {
    return { result: "no_band" };
  }

  const { data: row, error } = await supabase
    .from("compensation_bands")
    .select("id, organisation_id, label, currency, min_amount, max_amount, is_active")
    .eq("id", bandId)
    .eq("organisation_id", organisationId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    // Band was selected but we couldn't read it — fail closed, don't pretend
    // there's no band to gate against.
    logger.error("checkCompensationBand: band query failed — failing closed", {
      error: error.message,
      bandId,
    });
    return { result: "band_check_error" };
  }
  if (!row) {
    logger.warn("checkCompensationBand: band not found or inactive", { bandId, organisationId });
    return { result: "no_band" };
  }

  const band: CompensationBand = {
    id: row.id as string,
    organisation_id: row.organisation_id as string,
    label: row.label as string,
    currency: row.currency as string,
    min_amount: Number(row.min_amount),
    max_amount: Number(row.max_amount),
    is_active: Boolean(row.is_active),
  };

  if (!Number.isFinite(band.min_amount) || !Number.isFinite(band.max_amount)) {
    logger.error("checkCompensationBand: band has non-finite bounds — failing closed", {
      bandId,
      organisationId,
    });
    return { result: "band_check_error", band, currency: band.currency };
  }

  const ctc = parseCtcFromCompensationJson(compensationJson);
  if (ctc === null) {
    // A band is selected but the offered CTC can't be parsed — cannot prove the
    // offer is within band, so fail closed rather than silently passing.
    logger.error(
      "checkCompensationBand: missing or invalid ctc with a band selected — failing closed",
    );
    return { result: "band_check_error", band, currency: band.currency };
  }

  const { within, deviation } = compareCtcToBand(ctc, band);
  if (within) {
    return {
      result: "within_band",
      band,
      offeredAmount: ctc,
      currency: band.currency,
      deviation: 0,
    };
  }

  return {
    result: "outside_band",
    band,
    offeredAmount: ctc,
    currency: band.currency,
    deviation,
  };
}

export type ResolveOfferBandMetadataResult =
  | { ok: true; bandStatus: string; bandExceptionReason: string | null }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Map band check + exception reason to persisted `band_status` / `band_exception_reason`
 * (same rules as POST /api/offers).
 */
export async function resolveOfferBandMetadata(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    bandId?: string | null;
    compensationJson: unknown;
    bandExceptionReason?: string | null;
  },
): Promise<ResolveOfferBandMetadataResult> {
  const bandCheck = await checkCompensationBand(supabase, {
    organisationId: params.organisationId,
    bandId: params.bandId,
    compensationJson: params.compensationJson,
  });

  const trimmedReason = (params.bandExceptionReason ?? "").trim();

  if (bandCheck.result === "outside_band") {
    if (!trimmedReason) {
      const b = bandCheck.band;
      if (!b || bandCheck.deviation === undefined) {
        return {
          ok: false,
          status: 400,
          body: {
            error: "Compensation is outside the selected band; a reason is required.",
          },
        };
      }
      return {
        ok: false,
        status: 400,
        body: {
          error: "compensation_outside_band",
          band: {
            label: b.label,
            min: b.min_amount,
            max: b.max_amount,
            currency: b.currency,
          },
          deviation: Math.round((bandCheck.deviation ?? 0) * 100) / 100,
          requiresReason: true,
        },
      };
    }
    return { ok: true, bandStatus: "exception_pending", bandExceptionReason: trimmedReason };
  }

  if (bandCheck.result === "within_band") {
    return { ok: true, bandStatus: "within_band", bandExceptionReason: null };
  }

  // The band check could not be completed. Fail closed: block unless a human has
  // supplied an explicit exception reason (same posture as outside_band).
  if (bandCheck.result === "band_check_error") {
    if (!trimmedReason) {
      return {
        ok: false,
        status: 422,
        body: {
          error: "compensation_band_check_failed",
          message:
            "Could not verify the offer against the selected compensation band. Provide an exception reason to proceed.",
          requiresReason: true,
        },
      };
    }
    return { ok: true, bandStatus: "exception_pending", bandExceptionReason: trimmedReason };
  }

  return {
    ok: true,
    bandStatus: bandCheck.result,
    bandExceptionReason: null,
  };
}
