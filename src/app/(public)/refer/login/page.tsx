import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildForwardUrl } from "@/lib/navigation/forward-search-params";

// Deprecated login alias — never indexable.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Deprecated referrer-login entry — referral onboarding is consolidated into
 * /register; preserves any incoming context (parent, ref, utm_*). */
export default async function ReferLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(buildForwardUrl("/register", await searchParams, { referral_intent: "true" }));
}
