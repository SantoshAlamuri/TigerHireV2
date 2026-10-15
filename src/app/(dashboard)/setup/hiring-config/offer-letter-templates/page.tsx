import { redirect } from "next/navigation";

export default function SetupOfferLetterTemplatesRedirectPage() {
  redirect("/setup/hiring-config/templates?tab=offer-letters");
}
