"use client";

import { RequisitionDelegationsSettingsPageContent } from "@/features/settings/pages/hiring-settings-pages";

export default function CompanyRequisitionDelegationsPage() {
  return (
    <RequisitionDelegationsSettingsPageContent
      basePath="/company/settings"
      jobsHref="/company/jobs"
    />
  );
}
