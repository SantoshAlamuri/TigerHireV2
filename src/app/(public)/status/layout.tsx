import type { Metadata } from "next";
import { SITE_MARKETING } from "@/lib/marketing/site-meta";

// The status page itself is a client component, so its metadata lives here.
export const metadata: Metadata = {
  title: "Status",
  description: `Live service status for ${SITE_MARKETING.brand}.`,
  alternates: { canonical: "/status" },
};

export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return children;
}
