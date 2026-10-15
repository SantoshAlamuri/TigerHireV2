import type { Metadata } from "next";

// The scheduling page is a client component, so the metadata lives in this layout.
// Tokenised interview-scheduling links must never appear in search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ScheduleTokenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
