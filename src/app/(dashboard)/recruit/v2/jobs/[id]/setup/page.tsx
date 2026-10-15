import { redirect } from "next/navigation";

export default async function RecruitV2JobSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/recruit/jobs/${id}/setup`);
}
