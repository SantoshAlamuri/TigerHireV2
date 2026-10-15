import { redirect } from "next/navigation";

export default function SetupRequisitionTemplatesRedirectPage() {
  redirect("/setup/hiring-config/templates?tab=requisition");
}
