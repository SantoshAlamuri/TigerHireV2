import { redirect } from "next/navigation";

/** Recruit hiring setup pills resolve to company settings; keep URL stable for bookmarks. */
export default async function RecruitHiringTemplatesRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const resolved = await searchParams;
  const tab = resolved.tab?.trim();
  redirect(
    tab
      ? `/company/settings/templates?tab=${encodeURIComponent(tab)}`
      : "/company/settings/templates",
  );
}
