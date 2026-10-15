import { redirect } from "next/navigation";
import { legacyRouteTarget, type LegacySearchParams } from "@/lib/navigation/legacy-route-target";

export default async function LegacyPage({
  searchParams,
}: {
  searchParams: Promise<LegacySearchParams>;
}) {
  redirect(legacyRouteTarget("/recruit/assessments", await searchParams));
}
