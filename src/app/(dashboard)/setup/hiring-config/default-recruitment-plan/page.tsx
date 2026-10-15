"use client";

import { SettingsModule } from "@/components/settings/SettingsModule";
import { DefaultRecruitmentPlanPanel } from "@/components/setup/DefaultRecruitmentPlanPanel";

export default function SetupDefaultRecruitmentPlanPage() {
  return (
    <SettingsModule
      title="Default recruitment plan"
      subtitle="Stages applied to new jobs when no pipeline exists yet"
    >
      <DefaultRecruitmentPlanPanel />
    </SettingsModule>
  );
}
