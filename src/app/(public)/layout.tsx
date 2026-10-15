import type { Metadata } from "next";
import { SITE_KEYWORDS, SITE_MARKETING } from "@/lib/marketing/site-meta";

export const metadata: Metadata = {
  metadataBase: new URL("https://tigerhire.io"),
  title: {
    default: SITE_MARKETING.defaultTitle,
    template: `%s | ${SITE_MARKETING.brand}`,
  },
  description: SITE_MARKETING.description,
  keywords: [
    ...SITE_KEYWORDS,
    "ideal profile match",
    "market position hiring",
    "hiring verdict engine",
  ],
  // NOTE: no segment-level `alternates.canonical` here — a canonical set on this
  // layout is inherited by every (public) route and would point them all at the
  // homepage, deindexing them. Each page declares its own canonical instead.
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: SITE_MARKETING.defaultTitle,
    description: SITE_MARKETING.ogDescription,
    url: "https://tigerhire.io",
    siteName: SITE_MARKETING.brand,
    type: "website",
    images: [
      {
        url: "https://tigerhire.io/icons/icon-512.png",
        width: 512,
        height: 512,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_MARKETING.defaultTitle,
    description: SITE_MARKETING.descriptionShort,
    images: ["https://tigerhire.io/icons/icon-512.png"],
  },
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return children;
}
