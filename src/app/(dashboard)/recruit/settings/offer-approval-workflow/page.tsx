"use client";

import { SettingsModule } from "@/components/settings/SettingsModule";
import { OfferApprovalWorkflowSettingsPanel } from "@/components/settings/OfferApprovalWorkflowSettingsPanel";
import { buildRecruitHiringSetupSections } from "@/features/settings/config/sections";

export default function RecruitOfferApprovalWorkflowPage() {
  return (
    <SettingsModule
      title="Offer approval workflow"
      subtitle="Single sequential admin approval lane for all offers"
      basePath="/recruit/settings"
      sections={buildRecruitHiringSetupSections()}
      sectionsNavLabel="Hiring setup"
    >
      <OfferApprovalWorkflowSettingsPanel />
    </SettingsModule>
  );
}
