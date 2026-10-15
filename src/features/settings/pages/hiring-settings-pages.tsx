"use client";

import type { ReactNode } from "react";
import { SettingsModule } from "@/components/settings/SettingsModule";
import { OrgPipelineDefaultsPanel } from "@/components/settings/OrgPipelineDefaultsPanel";
import { OfferLetterTemplatesPanel } from "@/components/settings/OfferLetterTemplatesPanel";
import { OfferLetterFlowSettingsPanel } from "@/components/settings/OfferLetterFlowSettingsPanel";
import { OfferApprovalWorkflowSettingsPanel } from "@/components/settings/OfferApprovalWorkflowSettingsPanel";
import { RequisitionTemplatesSettingsPanel } from "@/components/settings/RequisitionTemplatesSettingsPanel";
import { RequisitionApprovalWorkflowSettingsPanel } from "@/components/settings/RequisitionApprovalWorkflowSettingsPanel";
import { RequisitionDelegationsSettingsPanel } from "@/components/settings/RequisitionDelegationsSettingsPanel";
import { HiringTemplatesHub } from "@/components/settings/HiringTemplatesHub";
import { hiringSetupSectionsForBase, SETUP_HIRING_BASE } from "@/features/settings/config/sections";

type HiringPageProps = {
  basePath: string;
  jobsHref: string;
};

function HiringSettingsShell({
  basePath,
  title,
  subtitle,
  children,
}: HiringPageProps & { title: string; subtitle: string; children: ReactNode }) {
  return (
    <SettingsModule
      title={title}
      subtitle={subtitle}
      basePath={basePath}
      sections={hiringSetupSectionsForBase(basePath)}
      sectionsNavLabel="Hiring setup"
    >
      {children}
    </SettingsModule>
  );
}

export function PipelineSettingsPageContent({ basePath, jobsHref }: HiringPageProps) {
  return (
    <HiringSettingsShell
      basePath={basePath}
      jobsHref={jobsHref}
      title="Pipeline defaults"
      subtitle="Stages copied to each new job"
    >
      <OrgPipelineDefaultsPanel jobsHref={jobsHref} />
    </HiringSettingsShell>
  );
}

export function OfferLetterTemplatesSettingsPageContent({ basePath, jobsHref }: HiringPageProps) {
  return (
    <HiringSettingsShell
      basePath={basePath}
      jobsHref={jobsHref}
      title="Offer letters"
      subtitle="Organisation template for offer PDFs sent for e-signature"
    >
      <OfferLetterTemplatesPanel />
    </HiringSettingsShell>
  );
}

export function CompensationBandsSettingsPageContent({ basePath, jobsHref }: HiringPageProps) {
  return (
    <HiringSettingsShell
      basePath={basePath}
      jobsHref={jobsHref}
      title="Offer letter flow"
      subtitle="Step-by-step CTC-driven flow used while drafting offer letters"
    >
      <OfferLetterFlowSettingsPanel />
    </HiringSettingsShell>
  );
}

export function OfferApprovalWorkflowSettingsPageContent({ basePath, jobsHref }: HiringPageProps) {
  return (
    <HiringSettingsShell
      basePath={basePath}
      jobsHref={jobsHref}
      title="Offer approval workflow"
      subtitle="Single sequential admin approval lane for all offers"
    >
      <OfferApprovalWorkflowSettingsPanel />
    </HiringSettingsShell>
  );
}

export function RequisitionTemplatesSettingsPageContent({ basePath, jobsHref }: HiringPageProps) {
  return (
    <HiringSettingsShell
      basePath={basePath}
      jobsHref={jobsHref}
      title="Requisition templates"
      subtitle="Reusable requisition/JD templates for faster, more consistent requests"
    >
      <RequisitionTemplatesSettingsPanel />
    </HiringSettingsShell>
  );
}

export function RequisitionApprovalWorkflowSettingsPageContent({
  basePath,
  jobsHref,
}: HiringPageProps) {
  return (
    <HiringSettingsShell
      basePath={basePath}
      jobsHref={jobsHref}
      title="Requisition approval workflow"
      subtitle="Approval stages for hiring requests"
    >
      <RequisitionApprovalWorkflowSettingsPanel />
    </HiringSettingsShell>
  );
}

export function RequisitionDelegationsSettingsPageContent({ basePath, jobsHref }: HiringPageProps) {
  return (
    <HiringSettingsShell
      basePath={basePath}
      jobsHref={jobsHref}
      title="Requisition delegations"
      subtitle="Delegate approval authority"
    >
      <RequisitionDelegationsSettingsPanel />
    </HiringSettingsShell>
  );
}

export function HiringTemplatesSettingsPageContent({ basePath, jobsHref }: HiringPageProps) {
  const showRequisitionTab = basePath.startsWith(SETUP_HIRING_BASE);
  const jobsBasePath = jobsHref.replace(/\/$/, "");
  return (
    <HiringSettingsShell
      basePath={basePath}
      jobsHref={jobsHref}
      title="Templates"
      subtitle="Requisition, offer letter, interview feedback, and assessment templates in one place"
    >
      <HiringTemplatesHub jobsBasePath={jobsBasePath} showRequisitionTab={showRequisitionTab} />
    </HiringSettingsShell>
  );
}
