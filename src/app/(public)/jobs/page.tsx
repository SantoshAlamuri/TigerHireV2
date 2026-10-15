import type { Metadata } from "next";
import { SITE_MARKETING } from "@/lib/marketing/site-meta";
import { PublicNav, PublicFooter, PublicPageWrapper } from "@/components/marketing/PublicLayout";
import { JobsBoardClient } from "./JobsBoardClient";

export const metadata: Metadata = {
  title: "Jobs",
  description: `Browse open roles on ${SITE_MARKETING.brand}. Apply to jobs from companies hiring with clear, fair screening.`,
  alternates: { canonical: "/jobs" },
  openGraph: {
    title: `Open jobs — ${SITE_MARKETING.brand}`,
    description: `Browse open roles and apply on ${SITE_MARKETING.brand}.`,
    url: "https://tigerhire.io/jobs",
    siteName: "TigerHire",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `Open jobs — ${SITE_MARKETING.brand}`,
    description: `Browse open roles on ${SITE_MARKETING.brand}.`,
  },
};

export default function PublicJobsPage() {
  return (
    <PublicPageWrapper>
      <PublicNav />
      <main className="alive-air-hero relative z-10 min-h-screen">
        <JobsBoardClient />
      </main>
      <PublicFooter />
    </PublicPageWrapper>
  );
}
