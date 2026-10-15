import { RequisitionApprovalWorkflowSettingsPageContent } from "@/features/settings/pages/hiring-settings-pages";
export default function SetupRequisitionApprovalPage() {
  return (
    <RequisitionApprovalWorkflowSettingsPageContent
      basePath="/setup/hiring-config"
      jobsHref="/company/jobs"
    />
  );
}
