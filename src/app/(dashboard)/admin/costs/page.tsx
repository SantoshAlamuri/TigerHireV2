"use client";

import { useMemo, useState } from "react";
import { DollarSign, Loader2, Plus, RefreshCw } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { PageHeader } from "@/components/dashboard/PageHeader";
import StatCard from "@/components/dashboard/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useApiQuery } from "@/lib/hooks/use-api";

interface SummaryResponse {
  summary: {
    totalUsd: number;
    estimatedUsd: number;
    invoicedUsd: number;
    manualUsd: number;
    eventsCount: number;
  };
}

type ManualProvider = "vercel" | "supabase" | "anthropic" | "meta";

interface ManualForm {
  provider: ManualProvider;
  amountUsd: string;
  periodKey: string;
  service: string;
  notes: string;
}

const MANUAL_PROVIDER_LABEL: Record<ManualProvider, string> = {
  vercel: "Vercel",
  supabase: "Supabase",
  anthropic: "Anthropic (agents)",
  meta: "Meta (WhatsApp)",
};

function defaultPeriodKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface ProviderResponse {
  providers: Array<{
    provider: string;
    totalUsd: number;
    eventsCount: number;
  }>;
}

interface TrendResponse {
  trend: Array<{
    day: string;
    amountUsd: number;
    eventsCount: number;
  }>;
}

interface JobCostsResponse {
  jobs: Array<{
    jobId: string;
    jobTitle: string | null;
    organisationId: string | null;
    totalUsd: number;
    estimatedUsd: number;
    invoicedUsd: number;
    manualUsd: number;
    eventsCount: number;
    candidateCount: number;
    lastActivityAt: string | null;
    byLabel: Array<{ label: string; usd: number; events: number }>;
  }>;
  totalUsd: number;
  totalJobs: number;
  /** Anthropic rows in-range with null job_id (not listed per job below). */
  unattributedAnthropic?: { totalUsd: number; eventsCount: number };
}

const COLORS = ["#22c55e", "#3b82f6", "#a855f7", "#f59e0b", "#ec4899", "#06b6d4"];
const REPORT_CARD_CLASS = "card-lifted rounded-xl p-5";
const REPORT_ACTION_BUTTON_CLASS =
  "flex items-center gap-2 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/8 px-4 py-2 text-sm font-semibold text-[var(--accent)] transition-colors duration-200 hover:border-[var(--accent)]/45 hover:bg-[var(--accent)]/15 hover:text-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50";
const REPORT_FILTER_PANEL_CLASS =
  "card-lifted mb-4 flex flex-wrap items-center gap-3 rounded-xl p-3";

function formatUsd(amount: number): string {
  return amount.toLocaleString("en-GB", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getUTCDate();
  const month = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `${day} ${month}`;
}

type TooltipUsdValue = number | string | readonly (number | string)[] | undefined;

function tooltipUsd(value: TooltipUsdValue): string {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const num = typeof rawValue === "number" ? rawValue : Number(rawValue ?? 0);
  return formatUsd(Number.isFinite(num) ? num : 0);
}

interface ProviderSyncResult {
  provider: string;
  imported: number;
  skipped: boolean;
  reason?: string;
}

export default function AdminCostsPage() {
  const [rangeDays, setRangeDays] = useState(30);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<ProviderSyncResult[] | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualForm, setManualForm] = useState<ManualForm>({
    provider: "meta",
    amountUsd: "",
    periodKey: defaultPeriodKey(),
    service: "",
    notes: "",
  });
  const { toast } = useToast();

  const summaryQuery = useApiQuery<SummaryResponse>("/api/admin/costs/summary", { rangeDays });
  const providerQuery = useApiQuery<ProviderResponse>("/api/admin/costs/by-provider", {
    rangeDays,
  });
  const trendQuery = useApiQuery<TrendResponse>("/api/admin/costs/trend", { rangeDays });
  const jobsQuery = useApiQuery<JobCostsResponse>("/api/admin/costs/by-job", {
    rangeDays,
    limit: 25,
  });

  const loading = summaryQuery.loading || providerQuery.loading || trendQuery.loading;
  const summary = summaryQuery.data?.summary;
  const providers = useMemo(
    () => providerQuery.data?.providers ?? [],
    [providerQuery.data?.providers],
  );
  const trend = trendQuery.data?.trend ?? [];

  const pieData = useMemo(
    () => providers.map((p) => ({ name: p.provider, value: Number(p.totalUsd.toFixed(2)) })),
    [providers],
  );

  async function syncNow() {
    setSyncing(true);
    setSyncMessage(null);
    setSyncResults(null);
    toast({ title: "Syncing platform costs...", tone: "info" });
    try {
      const res = await fetch("/api/admin/costs/sync", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as {
        error?: string;
        results?: ProviderSyncResult[];
      };
      if (!res.ok) {
        const errorMessage = json.error ?? `Sync failed (${res.status})`;
        setSyncMessage(errorMessage);
        toast({ title: "Cost sync failed", description: errorMessage, tone: "error" });
        return;
      }
      const results = json.results ?? [];
      setSyncResults(results);
      const imported = results.reduce((sum, row) => sum + (row.imported ?? 0), 0);
      const skippedProviders = results.filter((r) => r.skipped).map((r) => r.provider);
      const summaryNote =
        skippedProviders.length > 0
          ? `Imported ${imported}. Skipped: ${skippedProviders.join(", ")}.`
          : `Imported ${imported} records across ${results.length} providers.`;
      setSyncMessage(summaryNote);
      toast({
        title: imported > 0 ? "Cost sync completed" : "Cost sync ran — nothing imported",
        description: summaryNote,
        tone: imported > 0 ? "success" : "info",
      });
      await Promise.all([
        summaryQuery.refetch(),
        providerQuery.refetch(),
        trendQuery.refetch(),
        jobsQuery.refetch(),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected sync error";
      setSyncMessage(message);
      toast({ title: "Cost sync failed", description: message, tone: "error" });
    } finally {
      setSyncing(false);
    }
  }

  async function submitManualCost(e: React.FormEvent) {
    e.preventDefault();
    const amountUsd = Number.parseFloat(manualForm.amountUsd);
    if (!Number.isFinite(amountUsd) || amountUsd < 0) {
      toast({ title: "Enter a valid USD amount", tone: "error" });
      return;
    }
    if (!manualForm.periodKey.trim()) {
      toast({ title: "Period (e.g. 2026-05) is required", tone: "error" });
      return;
    }
    setManualSaving(true);
    try {
      const res = await fetch("/api/admin/costs/manual", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: manualForm.provider,
          amountUsd,
          periodKey: manualForm.periodKey.trim(),
          service: manualForm.service.trim() || undefined,
          notes: manualForm.notes.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { error?: string; saved?: boolean };
      if (!res.ok || !json.saved) {
        const msg = json.error ?? `Save failed (${res.status})`;
        toast({ title: "Manual cost not saved", description: msg, tone: "error" });
        return;
      }
      toast({
        title: "Manual cost saved",
        description: `${MANUAL_PROVIDER_LABEL[manualForm.provider]} • ${manualForm.periodKey}`,
        tone: "success",
      });
      setManualOpen(false);
      setManualForm((prev) => ({ ...prev, amountUsd: "", notes: "" }));
      await Promise.all([
        summaryQuery.refetch(),
        providerQuery.refetch(),
        trendQuery.refetch(),
        jobsQuery.refetch(),
      ]);
    } catch (err) {
      toast({
        title: "Manual cost not saved",
        description: err instanceof Error ? err.message : "Unexpected error",
        tone: "error",
      });
    } finally {
      setManualSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Platform Costs"
        subtitle="Cross-provider spend — Vercel, Supabase, Anthropic agents, Meta WhatsApp. Auto-sync first, manual entry where APIs aren't available."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setManualOpen((prev) => !prev)}
              className={REPORT_ACTION_BUTTON_CLASS}
            >
              <Plus size={16} />
              Add manual cost
            </button>
            <button
              type="button"
              onClick={syncNow}
              disabled={syncing}
              className={REPORT_ACTION_BUTTON_CLASS}
            >
              {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Sync costs
            </button>
          </div>
        }
      />

      {manualOpen && (
        <form
          onSubmit={submitManualCost}
          className="card-lifted mb-4 grid grid-cols-1 gap-3 rounded-xl p-4 md:grid-cols-6"
        >
          <label className="md:col-span-2 flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-white/60">
            Provider
            <select
              value={manualForm.provider}
              onChange={(e) =>
                setManualForm((prev) => ({
                  ...prev,
                  provider: e.target.value as ManualProvider,
                }))
              }
              className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text)]"
            >
              {(Object.keys(MANUAL_PROVIDER_LABEL) as ManualProvider[]).map((key) => (
                <option key={key} value={key}>
                  {MANUAL_PROVIDER_LABEL[key]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-white/60">
            Amount (USD)
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={manualForm.amountUsd}
              onChange={(e) => setManualForm((prev) => ({ ...prev, amountUsd: e.target.value }))}
              placeholder="e.g. 142.50"
              className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text)]"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-white/60">
            Period
            <input
              type="text"
              required
              value={manualForm.periodKey}
              onChange={(e) => setManualForm((prev) => ({ ...prev, periodKey: e.target.value }))}
              placeholder="2026-05"
              className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text)]"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-white/60">
            Service
            <input
              type="text"
              value={manualForm.service}
              onChange={(e) => setManualForm((prev) => ({ ...prev, service: e.target.value }))}
              placeholder={manualForm.provider === "meta" ? "whatsapp" : "(optional)"}
              className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text)]"
            />
          </label>

          <label className="md:col-span-6 flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-white/60">
            Note (optional)
            <input
              type="text"
              value={manualForm.notes}
              onChange={(e) => setManualForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Invoice ref, reason, etc."
              className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text)]"
            />
          </label>

          <div className="md:col-span-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setManualOpen(false)}
              disabled={manualSaving}
              className="h-9 rounded-full border border-[var(--border)] px-4 text-sm text-white/70 hover:text-white"
            >
              Cancel
            </button>
            <button type="submit" disabled={manualSaving} className={REPORT_ACTION_BUTTON_CLASS}>
              {manualSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Save manual cost
            </button>
          </div>
        </form>
      )}
      <div className={REPORT_FILTER_PANEL_CLASS}>
        <label
          htmlFor="cost-range"
          className="text-[11px] font-semibold uppercase tracking-wide text-white/60"
        >
          Date range
        </label>
        <select
          id="cost-range"
          value={rangeDays}
          onChange={(e) => setRangeDays(parseInt(e.target.value, 10))}
          className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text)] transition-colors duration-150 hover:border-[var(--accent)]/30 focus:border-white/20/40 focus:outline-none"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last 365 days</option>
        </select>
      </div>

      {syncMessage && (
        <p className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface)]/55 px-3 py-2 text-sm text-white/60">
          {syncMessage}
        </p>
      )}

      {syncResults && syncResults.length > 0 && (
        <div className="card-lifted mb-4 rounded-xl p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
            Last sync — per provider
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {syncResults.map((r) => (
              <div
                key={r.provider}
                className="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              >
                <span className="font-medium text-[var(--text)] capitalize">{r.provider}</span>
                {r.skipped ? (
                  <span className="text-amber-400/90 text-xs">
                    skipped — {r.reason ?? "unknown reason"}
                  </span>
                ) : (
                  <span className="text-emerald-400/90 text-xs">imported {r.imported}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Total spend"
              value={formatUsd(summary?.totalUsd ?? 0)}
              icon={<DollarSign size={20} />}
            />
            <StatCard label="Invoiced" value={formatUsd(summary?.invoicedUsd ?? 0)} />
            <StatCard label="Estimated" value={formatUsd(summary?.estimatedUsd ?? 0)} />
            <StatCard label="Manual" value={formatUsd(summary?.manualUsd ?? 0)} />
            <StatCard label="Cost events" value={(summary?.eventsCount ?? 0).toLocaleString()} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className={REPORT_CARD_CLASS}>
              <div className="mb-4 space-y-1">
                <h2 className="heading-section text-lg text-[var(--text)]">Spend trend</h2>
                <p className="text-xs text-white/60">
                  One total per UTC calendar day (all providers). If your vendor shows local dates,
                  a session can sit on the neighbour day here.
                </p>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend.map((t) => ({ ...t, dayLabel: formatDay(t.day) }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-[var(--border)]" />
                    <XAxis dataKey="dayLabel" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                    <Tooltip
                      formatter={(value) => tooltipUsd(value)}
                      contentStyle={{
                        backgroundColor: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                      }}
                      cursor={{ stroke: "rgba(249, 115, 22, 0.22)", strokeWidth: 1 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="amountUsd"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={REPORT_CARD_CLASS}>
              <div className="mb-4 space-y-1">
                <h2 className="heading-section text-lg text-[var(--text)]">Provider split</h2>
                <p className="text-xs text-white/60">Share of spend across integrated providers.</p>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={100}
                      label
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell
                          key={entry.name}
                          fill={COLORS[index % COLORS.length]}
                          stroke="transparent"
                          strokeWidth={0}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => tooltipUsd(value)}
                      contentStyle={{
                        backgroundColor: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1">
                {providers.map((provider) => (
                  <p
                    key={provider.provider}
                    className="rounded-md px-2 py-1 text-sm text-white/60 transition-colors duration-150 hover:bg-white/[0.04]"
                  >
                    {provider.provider}: {formatUsd(provider.totalUsd)} ({provider.eventsCount}{" "}
                    events)
                  </p>
                ))}
                {providers.length === 0 && (
                  <p className="text-sm text-white/60">No cost events yet.</p>
                )}
              </div>
            </div>
          </div>

          <div className={REPORT_CARD_CLASS}>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div className="space-y-1">
                <h2 className="heading-section text-lg text-[var(--text)]">Top jobs by AI spend</h2>
                <p className="text-xs text-white/60">
                  Rows come only from ledger events where{" "}
                  <code className="text-white/80">job_id</code> is set (FitScore path after
                  attribution). Spend with a missing <code className="text-white/80">job_id</code>{" "}
                  never appears under a job title — use “Unattributed” below and labels in metadata
                  to reconcile. Increase the date range if the job had no scored candidates in this
                  window.
                </p>
              </div>
              {jobsQuery.data && (
                <div className="text-right text-xs text-white/50">
                  <p>
                    {jobsQuery.data.totalJobs} job{jobsQuery.data.totalJobs === 1 ? "" : "s"} ·{" "}
                    {formatUsd(jobsQuery.data.totalUsd)} job-attributed
                  </p>
                  {jobsQuery.data.unattributedAnthropic &&
                  jobsQuery.data.unattributedAnthropic.eventsCount > 0 ? (
                    <p className="mt-0.5 text-amber-200/90">
                      Unattributed Anthropic:{" "}
                      {formatUsd(jobsQuery.data.unattributedAnthropic.totalUsd)} (
                      {jobsQuery.data.unattributedAnthropic.eventsCount} events, no job_id)
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            {jobsQuery.loading ? (
              <Skeleton className="h-48 rounded-lg" />
            ) : !jobsQuery.data || jobsQuery.data.jobs.length === 0 ? (
              <p className="text-sm text-white/60">
                No job-attributed AI spend yet. New runs will appear here once the FitScore pipeline
                records job/candidate context (existing rows pre-dating this rollout are excluded).
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--bg-elevated)] text-[11px] uppercase tracking-wide text-white/55">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Job</th>
                      <th className="px-3 py-2 text-right font-semibold">Total USD</th>
                      <th className="px-3 py-2 text-right font-semibold">Candidates</th>
                      <th className="px-3 py-2 text-right font-semibold">Events</th>
                      <th className="px-3 py-2 text-left font-semibold">Top label</th>
                      <th className="px-3 py-2 text-right font-semibold">Last activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobsQuery.data.jobs.map((job) => {
                      const top = job.byLabel[0];
                      return (
                        <tr
                          key={job.jobId}
                          className="border-t border-[var(--border)] transition-colors duration-150 hover:bg-white/[0.03]"
                        >
                          <td className="px-3 py-2 text-[var(--text)]">
                            <div className="font-medium">{job.jobTitle ?? "(untitled job)"}</div>
                            <div className="text-[11px] text-white/45">
                              {job.jobId.slice(0, 8)}…
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-[var(--text)]">
                            {formatUsd(job.totalUsd)}
                          </td>
                          <td className="px-3 py-2 text-right text-white/70">
                            {job.candidateCount}
                          </td>
                          <td className="px-3 py-2 text-right text-white/70">{job.eventsCount}</td>
                          <td className="px-3 py-2 text-white/70">
                            {top ? `${top.label} (${formatUsd(top.usd)})` : "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-white/55 text-xs">
                            {job.lastActivityAt
                              ? new Date(job.lastActivityAt).toLocaleString("en-GB", {
                                  day: "2-digit",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
