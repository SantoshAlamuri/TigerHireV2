import type { Metadata } from "next";
import { SITE_MARKETING } from "@/lib/marketing/site-meta";

export const metadata: Metadata = {
  title: "Pricing",
  description: `${SITE_MARKETING.brand} plans for teams that want explainable hiring intelligence globally. Book a demo to find the right fit.`,
  keywords: [
    "tigerhire pricing",
    "hiring intelligence pricing india",
    "talent intelligence plans",
    "recruitment software pricing",
  ],
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: `${SITE_MARKETING.brand} Pricing`,
    description: `Plans and demos for ${SITE_MARKETING.tagline.toLowerCase()}.`,
    url: "https://tigerhire.io/pricing",
    siteName: SITE_MARKETING.brand,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_MARKETING.brand} Pricing`,
    description: SITE_MARKETING.descriptionShort,
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
