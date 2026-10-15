import { redirect } from "next/navigation";
import { legacyRouteTarget, type LegacySearchParams } from "@/lib/navigation/legacy-route-target";

export default async function CompanyHiringRequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<LegacySearchParams>;
}) {
  const { id } = await params;
  redirect(
    legacyRouteTarget(`/recruit/hiring-requests/${encodeURIComponent(id)}`, await searchParams),
  );
}
