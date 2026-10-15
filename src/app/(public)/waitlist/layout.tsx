import type { Metadata } from "next";
import { SITE_MARKETING } from "@/lib/marketing/site-meta";

export const metadata: Metadata = {
  title: "Waitlist",
  description: `Join the ${SITE_MARKETING.brand} waitlist — early access for companies and job seekers to ${SITE_MARKETING.tagline.toLowerCase()}.`,
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: `${SITE_MARKETING.brand} Waitlist`,
    description: SITE_MARKETING.descriptionShort,
    url: "https://tigerhire.io/waitlist",
    siteName: SITE_MARKETING.brand,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_MARKETING.brand} Waitlist`,
    description: SITE_MARKETING.descriptionShort,
  },
};

export default function WaitlistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
