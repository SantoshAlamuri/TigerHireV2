/**
 * Offer state, expressed as something a recruiter can act on.
 *
 * India loses roughly a third of offers at this stage, and most candidates take
 * the first offer they receive — so an aging offer is not a status, it is a
 * countdown. The distinction that drives everything here:
 *
 *   sent-and-never-opened  → a DELIVERY problem (wrong email, spam, no signal)
 *   opened-repeatedly-unsigned → a DECISION problem (negotiating, competing offer)
 *
 * Those need opposite responses, so they must never render as the same chip.
 */
export interface OfferRow {
  id: string;
  candidateName: string;
  status: string;
  signingStatus: string | null;
  sentAt: string | null;
  firstViewedAt: string | null;
  viewCount: number;
  signedAt: string | null;
  declinedAt: string | null;
  expiresAt: string | null;
}

export interface OfferState {
  stage: string;
  /** Days since the offer was sent; 0 when it never was. */
  daysOut: number;
  needsAction: boolean;
  hint: string;
}

const DAY_MS = 86_400_000;

/** Past this, an unanswered offer is a live risk rather than normal latency. */
const NUDGE_AFTER_DAYS = 3;

function daysBetween(iso: string | null, now: number): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.floor((now - ms) / DAY_MS));
}

export function offerState(offer: OfferRow, now: number = Date.now()): OfferState {
  const daysOut = daysBetween(offer.sentAt, now);

  // Terminal states first — an offer that is signed is not also expiring.
  if (offer.signedAt || offer.status === "accepted") {
    return { stage: "Signed", daysOut, needsAction: false, hint: "Accepted and signed." };
  }
  if (offer.declinedAt || offer.status === "declined") {
    return { stage: "Declined", daysOut, needsAction: false, hint: "Candidate declined." };
  }

  const expiresMs = offer.expiresAt ? Date.parse(offer.expiresAt) : NaN;
  if (!Number.isNaN(expiresMs) && expiresMs < now) {
    return {
      stage: "Expired",
      daysOut,
      // Expiry is not a quiet close — somebody has to decide whether to re-issue.
      needsAction: true,
      hint: "Lapsed without an answer. Re-issue or close it deliberately.",
    };
  }

  if (!offer.sentAt) {
    return { stage: "Draft", daysOut: 0, needsAction: false, hint: "Not sent yet." };
  }

  const aging = daysOut >= NUDGE_AFTER_DAYS;

  if (!offer.firstViewedAt) {
    return {
      stage: "Sent, not opened",
      daysOut,
      needsAction: aging,
      hint: aging
        ? "Never opened. Check they actually received it before assuming hesitation."
        : "Sent. Give it a day before chasing.",
    };
  }

  return {
    stage: "Opened, not signed",
    daysOut,
    needsAction: aging,
    hint:
      offer.viewCount > 1
        ? "Opened more than once and still unsigned — they are deciding. A call beats another email."
        : "Opened. Considering it.",
  };
}
