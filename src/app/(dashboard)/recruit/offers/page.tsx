import { redirect } from "next/navigation";
import { legacyRouteTarget, type LegacySearchParams } from "@/lib/navigation/legacy-route-target";

export default async function RecruitOffersPage({
  searchParams,
}: {
  searchParams: Promise<LegacySearchParams>;
}) {
  redirect(legacyRouteTarget("/company/offers", await searchParams));
}
