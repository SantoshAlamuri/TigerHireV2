/**
 * The shapes and the one presentational primitive the analytics page is built
 * from, split out to keep the page itself under the size ratchet.
 *
 * `Row` is the application shape every panel derives from — the page's whole
 * premise is that the dashboard and the lists behind it cannot disagree, which
 * only holds while they read the same row.
 */
import { REJECT_REASONS } from "@/lib/v2/review-queue";

export interface Row {
  status?: string | null;
  source?: string | null;
  rejection_reason?: string | null;
  job_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  offer_accepted_at?: string | null;
  jobs?: { title?: string | null; created_at?: string | null } | null;
  fit_scores?: { overall_score?: number | null } | null;
}

export const TABS = ["Org overview", "Trends", "By job", "Quality & fairness"] as const;
export type Tab = (typeof TABS)[number];

export const REASON_LABEL: Record<string, string> = {
  ...Object.fromEntries(REJECT_REASONS.map((r) => [r.id, r.label])),
  unspecified: "No reason recorded",
};

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 px-4 py-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-white/40">{label}</div>
      <div className="font-mono text-2xl font-semibold tabular-nums text-[var(--text)]">
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-white/50">{sub}</div> : null}
    </div>
  );
}
