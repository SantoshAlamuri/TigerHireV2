"use client";

import { useMemo } from "react";
import {
  Loader2,
  RefreshCw,
  Gauge,
  Layers,
  DatabaseZap,
  IndianRupee,
  ShieldAlert,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { PageHeader } from "@/components/dashboard/PageHeader";
import StatCard from "@/components/dashboard/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/lib/hooks/use-api";

interface CascadeReport {
  generated_at: string;
  fx_usd_to_inr: number;
  caps: {
    role_cap_inr: number;
    daily_cap_inr: number;
    monthly_cap_inr: number;
    global_cap_disabled: boolean;
    primary_unit: string;
  };
  per_role: {
    top_by_spend: Array<{
      job_id: string;
      organisation_id: string | null;
      spend_inr: number;
      cap_inr: number;
      pct_used: number;
      calls: number;
      blocked: boolean;
    }>;
    roles_near_cap: CascadeReport["per_role"]["top_by_spend"];
    roles_blocked: CascadeReport["per_role"]["top_by_spend"];
  };
  budget: {
    day: BudgetWindow;
    month: BudgetWindow;
  };
  layer_mix: {
    last_24h: Record<string, number>;
    last_7d: Record<string, number>;
  };
  cache: { hits_24h: number; total_24h: number; hit_pct: number };
  top_layer_0_knockouts_7d: Array<{ reason: string; count: number }>;
  cost_by_layer_24h: Record<string, { count: number; inrTotal: number }>;
  recent_daily_spend_14d: Array<{ day: string; spendInr: number; callCount: number }>;
}

interface BudgetWindow {
  spent_inr: number;
  cap_inr: number;
  pct_used: number;
  calls: number;
  warn_alerted: boolean;
  warn_at_pct: number;
}

const CARD = "card-lifted rounded-xl p-5";
const ACTION_BUTTON =
  "flex items-center gap-2 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/8 px-4 py-2 text-sm font-semibold text-[var(--accent)] transition-colors duration-200 hover:border-[var(--accent)]/45 hover:bg-[var(--accent)]/15 disabled:cursor-not-allowed disabled:opacity-50";

/** Human display order + labels for cascade layers. */
const LAYER_LABEL: Record<string, string> = {
  LAYER_0_KNOCKOUT: "L0 · Knockout",
  LAYER_0_QUALIFY: "L0 · Auto-qualify",
  LAYER_1: "L1 · Embedding",
  LAYER_2: "L2 · Haiku",
  LAYER_3: "L3 · Sonnet",
  CACHE_HIT: "Cache hit",
};
const LAYER_ORDER = [
  "LAYER_0_KNOCKOUT",
  "LAYER_0_QUALIFY",
  "LAYER_1",
  "LAYER_2",
  "LAYER_3",
  "CACHE_HIT",
];
const LAYER_COLOR: Record<string, string> = {
  LAYER_0_KNOCKOUT: "#ef4444",
  LAYER_0_QUALIFY: "#22c55e",
  LAYER_1: "#06b6d4",
  LAYER_2: "#3b82f6",
  LAYER_3: "#a855f7",
  CACHE_HIT: "#f59e0b",
};

function inr(n: number): string {
  return `₹${(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
}

function pctBarColor(pct: number): string {
  if (pct >= 100) return "bg-rose-500";
  if (pct >= 80) return "bg-amber-500";
  return "bg-emerald-500";
}

function BudgetBar({ label, window: w }: { label: string; window: BudgetWindow }) {
  const pct = Math.min(100, w.pct_used);
  return (
    <div className={CARD}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text)]">{label}</h3>
        <span className="text-xs text-white/55">{w.calls} calls</span>
      </div>
      <div className="mb-1 flex items-end justify-between">
        <span className="text-2xl font-bold text-[var(--text)]">{inr(w.spent_inr)}</span>
        <span className="text-xs text-white/55">of {inr(w.cap_inr)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className={`h-full rounded-full transition-all ${pctBarColor(w.pct_used)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-white/50">
        <span>{w.pct_used}% used</span>
        {w.warn_alerted ? (
          <span className="text-amber-400">⚠ warn alert sent</span>
        ) : (
          <span>warn at {w.warn_at_pct}%</span>
        )}
      </div>
    </div>
  );
}

export default function AdminCascadePage() {
  const report = useApiQuery<CascadeReport>("/api/admin/cascade/report");
  const data = report.data;

  const layerRows = useMemo(() => {
    const mix = data?.layer_mix?.last_24h ?? {};
    const total = Object.values(mix).reduce((s, n) => s + n, 0);
    return LAYER_ORDER.filter((k) => (mix[k] ?? 0) > 0).map((k) => ({
      key: k,
      label: LAYER_LABEL[k] ?? k,
      count: mix[k] ?? 0,
      pct: total > 0 ? Math.round(((mix[k] ?? 0) / total) * 100) : 0,
      color: LAYER_COLOR[k] ?? "#64748b",
    }));
  }, [data?.layer_mix?.last_24h]);

  const layerTotal24h = useMemo(
    () => Object.values(data?.layer_mix?.last_24h ?? {}).reduce((s, n) => s + n, 0),
    [data?.layer_mix?.last_24h],
  );

  const trend = useMemo(
    () =>
      [...(data?.recent_daily_spend_14d ?? [])]
        .reverse()
        .map((t) => ({ ...t, dayLabel: formatDay(t.day) })),
    [data?.recent_daily_spend_14d],
  );

  return (
    <>
      <PageHeader
        title="Cascade & Cost"
        subtitle="Per-role Anthropic budget, cascade layer mix, verdict cache, and Layer 0 knockouts. The primary cost gate is per role — one ₹ ceiling per job."
        actions={
          <button
            type="button"
            onClick={() => report.refetch()}
            disabled={report.loading}
            className={ACTION_BUTTON}
          >
            {report.loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            Refresh
          </button>
        }
      />

      {report.loading && !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : !data ? (
        <p className="text-sm text-white/60">Could not load the cascade report.</p>
      ) : (
        <div className="space-y-6">
          {/* Caps banner */}
          <div className={`${CARD} flex flex-wrap items-center gap-x-6 gap-y-2`}>
            <div className="flex items-center gap-2 text-sm">
              <Gauge size={16} className="text-[var(--accent)]" />
              <span className="text-white/55">Per-role cap</span>
              <span className="font-bold text-[var(--text)]">{inr(data.caps.role_cap_inr)}</span>
              <span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--accent)]">
                primary
              </span>
            </div>
            <div className="text-sm text-white/55">
              Day backstop{" "}
              <span className="font-semibold text-white/80">{inr(data.caps.daily_cap_inr)}</span> ·
              Month{" "}
              <span className="font-semibold text-white/80">{inr(data.caps.monthly_cap_inr)}</span>
              {data.caps.global_cap_disabled && (
                <span className="ml-2 rounded bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/55">
                  backstop disabled
                </span>
              )}
            </div>
            <div className="ml-auto text-[11px] text-white/40">
              FX ₹{data.fx_usd_to_inr}/$ · {new Date(data.generated_at).toLocaleString("en-GB")}
            </div>
          </div>

          {/* Top stat cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Today's spend"
              value={inr(data.budget.day.spent_inr)}
              icon={<IndianRupee size={20} />}
            />
            <StatCard label="This month" value={inr(data.budget.month.spent_inr)} />
            <StatCard
              label="Cache hit rate (24h)"
              value={`${data.cache.hit_pct}%`}
              icon={<DatabaseZap size={20} />}
            />
            <StatCard
              label="Scored last 24h"
              value={layerTotal24h.toLocaleString("en-IN")}
              icon={<Layers size={20} />}
            />
          </div>

          {/* Budget bars */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <BudgetBar label="Daily backstop" window={data.budget.day} />
            <BudgetBar label="Monthly backstop" window={data.budget.month} />
          </div>

          {/* Layer mix + Knockouts */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className={CARD}>
              <div className="mb-4 space-y-1">
                <h2 className="heading-section text-lg text-[var(--text)]">Layer mix (24h)</h2>
                <p className="text-xs text-white/60">
                  Which cascade layer resolved each verdict. The cheaper the layer, the lower the
                  cost — the goal is most volume at L0/L1.
                </p>
              </div>
              {layerRows.length === 0 ? (
                <p className="text-sm text-white/55">
                  No cascade decisions in the last 24h yet. Numbers appear once the cascade is wired
                  into scoring and traffic flows.
                </p>
              ) : (
                <div className="space-y-3">
                  {layerRows.map((row) => (
                    <div key={row.key}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-white/75">{row.label}</span>
                        <span className="text-white/55">
                          {row.count.toLocaleString("en-IN")} · {row.pct}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${row.pct}%`, backgroundColor: row.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={CARD}>
              <div className="mb-4 space-y-1">
                <h2 className="heading-section text-lg text-[var(--text)]">
                  Top Layer 0 knockouts (7d)
                </h2>
                <p className="text-xs text-white/60">
                  Deterministic rejections that cost ₹0. High counts here mean the cascade is saving
                  the most money.
                </p>
              </div>
              {data.top_layer_0_knockouts_7d.length === 0 ? (
                <p className="text-sm text-white/55">No Layer 0 knockouts recorded yet.</p>
              ) : (
                <ul className="space-y-2">
                  {data.top_layer_0_knockouts_7d.map((k) => (
                    <li
                      key={k.reason}
                      className="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                    >
                      <span className="text-white/75">{k.reason}</span>
                      <span className="font-semibold text-rose-300">{k.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Per-role spend table */}
          <div className={CARD}>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div className="space-y-1">
                <h2 className="heading-section text-lg text-[var(--text)]">Top roles by spend</h2>
                <p className="text-xs text-white/60">
                  Each role has its own ₹ ceiling. A role at 100% stops triggering paid scoring;
                  remaining candidates rank by the cheaper layers.
                </p>
              </div>
              {(data.per_role.roles_blocked.length > 0 ||
                data.per_role.roles_near_cap.length > 0) && (
                <div className="flex items-center gap-2 text-xs">
                  {data.per_role.roles_blocked.length > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-1 text-rose-300">
                      <ShieldAlert size={12} />
                      {data.per_role.roles_blocked.length} blocked
                    </span>
                  )}
                  {data.per_role.roles_near_cap.length > 0 && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-1 text-amber-300">
                      {data.per_role.roles_near_cap.length} near cap
                    </span>
                  )}
                </div>
              )}
            </div>
            {data.per_role.top_by_spend.length === 0 ? (
              <p className="text-sm text-white/55">
                No per-role spend recorded yet. Rows appear as jobs accumulate Anthropic cost.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--bg-elevated)] text-[11px] uppercase tracking-wide text-white/55">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Job</th>
                      <th className="px-3 py-2 text-right font-semibold">Spend</th>
                      <th className="px-3 py-2 text-right font-semibold">Cap</th>
                      <th className="px-3 py-2 text-left font-semibold">Used</th>
                      <th className="px-3 py-2 text-right font-semibold">Calls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.per_role.top_by_spend.map((r) => (
                      <tr
                        key={r.job_id}
                        className="border-t border-[var(--border)] transition-colors duration-150 hover:bg-white/[0.03]"
                      >
                        <td className="px-3 py-2 text-[var(--text)]">
                          <div className="font-mono text-[11px] text-white/70">
                            {r.job_id.slice(0, 8)}…
                          </div>
                          {r.blocked && (
                            <span className="text-[10px] font-semibold uppercase text-rose-400">
                              blocked
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-[var(--text)]">
                          {inr(r.spend_inr)}
                        </td>
                        <td className="px-3 py-2 text-right text-white/60">{inr(r.cap_inr)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
                              <div
                                className={`h-full rounded-full ${pctBarColor(r.pct_used)}`}
                                style={{ width: `${Math.min(100, r.pct_used)}%` }}
                              />
                            </div>
                            <span className="text-xs text-white/55">{r.pct_used}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-white/70">{r.calls}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Daily spend trend */}
          <div className={CARD}>
            <div className="mb-4 space-y-1">
              <h2 className="heading-section text-lg text-[var(--text)]">Daily spend (14d)</h2>
              <p className="text-xs text-white/60">Total Anthropic spend per UTC day, in ₹.</p>
            </div>
            {trend.length === 0 ? (
              <p className="text-sm text-white/55">No spend recorded in the last 14 days.</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-[var(--border)]" />
                    <XAxis dataKey="dayLabel" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                    <Tooltip
                      formatter={(value) => inr(Number(value ?? 0))}
                      contentStyle={{
                        backgroundColor: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                      }}
                      cursor={{ stroke: "rgba(249, 115, 22, 0.22)", strokeWidth: 1 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="spendInr"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
