"use client";

import { CompensationBandsSettingsPageContent } from "@/features/settings/pages/hiring-settings-pages";

export default function CompanyCompensationBandsSettingsPage() {
  return (
    <CompensationBandsSettingsPageContent basePath="/company/settings" jobsHref="/company/jobs" />
  );
}
