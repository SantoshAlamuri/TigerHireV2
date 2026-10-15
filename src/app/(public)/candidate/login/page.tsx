import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildForwardUrl } from "@/lib/navigation/forward-search-params";

// Legacy login alias — never indexable.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Legacy candidate-login entry — redirects to the shared login, preserving context. */
export default async function CandidateLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(buildForwardUrl("/login", await searchParams));
}
