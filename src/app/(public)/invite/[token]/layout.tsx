import type { Metadata } from "next";

// The invite page is a client component, so the metadata lives in this layout.
// Tokenised team-invite links must never appear in search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function InviteTokenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
