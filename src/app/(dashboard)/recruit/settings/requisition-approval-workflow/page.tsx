"use client";

import { SettingsModule } from "@/components/settings/SettingsModule";
import { RequisitionApprovalWorkflowSettingsPanel } from "@/components/settings/RequisitionApprovalWorkflowSettingsPanel";
import { buildRecruitHiringSetupSections } from "@/features/settings/config/sections";

export default function RecruitRequisitionApprovalWorkflowPage() {
  return (
    <SettingsModule
      title="Requisition approval workflow"
      subtitle="Configure manager, HR and finance stages for hiring request approvals"
      basePath="/recruit/settings"
      sections={buildRecruitHiringSetupSections()}
      sectionsNavLabel="Hiring setup"
    >
      <RequisitionApprovalWorkflowSettingsPanel />
    </SettingsModule>
  );
}
