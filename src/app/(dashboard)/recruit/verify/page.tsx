import { redirect } from "next/navigation";

/** Shortlist verification now lives only under My Approvals (`/company/approvals`). */
export default function RecruitVerifyRedirectPage() {
  redirect("/company/approvals");
}
