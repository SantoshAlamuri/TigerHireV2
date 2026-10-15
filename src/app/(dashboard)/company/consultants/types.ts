export interface Consultant {
  linkId: string;
  agencyOrganisationId: string;
  name: string;
  isActive: boolean;
  linkedAt: string;
  status: "pending" | "active" | "revoked";
  initiatedBy: "agency" | "company" | null;
}

export interface ConsultantInvite {
  id: string;
  email: string;
  agencyName: string | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

export interface ConsultantsResponse {
  consultants: Consultant[];
  /** Firms that asked for access and are waiting on this company's decision. */
  requests: Consultant[];
  invites: ConsultantInvite[];
  canManage: boolean;
}

export function formatInviteDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
