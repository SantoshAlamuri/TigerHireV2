export const REPORT_CARD_CLASS = "card-lifted rounded-xl p-5";
export const ATTENTION_CARD_CLASS =
  "card-lifted card-lifted-hover rounded-xl border border-[var(--border)] p-4";
const HOURS_PER_DAY = 24;

export function hoursSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return null;
  return (Date.now() - timestamp) / (1000 * 60 * 60);
}

export function formatFreshness(iso: string | null | undefined): string {
  const hours = hoursSince(iso);
  if (hours == null) return "Unknown freshness";
  if (hours < 1) return "<1h ago";
  if (hours < HOURS_PER_DAY) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / HOURS_PER_DAY)}d ago`;
}

export function formatUserHint(userId: string | null | undefined): string {
  if (!userId) return "Unassigned";
  if (userId.length <= 10) return userId;
  return `${userId.slice(0, 6)}...${userId.slice(-4)}`;
}

export function getSlaState(
  ageHours: number | null,
  thresholds: { warningHours: number; breachHours: number },
): "ok" | "warning" | "breach" {
  if (ageHours == null) return "warning";
  if (ageHours >= thresholds.breachHours) return "breach";
  if (ageHours >= thresholds.warningHours) return "warning";
  return "ok";
}

export function getSlaToneClass(state: "ok" | "warning" | "breach"): string {
  if (state === "breach") return "border-red-400/35 bg-red-500/15 text-red-200";
  if (state === "warning") return "border-amber-400/35 bg-amber-500/15 text-amber-200";
  return "border-emerald-400/35 bg-emerald-500/15 text-emerald-200";
}

export function isWorkflowComplete(payload: Record<string, unknown> | null | undefined): boolean {
  if (!payload || typeof payload !== "object") return false;
  const workflowCandidate = payload.workflow;
  if (!workflowCandidate || typeof workflowCandidate !== "object") return false;
  const workflow = workflowCandidate as Record<string, unknown>;
  return (
    workflow.companyInfoSaved === true &&
    workflow.billingProfileSaved === true &&
    workflow.creditsConfigured === true &&
    workflow.overridesReviewed === true
  );
}
