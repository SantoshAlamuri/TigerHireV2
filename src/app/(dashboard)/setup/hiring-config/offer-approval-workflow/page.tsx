import { OfferApprovalWorkflowSettingsPageContent } from "@/features/settings/pages/hiring-settings-pages";
export default function SetupOfferApprovalPage() {
  return (
    <OfferApprovalWorkflowSettingsPageContent
      basePath="/setup/hiring-config"
      jobsHref="/company/jobs"
    />
  );
}
