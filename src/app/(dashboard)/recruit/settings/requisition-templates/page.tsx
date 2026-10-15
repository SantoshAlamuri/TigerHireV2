import { redirect } from "next/navigation";

/** Recruit settings resolve to the company templates hub — recruiter-accessible. */
export default function RecruitRequisitionTemplatesRedirectPage() {
  redirect("/company/settings/templates?tab=requisition");
}
