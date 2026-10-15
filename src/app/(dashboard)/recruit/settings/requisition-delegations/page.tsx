"use client";

import { SettingsModule } from "@/components/settings/SettingsModule";
import { RequisitionDelegationsSettingsPanel } from "@/components/settings/RequisitionDelegationsSettingsPanel";
import { buildRecruitHiringSetupSections } from "@/features/settings/config/sections";

export default function RecruitRequisitionDelegationsPage() {
  return (
    <SettingsModule
      title="Requisition delegations"
      subtitle="Configure proxy approvers for requisition workflow stages"
      basePath="/recruit/settings"
      sections={buildRecruitHiringSetupSections()}
      sectionsNavLabel="Hiring setup"
    >
      <RequisitionDelegationsSettingsPanel />
    </SettingsModule>
  );
}
