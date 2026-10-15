"use client";

import type { JobPosting } from "@/types";

function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

/** Green pill when `job_referral_config.direct_bonus_amount` &gt; 0. */
export function JobReferralBonusBadge({ job }: { job: JobPosting }) {
  const amt = job.referralDirectBonusAmount;
  if (amt == null || !Number.isFinite(amt) || amt <= 0) return null;
  return (
    <span className="mt-1.5 inline-flex w-fit items-center rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
      {formatInr(amt)} referral bonus
    </span>
  );
}
