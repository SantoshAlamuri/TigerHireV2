"use client";

import { SettingsModule } from "@/components/settings/SettingsModule";
import { OrgPipelineDefaultsPanel } from "@/components/settings/OrgPipelineDefaultsPanel";
import { buildRecruitHiringSetupSections } from "@/features/settings/config/sections";

export default function OrgPipelineSettingsPage() {
  return (
    <SettingsModule
      title="Pipeline defaults"
      subtitle="Stages copied to each new job"
      basePath="/recruit/settings"
      sections={buildRecruitHiringSetupSections()}
      sectionsNavLabel="Hiring setup"
    >
      <OrgPipelineDefaultsPanel jobsHref="/recruit/jobs" />
    </SettingsModule>
  );
}
