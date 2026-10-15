import { redirect } from "next/navigation";

/**
 * `/refer` landing — DEPRECATED 2026-05-12. See `/refer/join/page.tsx` for
 * the full deprecation rationale. Forwards to `/register` with
 * `referral_intent=true` and preserves any incoming params.
 */
export default async function ReferLandingDeprecatedRedirect({
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
