/** A15: which offer rows allow the public OTP gate vs hard stop. */

const OTP_FLOW_STATUSES = new Set(["sent", "pending_admin", "pending_finance", "negotiating"]);

const DEAD_STATUSES = new Set([
  "draft",
  "approved",
  "rejected",
  "accepted",
  "declined",
  "expired",
  "withdrawn",
]);

export function isOfferExpiredClock(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

export function allowsPublicOtpFlow(status: string, expiresAt: string | null | undefined): boolean {
  if (isOfferExpiredClock(expiresAt)) return false;
  return OTP_FLOW_STATUSES.has(status);
}

export function isOfferDeadForPublicPage(
  status: string,
  expiresAt: string | null | undefined,
  signingStatus?: string | null,
): boolean {
  if (isOfferExpiredClock(expiresAt)) return true;
  if (signingStatus === "withdrawn") return true;
  return DEAD_STATUSES.has(status);
}

export function publicOfferStatusLabel(status: string): string {
  switch (status) {
    case "sent":
      return "Awaiting your response";
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "expired":
      return "This offer has expired";
    case "pending_admin":
    case "pending_finance":
    case "negotiating":
      return "Under review";
    case "draft":
    case "approved":
      return "Not yet sent";
    case "rejected":
      return "Not approved internally";
    case "withdrawn":
      return "Withdrawn";
    default:
      return status.replace(/_/g, " ");
  }
}
