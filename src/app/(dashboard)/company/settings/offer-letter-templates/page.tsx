import { redirect } from "next/navigation";

export default function CompanyOfferLetterTemplatesRedirectPage() {
  redirect("/company/settings/templates?tab=offer-letters");
}
