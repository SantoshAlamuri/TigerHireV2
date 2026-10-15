import { redirect } from "next/navigation";

export default function RecruitOfferLetterTemplatesRedirectPage() {
  redirect("/company/settings/templates?tab=offer-letters");
}
