import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildForwardUrl } from "@/lib/navigation/forward-search-params";

// Deprecated auth alias — never indexable.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Deprecated referrer-auth entry — redirects to the shared login, preserving context. */
export default async function ReferAuthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(buildForwardUrl("/login", await searchParams));
}
