import type { Metadata } from "next";
import { SITE_MARKETING } from "@/lib/marketing/site-meta";

export const metadata: Metadata = {
  title: "Contact",
  description: `Contact ${SITE_MARKETING.brand} for demos, pricing, implementation, and partnerships — ${SITE_MARKETING.tagline.toLowerCase()}.`,
  keywords: [
    "contact tigerhire",
    "hiring intelligence demo",
    "talent intelligence india",
    "recruitment software demo",
  ],
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    title: `Contact — ${SITE_MARKETING.brand}`,
    description: `Book a demo or ask about ${SITE_MARKETING.tagline.toLowerCase()} for your team.`,
    url: "https://tigerhire.io/contact",
    siteName: SITE_MARKETING.brand,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `Contact — ${SITE_MARKETING.brand}`,
    description: SITE_MARKETING.descriptionShort,
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
