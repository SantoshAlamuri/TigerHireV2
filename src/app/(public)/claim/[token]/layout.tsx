import type { Metadata } from "next";

// The claim page is a client component, so the metadata lives in this layout.
// One-time claim tokens must never appear in search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ClaimTokenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
