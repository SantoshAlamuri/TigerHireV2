import { redirect } from "next/navigation";
import { legacyRouteTarget, type LegacySearchParams } from "@/lib/navigation/legacy-route-target";

export default async function RecruitOfferDraftPage({
  searchParams,
}: {
  searchParams: Promise<LegacySearchParams>;
}) {
  redirect(legacyRouteTarget("/company/offers/draft", await searchParams));
}
