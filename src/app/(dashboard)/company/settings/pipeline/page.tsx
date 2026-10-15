"use client";

import { PipelineSettingsPageContent } from "@/features/settings/pages/hiring-settings-pages";

export default function CompanyOrgPipelineSettingsPage() {
  return <PipelineSettingsPageContent basePath="/company/settings" jobsHref="/company/jobs" />;
}
