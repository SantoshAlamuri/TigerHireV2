"use client";

import { RequisitionApprovalWorkflowSettingsPageContent } from "@/features/settings/pages/hiring-settings-pages";

export default function CompanyRequisitionApprovalWorkflowPage() {
  return (
    <RequisitionApprovalWorkflowSettingsPageContent
      basePath="/company/settings"
      jobsHref="/company/jobs"
    />
  );
}
