import { logger } from "@/lib/observability/logger";
import { createHash } from "crypto";
import type { ReferralRateLimitedReason } from "./types";

export function hashPhoneForMetric(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return createHash("sha256").update(phone, "utf8").digest("hex").slice(0, 16);
}

export function logReferralRateLimitedMetric(input: {
  reason: ReferralRateLimitedReason;
  referrerIdentityKind: "referrers_id" | "phone";
  referrerIdentityKey: string;
  referrerPhone: string;
  candidatePhone?: string | null;
  referralId?: string | null;
}) {
  logger.info("metric.referral_rate_limited", {
    reason: input.reason,
    referrer_identity_kind: input.referrerIdentityKind,
    referrer_identity_key: input.referrerIdentityKey,
    referrer_phone_hash: hashPhoneForMetric(input.referrerPhone),
    candidate_phone_hash: hashPhoneForMetric(input.candidatePhone ?? null),
    referral_id: input.referralId ?? null,
  });
}

export function inferReferrerType(role: unknown): "employee" | "freelancer" {
  const profileRole = String(role ?? "").toLowerCase();
  if (["employee", "recruiter", "leadership", "hiring_manager"].includes(profileRole)) {
    return "employee";
  }
  return "freelancer";
}
