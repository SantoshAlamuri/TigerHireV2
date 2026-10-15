import { capabilitiesFor, type Seat } from "./seat-capabilities";

/**
 * Integration registry and permissions.
 *
 * The distinction that drives everything here is who owns the account:
 *
 *  - "platform" — TigerHire runs the credentials and the infrastructure. A
 *    customer can switch it on or off for their org and nothing else. Showing
 *    them a key field would be dishonest, and letting them edit one would break
 *    the shared account for everybody.
 *  - "customer" — their own seat, their own endpoint. Theirs to configure.
 */
export type Owner = "platform" | "customer";

export interface Integration {
  id: string;
  name: string;
  owner: Owner;
  purpose: string;
  /** Where the customer manages it, when it is theirs to manage. */
  manageHref?: string;
}

export const INTEGRATIONS: readonly Integration[] = [
  {
    id: "whatsapp",
    name: "WhatsApp",
    owner: "platform",
    purpose:
      "Screening questions, follow-ups and status replies. If this stops, screening stops silently.",
  },
  {
    id: "email",
    name: "Email delivery",
    owner: "platform",
    purpose: "Offer letters, notifications and acknowledgements.",
  },
  {
    id: "scoring",
    name: "Scoring engine",
    owner: "platform",
    purpose: "CV parsing and FitScore against your approved rubric.",
  },
  {
    id: "intake_email",
    name: "Intake email",
    owner: "platform",
    purpose: "Forwarded job-portal mail becomes applications automatically.",
  },
  {
    id: "notetaker",
    name: "AI notetaker",
    owner: "platform",
    purpose: "Joins interviews and writes notes.",
  },
  {
    id: "job_boards",
    name: "Job boards",
    owner: "customer",
    purpose: "Posting and sync using your own board accounts.",
    manageHref: "/company/settings/job-boards",
  },
  {
    id: "webhooks",
    name: "Outbound webhooks",
    owner: "customer",
    purpose: "Your endpoints receiving application and offer events.",
    manageHref: "/company/settings/outbound-webhooks",
  },
] as const;

export interface IntegrationActions {
  canView: boolean;
  /** Switch on or off for this org — the only control on platform integrations. */
  canToggle: boolean;
  canConfigure: boolean;
  canViewCredentials: boolean;
  note: string;
}

const NOTHING: IntegrationActions = {
  canView: false,
  canToggle: false,
  canConfigure: false,
  canViewCredentials: false,
  note: "",
};

export function actionsFor(
  integrationId: string,
  seat: Seat | string | null | undefined,
): IntegrationActions {
  const integration = INTEGRATIONS.find((i) => i.id === integrationId);
  if (!integration) return NOTHING;

  const caps = capabilitiesFor(seat);
  if (!caps.viewIntegrations) return NOTHING;

  // Only the account owner changes anything; a recruiter sees status only,
  // because a dead channel affects their work even though it is not theirs.
  const owns = caps.editIntegrations;

  if (integration.owner === "platform") {
    return {
      canView: true,
      canToggle: owns,
      // Never configurable, never visible — not even to the account owner.
      canConfigure: false,
      canViewCredentials: false,
      note: "Managed by TigerHire — switch on or off, nothing to configure.",
    };
  }

  return {
    canView: true,
    canToggle: owns,
    canConfigure: owns,
    canViewCredentials: owns,
    note: owns
      ? "Your own account — yours to configure."
      : "Your organisation's account. Ask an owner to change it.",
  };
}

export interface ResolvedIntegration extends Integration {
  actions: IntegrationActions;
}

export function integrationsFor(seat: Seat | string | null | undefined): ResolvedIntegration[] {
  if (!capabilitiesFor(seat).viewIntegrations) return [];
  return INTEGRATIONS.map((i) => ({ ...i, actions: actionsFor(i.id, seat) }));
}

/**
 * Connection status.
 *
 * There is no org-wide health endpoint, so this product cannot currently tell
 * you whether WhatsApp is up. The page used to render "On" for every
 * integration regardless — a claim nobody checked, which is worse than no
 * claim because it gets believed. Until a real check exists, status is
 * reported as unknown and the UI points at whatever page can actually confirm
 * it.
 */
export interface IntegrationStatus {
  /** True only when a real check backs the label. */
  known: boolean;
  label: string;
  /** A page that can genuinely confirm this integration, if one exists. */
  verifyHref: string | null;
}

const VERIFY_HREF: Record<string, string> = {
  whatsapp: "/admin/whatsapp-health",
};

export function statusFor(integrationId: string): IntegrationStatus {
  const known = INTEGRATIONS.some((i) => i.id === integrationId);
  return {
    known: false,
    label: "Not checked here",
    verifyHref: known ? (VERIFY_HREF[integrationId] ?? null) : null,
  };
}
