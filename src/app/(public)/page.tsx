import type { Metadata } from "next";
import { PublicNav, PublicFooter, PublicPageWrapper } from "@/components/marketing/PublicLayout";
import ReferEarnMarketingSection from "@/components/marketing/ReferEarnMarketingSection";
import { getBrowserAppOrigin } from "@/lib/marketing/browser-app-origin";
import HeroV2 from "@/components/marketing/v2/HeroV2";
import WhyPillarsV2 from "@/components/marketing/v2/WhyPillarsV2";
import ClosingV2 from "@/components/marketing/v2/ClosingV2";
import AutomationSectionV2 from "@/components/marketing/v2/AutomationSectionV2";
import {
  ProblemSectionV2,
  ProofSectionV2,
  WagerSectionV2,
} from "@/components/marketing/v2/StorySectionsV2";
import { CandidatesStripV2 } from "@/components/marketing/v2/PricingSectionsV2";

export const metadata: Metadata = {
  title: "Read all 500. Interview the right 10.",
  description:
    "TigerHire scores every applicant against a bar your hiring manager approves — with evidence, gaps, and a verdict you can defend. If our shortlist doesn't match your hiring manager's picks, you pay nothing.",
  alternates: { canonical: "/" },
};

/**
 * Homepage (v2 design, promoted 2026-07-24). Composition: new hero / live
 * demo / proof / wager / how-it-works / closing, plus the why-pillars,
 * persona cards, problem statement and Refer & Earn carried over from the
 * previous homepage. All other marketing pages are unchanged.
 */
export default async function HomePage() {
  const origin = await getBrowserAppOrigin();
  return (
    <PublicPageWrapper>
      <PublicNav />
      <main>
        <HeroV2 />
        <ProblemSectionV2 />
        <AutomationSectionV2 />
        <ProofSectionV2 />
        <WagerSectionV2 />
        <WhyPillarsV2 />
        <ReferEarnMarketingSection
          referJoinUrl={`${origin}/refer/join`}
          referDashboardUrl={`${origin}/dashboard/referrer`}
          showIntro
        />
        <CandidatesStripV2 />
        <ClosingV2 />
      </main>
      <PublicFooter />
    </PublicPageWrapper>
  );
}
