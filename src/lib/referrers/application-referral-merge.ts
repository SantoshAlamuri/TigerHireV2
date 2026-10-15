/**
 * First-touch referral attribution for applications: once referral columns are set
 * for (candidate_id, job_id), later applies must not overwrite them.
 */

export type ApplicationReferralFields = {
  referral_link_id: string | null;
  direct_referrer_id: string | null;
  parent_referrer_id: string | null;
};

export type ReferralResolutionInput = {
  referralLinkId: string;
  directReferrerId: string;
  parentReferrerId: string | null;
};

function hasReferralAttribution(existing: ApplicationReferralFields | null): boolean {
  if (!existing) return false;
  return (
    existing.referral_link_id != null ||
    existing.direct_referrer_id != null ||
    existing.parent_referrer_id != null
  );
}

/**
 * Returns the referral triple to persist on upsert.
 * - If any referral field was already set, keep the entire existing triple.
 * - Otherwise use incoming resolution when present, else all null.
 */
export function mergeApplicationReferralFields(
  existing: ApplicationReferralFields | null,
  incoming: ReferralResolutionInput | null,
): ApplicationReferralFields {
  if (hasReferralAttribution(existing)) {
    return {
      referral_link_id: existing!.referral_link_id,
      direct_referrer_id: existing!.direct_referrer_id,
      parent_referrer_id: existing!.parent_referrer_id,
    };
  }
  if (incoming) {
    return {
      referral_link_id: incoming.referralLinkId,
      direct_referrer_id: incoming.directReferrerId,
      parent_referrer_id: incoming.parentReferrerId,
    };
  }
  return {
    referral_link_id: null,
    direct_referrer_id: null,
    parent_referrer_id: null,
  };
}
