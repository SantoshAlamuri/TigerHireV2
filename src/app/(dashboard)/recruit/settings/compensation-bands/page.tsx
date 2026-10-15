"use client";

import { SettingsModule } from "@/components/settings/SettingsModule";
import { OfferLetterFlowSettingsPanel } from "@/components/settings/OfferLetterFlowSettingsPanel";
import { buildRecruitHiringSetupSections } from "@/features/settings/config/sections";

export default function RecruitCompensationBandsSettingsPage() {
  return (
    <SettingsModule
      title="Offer letter flow"
      subtitle="Step-by-step CTC-driven flow used while drafting offer letters"
      basePath="/recruit/settings"
      sections={buildRecruitHiringSetupSections()}
      sectionsNavLabel="Hiring setup"
    >
      <OfferLetterFlowSettingsPanel />
    </SettingsModule>
  );
}
