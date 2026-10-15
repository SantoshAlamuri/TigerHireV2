import { redirect } from "next/navigation";

/**
 * `/refer/join` — DEPRECATED 2026-05-12 in favor of consolidated onboarding.
 *
 * Background:
 *   The standalone referrer signup funnel created an asymmetric identity model:
 *   referrer-first users had a `referrers` row but no candidate access (couldn't
 *   apply for jobs themselves), while candidate-first users could refer with no
 *   extra signup. Vouch + payouts hang off `referrers`/`applications` regardless
 *   of how the user arrived, so a single onboarding path is the cleaner fit.
 *
 * Current behaviour:
 *   Redirect to `/register` with `referral_intent=true` plus all incoming search
 *   params preserved. After registration the user lands on the candidate
 *   dashboard, where the "Refer & earn" CTA opens `/dashboard/referrer`. That
 *   page detects `needs_setup` and runs the existing `/api/refer/join` + OTP
 *   flow inline — same APIs, same WhatsApp verification, just at the moment
 *   the user actually intends to use referrer features.
 *
 * Legacy invite links of the form `/refer/join?parent=<referrer_id>` still
 *   work because `parent` (and any other params like `slug`, `ref`, `utm_*`)
 *   are forwarded through to `/register`.
 */
export default async function ReferJoinDeprecatedRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = new URLSearchParams();
  search.set("referral_intent", "true");
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) search.append(key, v);
    } else {
      search.set(key, value);
    }
  }
  redirect(`/register?${search.toString()}`);
}
