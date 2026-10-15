export const COUNTRY_CODES = [
  { code: "+91", label: "India" },
  { code: "+1", label: "United States/Canada" },
  { code: "+44", label: "United Kingdom" },
  { code: "+61", label: "Australia" },
  { code: "+65", label: "Singapore" },
  { code: "+971", label: "UAE" },
] as const;

export function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

export function payoutSplitLabel(directAmount: number, parentAmount: number): string {
  const direct = directAmount > 0 ? formatInr(directAmount) : "—";
  const parent = parentAmount > 0 ? formatInr(parentAmount) : "—";
  return `If payout milestone is met: You ${direct} · Parent ${parent}`;
}

export function inviteJoinUrl(parentReferrerId: string): string {
  const base =
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL ?? "https://tigerhire.io");
  // Onboarding consolidated 2026-05-12: the standalone `/refer/join` page now
  // redirects to `/register`, so invite links can target `/register` directly.
  // We still pass `parent` + `referral_intent=true` so the post-register flow
  // wires the new candidate's `referrers.parent_referrer_id` correctly when
  // they activate the "Refer & earn" setup from their dashboard.
  return `${base}/register?referral_intent=true&parent=${encodeURIComponent(parentReferrerId)}`;
}

export function inviteJoinWhatsAppUrl(parentReferrerId: string): string {
  const joinUrl = inviteJoinUrl(parentReferrerId);
  const message = `Join my referral network on TigerHire using this invite link: ${joinUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function whatsAppReferralLinkShareUrl(opts: {
  jobTitle: string;
  companyName: string;
  applyUrl: string;
  directBonusAmount: number;
}): string {
  const { jobTitle, companyName, applyUrl, directBonusAmount } = opts;
  if (directBonusAmount > 0) {
    const amt = formatInr(directBonusAmount);
    const message = `I found a role that pays ${amt} for a referral — ${jobTitle} at ${companyName}. Apply here: ${applyUrl}`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }
  const message = `I found a role — ${jobTitle} at ${companyName}. Apply here: ${applyUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function pipelineStagePillClasses(stage: string): string {
  const s = stage.toLowerCase();
  if (s === "applied")
    return "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)] border-[var(--status-neutral-border)]";
  if (s === "screened")
    return "bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border-[var(--status-info-border)]";
  if (s === "shortlisted")
    return "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] border-[var(--status-warning-border)]";
  if (s === "interview")
    return "bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border-[var(--status-info-border)]";
  if (s === "offer")
    return "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]";
  if (s === "rejected")
    return "bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)] border-[var(--status-danger-border)]";
  return "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)] border-[var(--status-neutral-border)]";
}

export function pipelineStageLabel(stage: string): string {
  const s = stage.toLowerCase();
  if (s === "applied") return "Applied";
  if (s === "screened") return "Screened";
  if (s === "shortlisted") return "Shortlisted";
  if (s === "interview") return "Interview";
  if (s === "offer") return "Offer";
  if (s === "rejected") return "Rejected";
  return stage.replace(/_/g, " ");
}

export function payoutStatusPillClasses(status: string): string {
  if (status === "paid")
    return "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]";
  if (status === "confirmed")
    return "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] border-[var(--status-warning-border)]";
  if (status === "pending")
    return "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)] border-[var(--status-neutral-border)]";
  return "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)] border-[var(--status-neutral-border)]";
}

export const EMPLOYEE_REFERRAL_STATUS_STYLES: Record<string, string> = {
  invited:
    "bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border-[var(--status-info-border)]",
  cv_received:
    "bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border-[var(--status-info-border)]",
  scored:
    "bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border-[var(--status-info-border)]",
  shortlisted:
    "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] border-[var(--status-warning-border)]",
  interviewed:
    "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] border-[var(--status-warning-border)]",
  hired:
    "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]",
  rejected:
    "bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)] border-[var(--status-danger-border)]",
};

export function daysSinceApplied(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const start = new Date(t);
  const today = new Date();
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.round((todayUtc - startUtc) / 86_400_000));
}

export function setupNameFallback(name?: string | null, email?: string | null): string {
  const n = name?.trim();
  if (n) return n;
  const emailPrefix = email?.split("@")[0]?.trim();
  return emailPrefix || "Candidate";
}

/**
 * sessionStorage key written by `/register` when an invite link
 * (`/register?parent=<referrer_id>`) lands on the registration page. Read here
 * during inline Refer & Earn setup so we can post `parent_referrer_id` to
 * `/api/refer/join` and preserve invite-chain attribution end-to-end.
 *
 * Kept in sync with the constant of the same name in
 * `src/app/(auth)/register/page.tsx`.
 */
export const PENDING_PARENT_REFERRER_KEY = "th_pending_parent_referrer_id";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the parent referrer id for an inline Refer & Earn activation:
 *   1. `?parent=<uuid>` on the current URL (direct hit on /dashboard/referrer)
 *   2. sessionStorage value stashed by the register page
 * Returns null when neither is present or valid.
 */
export function readPendingParentReferrerId(searchParams: URLSearchParams): string | null {
  const fromUrl = searchParams.get("parent");
  if (fromUrl && UUID_RE.test(fromUrl)) return fromUrl;
  if (typeof window === "undefined") return null;
  try {
    const fromStorage = window.sessionStorage.getItem(PENDING_PARENT_REFERRER_KEY);
    if (fromStorage && UUID_RE.test(fromStorage)) return fromStorage;
  } catch {
    // sessionStorage access can throw in private/blocked contexts — ignore.
  }
  return null;
}

export function clearPendingParentReferrerId(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_PARENT_REFERRER_KEY);
  } catch {
    // ignore — see readPendingParentReferrerId
  }
}
