import type { Metadata } from "next";

// The offer page is a client component, so the metadata lives in this layout.
// Offer letters carry compensation details — they must never appear in search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function OfferTokenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
