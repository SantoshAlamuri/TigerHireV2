"use client";

import { PersonalCalendarIntegrationsPanel } from "@/components/settings/PersonalCalendarIntegrationsPanel";

export default function RecruitSettingsIntegrationsPage() {
  return (
    <PersonalCalendarIntegrationsPanel
      title="My Settings · Integrations"
      subtitle="Connect your personal calendar for interview scheduling"
      basePath="/recruit/settings"
    />
  );
}
