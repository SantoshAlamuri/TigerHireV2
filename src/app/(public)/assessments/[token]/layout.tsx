import type { Metadata } from "next";

// The assessment page is a client component, so the metadata lives in this layout.
// Tokenised assessment links must never appear in search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AssessmentTokenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
