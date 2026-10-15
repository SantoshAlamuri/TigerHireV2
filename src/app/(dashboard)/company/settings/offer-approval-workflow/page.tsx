"use client";

import { OfferApprovalWorkflowSettingsPageContent } from "@/features/settings/pages/hiring-settings-pages";

export default function CompanyOfferApprovalWorkflowPage() {
  return (
    <OfferApprovalWorkflowSettingsPageContent
      basePath="/company/settings"
      jobsHref="/company/jobs"
    />
  );
}
