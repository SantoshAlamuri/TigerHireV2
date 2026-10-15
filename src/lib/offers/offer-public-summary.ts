import { publicOfferStatusLabel } from "@/lib/offers/offer-public-gate";

export type PublicOfferSummary = {
  id: string;
  roleTitle: string;
  companyName: string | null;
  startDate: string | null;
  compensation: Record<string, unknown> | null;
  notes: string | null;
  status: string;
  statusLabel: string;
  canRespond: boolean;
};

export function buildPublicOfferSummary(
  offer: Record<string, unknown>,
  orgName: string | null,
): PublicOfferSummary {
  const status = String(offer.status ?? "");
  const doc = offer.document_content as string | undefined;
  const native = typeof doc === "string" && doc.trim().length > 0;
  const canRespond = status === "sent" && !native;
  return {
    id: String(offer.id ?? ""),
    roleTitle: String(offer.role_title ?? "Role"),
    companyName: orgName,
    startDate: (offer.start_date as string | null) ?? null,
    compensation: (offer.compensation_json as Record<string, unknown> | null) ?? null,
    notes: (offer.notes as string | null) ?? null,
    status,
    statusLabel: publicOfferStatusLabel(status),
    canRespond,
  };
}
