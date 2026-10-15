"use client";

import { PersonalCalendarIntegrationsPanel } from "@/components/settings/PersonalCalendarIntegrationsPanel";

export default function CompanyMySettingsIntegrationsPage() {
  return (
    <PersonalCalendarIntegrationsPanel
      title="My Settings · Integrations"
      subtitle="Connect your personal calendar for interview scheduling"
      basePath="/company/my-settings"
    />
  );
}
