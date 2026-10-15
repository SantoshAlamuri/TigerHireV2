import type { SettingsSection } from "@/features/settings/types";

export const RECRUIT_SETTINGS_BASE = "/recruit/settings" as const;
export const COMPANY_SETTINGS_BASE = "/company/settings" as const;
export const SETUP_ORG_BASE = "/setup/organization" as const;
export const SETUP_HIRING_BASE = "/setup/hiring-config" as const;
export const SETUP_COMMS_BASE = "/setup/comms" as const;
export const SETUP_PLATFORM_BASE = "/setup/platform" as const;

type HiringSectionsBase =
  | typeof RECRUIT_SETTINGS_BASE
  | typeof COMPANY_SETTINGS_BASE
  | typeof SETUP_HIRING_BASE;

/** Org hiring-config panels canonical under `/company/settings/*` (Brief 3 Phase 2). */
function hiringSetupSections(basePath: HiringSectionsBase): SettingsSection[] {
  const settingsBase = basePath === RECRUIT_SETTINGS_BASE ? COMPANY_SETTINGS_BASE : basePath;
  const hiringRequestsHref =
    basePath === RECRUIT_SETTINGS_BASE ? "/recruit/hiring-requests" : "/company/hiring-requests";
  const jobPostingsHref = basePath === RECRUIT_SETTINGS_BASE ? "/recruit/jobs" : "/company/jobs";

  return [
    {
      id: "hiring_requests",
      label: "Hiring requests",
      href: hiringRequestsHref,
      description:
        "Raise and approve job requisitions (headcount, role, budget) before a role goes live.",
    },
    {
      id: "job_postings",
      label: "Job postings",
      href: jobPostingsHref,
      description: "Create and publish the job once a requisition is approved.",
    },
    {
      id: "ideal_candidate_profile",
      label: "Ideal candidate profile",
      href: jobPostingsHref,
      description:
        "Open each job, then complete Ideal Candidate Profile (JD Base) so FitScore and screening match your bar.",
    },
    {
      id: "pipeline",
      label: "Pipeline defaults",
      href: `${settingsBase}/pipeline`,
      description: "Default hiring stages copied to each new job posting.",
    },
    {
      id: "screening",
      label: "Screening",
      href: `${settingsBase}/screening`,
      description: "Configure WhatsApp and voice screening defaults.",
    },
    {
      id: "templates",
      label: "Templates",
      href: `${settingsBase}/templates`,
      description: "Requisition, offer letter, interview feedback, and assessment templates.",
    },
    {
      id: "offer_letter_flow",
      label: "Offer letter flow",
      href: `${settingsBase}/compensation-bands`,
      description: "Admin-defined step-by-step offer drafting flow with CTC defaults.",
    },
    {
      id: "offer_approval_workflow",
      label: "Offer approval workflow",
      href: `${settingsBase}/offer-approval-workflow`,
      description: "Single sequential admin approval lane for all offers.",
    },
  ];
}

/** In-page section pills: requisition → posting → ICP, then pipeline through offer approval. */
export function buildRecruitHiringSetupSections(): SettingsSection[] {
  return hiringSetupSections(RECRUIT_SETTINGS_BASE);
}

/** In-page section pills: requisition → posting → ICP, then pipeline through offer approval. */
export function buildCompanyHiringSetupSections(): SettingsSection[] {
  return hiringSetupSections(COMPANY_SETTINGS_BASE);
}

export function buildSetupHiringSetupSections(): SettingsSection[] {
  const base = SETUP_HIRING_BASE;
  return [
    {
      id: "default_recruitment_plan",
      label: "Default recruitment plan",
      href: `${base}/default-recruitment-plan`,
      description: "Default plan stages for new jobs (plan document mode).",
    },
    ...hiringSetupSections(SETUP_HIRING_BASE),
    {
      id: "requisition_approval_workflow",
      label: "Requisition approval",
      href: `${base}/requisition-approval-workflow`,
      description: "Approval stages for hiring requests.",
    },
    {
      id: "requisition_delegations",
      label: "Requisition delegations",
      href: `${base}/requisition-delegations`,
      description: "Delegate approval authority.",
    },
  ];
}

export function buildSetupOrganizationSections(): SettingsSection[] {
  const base = SETUP_ORG_BASE;
  return [
    {
      id: "profile",
      label: "Org profile",
      href: `${base}/profile`,
      description: "Display name, domain, and 2FA enforcement.",
    },
    {
      id: "team",
      label: "Team & roles",
      href: `${base}/team`,
      description: "Members, roles, and admin permissions.",
    },
    {
      id: "billing",
      label: "Billing & plan",
      href: `${base}/billing`,
      description: "Plan tier, usage, and Stripe portal.",
    },
    {
      id: "permissions",
      label: "Permissions",
      href: `${base}/permissions`,
      description: "Capability gates for recruiters and hiring managers.",
    },
    {
      id: "referrals",
      label: "Referral program",
      href: `${base}/referrals`,
      description: "Bonuses, campaigns, and program rules.",
    },
    {
      id: "pending_resignations",
      label: "Pending resignations",
      href: `${base}/pending-resignations`,
      description: "Offboarding queue.",
    },
  ];
}

export function buildSetupCommsSections(): SettingsSection[] {
  const base = SETUP_COMMS_BASE;
  return [
    {
      id: "privacy",
      label: "Privacy & consent",
      href: `${base}/privacy`,
      description: "Consent copy and retention defaults.",
    },
    {
      id: "audit",
      label: "Audit log",
      href: `${base}/audit`,
      description: "Settings change history and DSR queue.",
    },
    {
      id: "webhooks",
      label: "Outbound webhooks",
      href: `${base}/outbound-webhooks`,
      description: "Webhook endpoints, signing, and delivery history.",
    },
  ];
}

export function buildSetupPlatformSections(): SettingsSection[] {
  const base = SETUP_PLATFORM_BASE;
  return [
    {
      id: "integrations",
      label: "Integrations",
      href: `${base}/integrations`,
      description: "SSO, HRIS, calendar, video, and AI providers.",
    },
    {
      id: "job_boards",
      label: "Job boards",
      href: `${base}/job-boards`,
      description: "idibu, Adzuna, and Indeed posting and application credentials.",
    },
  ];
}

/** Resolve hiring section pills for company, recruit, or setup base paths. */
export function hiringSetupSectionsForBase(basePath: string): SettingsSection[] {
  if (basePath.startsWith(SETUP_HIRING_BASE)) return buildSetupHiringSetupSections();
  if (basePath.startsWith(RECRUIT_SETTINGS_BASE)) return buildRecruitHiringSetupSections();
  return buildCompanyHiringSetupSections();
}

/** Recruiter routes still under Settings (calendar, etc.). */
function buildRecruitSettingsSections(): SettingsSection[] {
  const basePath = RECRUIT_SETTINGS_BASE;
  return [
    {
      id: "integrations",
      label: "Integrations",
      href: `${basePath}/integrations`,
      description: "Personal calendar connections used for interview scheduling.",
    },
  ];
}

function buildCompanySettingsSections(): SettingsSection[] {
  const basePath = COMPANY_SETTINGS_BASE;
  return [
    {
      id: "overview",
      label: "Overview",
      href: basePath,
      description: "Company profile and organisation defaults.",
    },
    {
      id: "integrations",
      label: "Integrations",
      href: `${basePath}/integrations`,
      description: "Calendar, video, email, and AI provider configuration.",
    },
    {
      id: "job_boards",
      label: "Job Boards",
      href: `${basePath}/job-boards`,
      description: "Configure idibu, Adzuna, and Indeed for this organisation.",
    },
    {
      id: "permissions",
      label: "Permissions",
      href: `${basePath}/permissions`,
      description: "Role capabilities and access controls.",
    },
    {
      id: "privacy",
      label: "Privacy",
      href: `${basePath}/privacy`,
      description: "Consent and retention policy settings.",
    },
    {
      id: "audit",
      label: "Audit Log",
      href: `${basePath}/audit`,
      description: "Immutable activity history for settings actions.",
    },
  ];
}

export function buildSettingsSections(basePath: string): SettingsSection[] {
  if (basePath === RECRUIT_SETTINGS_BASE) {
    return buildRecruitSettingsSections();
  }
  return buildCompanySettingsSections();
}
