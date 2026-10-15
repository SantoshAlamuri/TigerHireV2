import type { Metadata } from "next";

// The company-sign page is a client component, so the metadata lives in this layout.
// Signing links carry offer documents — they must never appear in search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function CompanySignTokenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
