export type SetupArea = "organization" | "hiring-config" | "comms" | "platform";

export type SetupRouteEntry = {
  id: string;
  label: string;
  description: string;
  area: SetupArea;
  /** Full path under `/setup`. */
  path: string;
  /** Legacy canonical path (company settings or company hub). */
  canonicalPath: string;
};

export const SETUP_AREAS: ReadonlyArray<{
  id: SetupArea;
  label: string;
  description: string;
  href: string;
}> = [
  {
    id: "organization",
    label: "Organisation",
    description: "Org profile, team, billing, and access",
    href: "/setup/organization",
  },
  {
    id: "hiring-config",
    label: "Hiring configuration",
    description: "Pipeline, screening, templates, offers, and requisitions",
    href: "/setup/hiring-config",
  },
  {
    id: "comms",
    label: "Comms & trust",
    description: "Privacy, audit, and outbound webhooks",
    href: "/setup/comms",
  },
  {
    id: "platform",
    label: "Platform",
    description: "Integrations and job board posting",
    href: "/setup/platform",
  },
] as const;

export const SETUP_ROUTES: readonly SetupRouteEntry[] = [
  {
    id: "org.profile",
    label: "Org profile",
    description: "Display name, domain, and 2FA enforcement",
    area: "organization",
    path: "/setup/organization/profile",
    canonicalPath: "/company/settings",
  },
  {
    id: "org.team",
    label: "Team & roles",
    description: "Members, roles, and admin permissions",
    area: "organization",
    path: "/setup/organization/team",
    canonicalPath: "/company/team",
  },
  {
    id: "org.billing",
    label: "Billing & plan",
    description: "Plan tier, usage, and Stripe portal",
    area: "organization",
    path: "/setup/organization/billing",
    canonicalPath: "/company/billing",
  },
  {
    id: "org.permissions",
    label: "Permissions",
    description: "Capability gates for recruiters and hiring managers",
    area: "organization",
    path: "/setup/organization/permissions",
    canonicalPath: "/company/settings/permissions",
  },
  {
    id: "org.referrals",
    label: "Referral program",
    description: "Bonuses, campaigns, and program rules",
    area: "organization",
    path: "/setup/organization/referrals",
    canonicalPath: "/company/referrals",
  },
  {
    id: "org.pending_resignations",
    label: "Pending resignations",
    description: "Offboarding queue",
    area: "organization",
    path: "/setup/organization/pending-resignations",
    canonicalPath: "/company/pending-resignations",
  },
  {
    id: "hiring.default_plan",
    label: "Default recruitment plan",
    description: "Default plan stages for new jobs",
    area: "hiring-config",
    path: "/setup/hiring-config/default-recruitment-plan",
    canonicalPath: "/setup/hiring-config/default-recruitment-plan",
  },
  {
    id: "hiring.pipeline",
    label: "Pipeline stages",
    description: "Default pipeline stages for new jobs",
    area: "hiring-config",
    path: "/setup/hiring-config/pipeline",
    canonicalPath: "/company/settings/pipeline",
  },
  {
    id: "hiring.screening",
    label: "Screening defaults",
    description: "WhatsApp and voice screening preferences",
    area: "hiring-config",
    path: "/setup/hiring-config/screening",
    canonicalPath: "/company/settings/screening",
  },
  {
    id: "hiring.templates",
    label: "Templates",
    description: "Requisition, offer letter, feedback, and assessment templates",
    area: "hiring-config",
    path: "/setup/hiring-config/templates",
    canonicalPath: "/company/settings/templates",
  },
  {
    id: "hiring.compensation_bands",
    label: "Offer letter flow",
    description: "Compensation structure and CTC breakdown",
    area: "hiring-config",
    path: "/setup/hiring-config/compensation-bands",
    canonicalPath: "/company/settings/compensation-bands",
  },
  {
    id: "hiring.offer_approval",
    label: "Offer approval workflow",
    description: "Sequential approval stages for offers",
    area: "hiring-config",
    path: "/setup/hiring-config/offer-approval-workflow",
    canonicalPath: "/company/settings/offer-approval-workflow",
  },
  {
    id: "hiring.requisition_approval",
    label: "Requisition approval",
    description: "Approval stages for hiring requests",
    area: "hiring-config",
    path: "/setup/hiring-config/requisition-approval-workflow",
    canonicalPath: "/company/settings/requisition-approval-workflow",
  },
  {
    id: "hiring.requisition_delegations",
    label: "Requisition delegations",
    description: "Delegate approval authority",
    area: "hiring-config",
    path: "/setup/hiring-config/requisition-delegations",
    canonicalPath: "/company/settings/requisition-delegations",
  },
  {
    id: "comms.privacy",
    label: "Privacy & consent",
    description: "Consent copy and retention defaults",
    area: "comms",
    path: "/setup/comms/privacy",
    canonicalPath: "/company/settings/privacy",
  },
  {
    id: "comms.audit",
    label: "Audit log",
    description: "Settings change history and DSR queue",
    area: "comms",
    path: "/setup/comms/audit",
    canonicalPath: "/company/settings/audit",
  },
  {
    id: "comms.webhooks",
    label: "Outbound webhooks",
    description: "Webhook endpoints, signing, and delivery history",
    area: "comms",
    path: "/setup/comms/outbound-webhooks",
    canonicalPath: "/company/settings/outbound-webhooks",
  },
  {
    id: "platform.integrations",
    label: "Integrations",
    description: "SSO, HRIS, calendar, video, and AI providers",
    area: "platform",
    path: "/setup/platform/integrations",
    canonicalPath: "/company/settings/integrations",
  },
  {
    id: "platform.job_boards",
    label: "Job boards",
    description: "Adzuna and Indeed outbound posting credentials",
    area: "platform",
    path: "/setup/platform/job-boards",
    canonicalPath: "/company/settings/job-boards",
  },
] as const;

export function getSetupRoutesForArea(area: SetupArea): SetupRouteEntry[] {
  return SETUP_ROUTES.filter((r) => r.area === area);
}

export function getDefaultSetupPathForArea(area: SetupArea): string {
  const routes = getSetupRoutesForArea(area);
  return routes[0]?.path ?? `/setup/${area}`;
}

export function getSetupPathForCanonical(canonicalPath: string): string | null {
  const normalized = canonicalPath.split("?")[0]?.replace(/\/$/, "") || canonicalPath;
  const exact = SETUP_ROUTES.find((r) => r.canonicalPath === normalized);
  if (exact) return exact.path;
  const prefix = SETUP_ROUTES.find(
    (r) => normalized.startsWith(r.canonicalPath) && r.canonicalPath !== "/company/settings",
  );
  return prefix?.path ?? null;
}

export function getCanonicalPathForSetup(setupPath: string): string | null {
  const normalized = setupPath.split("?")[0]?.replace(/\/$/, "") || setupPath;
  return SETUP_ROUTES.find((r) => r.path === normalized)?.canonicalPath ?? null;
}

export function getSetupRouteByPath(path: string): SetupRouteEntry | null {
  const normalized = path.split("?")[0]?.replace(/\/$/, "") || path;
  return SETUP_ROUTES.find((r) => r.path === normalized) ?? null;
}
