import type { Metadata } from "next";
import { redirect } from "next/navigation";

// Tokenised offer alias — never indexable.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ token: string }> };

/**
 * A15: Canonical candidate offer page is `/offers/[token]`; this path exists for
 * BRD/deep-link wording (`/offers/view/...`) without duplicating the client.
 */
export default async function OfferViewAliasPage({ params }: PageProps) {
  const { token } = await params;
  if (!token?.trim()) {
    redirect("/");
  }
  redirect(`/offers/${encodeURIComponent(token.trim())}`);
}
