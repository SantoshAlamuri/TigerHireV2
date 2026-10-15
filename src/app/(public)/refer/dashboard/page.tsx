import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildForwardUrl } from "@/lib/navigation/forward-search-params";

// Dashboard alias — never indexable.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Legacy alias — redirects to the referrer dashboard, preserving context. */
export default async function ReferDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(buildForwardUrl("/dashboard/referrer", await searchParams));
}
