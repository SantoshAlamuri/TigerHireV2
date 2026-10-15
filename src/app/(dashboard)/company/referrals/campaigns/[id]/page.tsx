"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Megaphone, Pause, Play, Rocket, StopCircle } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";

type CampaignDetailPayload = {
  campaign: {
    id: string;
    name: string;
    objective: "more_referrals" | "urgent_role_fill";
    audience_filter: "all_referrers" | "org_verified_only" | "city_match";
    status: "draft" | "active" | "paused" | "ended";
    starts_at: string | null;
    ends_at: string | null;
    launched_at: string | null;
    updated_at: string;
  };
  jobs: Array<{ id: string; job_id: string; job_title: string; job_status: string }>;
  recipient_counts: Record<string, number>;
  recent_events: Array<{
    id: string;
    event_type: string;
    event_payload: Record<string, unknown>;
    created_at: string;
  }>;
};

type MetricsPayload = {
  metrics: {
    recipients_total: number;
    sent: number;
    failed: number;
    applications: number;
    shortlisted: number;
    offers: number;
    hires: number;
  };
};

export default function CompanyReferralCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const campaignId = params?.id;
  const [detail, setDetail] = useState<CampaignDetailPayload | null>(null);
  const [metrics, setMetrics] = useState<MetricsPayload["metrics"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [objective, setObjective] = useState<"more_referrals" | "urgent_role_fill">(
    "more_referrals",
  );

  const recipientsTotal = useMemo(
    () => Object.values(detail?.recipient_counts ?? {}).reduce((sum, n) => sum + n, 0),
    [detail?.recipient_counts],
  );

  async function loadAll() {
    if (!campaignId) return;
    const [detailRes, metricsRes] = await Promise.all([
      fetch(`/api/referral-campaigns/${campaignId}`, { credentials: "include" }),
      fetch(`/api/referral-campaigns/${campaignId}/metrics`, { credentials: "include" }),
    ]);
    if (!detailRes.ok) {
      const payload = (await detailRes.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "Failed to load campaign");
    }
    const d = (await detailRes.json()) as CampaignDetailPayload;
    setDetail(d);
    setName(d.campaign.name);
    setObjective(d.campaign.objective);

    if (metricsRes.ok) {
      const m = (await metricsRes.json()) as MetricsPayload;
      setMetrics(m.metrics);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadAll();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  async function patchCampaign(body: Record<string, unknown>, successMessage: string) {
    if (!campaignId) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/referral-campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Update failed");
      await loadAll();
      setNotice(successMessage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function launchCampaign() {
    if (!campaignId) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/referral-campaigns/${campaignId}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ batchSize: 25 }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Launch failed");
      await loadAll();
      setNotice("Campaign launched");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Launch failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="alive-air space-y-6">
      <PageHeader
        title="Referral Campaign Detail"
        subtitle="Manage run state, jobs, and conversion metrics."
      />
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="card-lifted p-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-3 h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : !detail ? (
        <div className="card-lifted p-8 text-center text-sm text-white/60">Campaign not found.</div>
      ) : (
        <div className="space-y-4">
          {notice ? (
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : null}

          <section className="card-lifted space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <Megaphone size={16} className="text-[var(--accent)]" />
                Campaign settings
              </h2>
              <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs capitalize text-white/60">
                {detail.campaign.status}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
              />
              <select
                value={objective}
                onChange={(e) =>
                  setObjective(e.target.value as "more_referrals" | "urgent_role_fill")
                }
                className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
              >
                <option value="more_referrals">More referrals</option>
                <option value="urgent_role_fill">Urgent role fill</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || name.trim().length < 3}
                onClick={() => patchCampaign({ name: name.trim(), objective }, "Campaign updated")}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--text)] disabled:opacity-50"
              >
                {busy ? "Saving..." : "Save"}
              </button>
              {detail.campaign.status !== "active" && detail.campaign.status !== "ended" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={launchCampaign}
                  className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-black disabled:opacity-50"
                >
                  <Rocket size={14} />
                  Launch
                </button>
              ) : null}
              {detail.campaign.status === "active" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => patchCampaign({ status: "paused" }, "Campaign paused")}
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--text)] disabled:opacity-50"
                >
                  <Pause size={14} />
                  Pause
                </button>
              ) : null}
              {detail.campaign.status === "paused" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => patchCampaign({ status: "active" }, "Campaign resumed")}
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--text)] disabled:opacity-50"
                >
                  <Play size={14} />
                  Resume
                </button>
              ) : null}
              {detail.campaign.status !== "ended" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => patchCampaign({ status: "ended" }, "Campaign ended")}
                  className="inline-flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-300 disabled:opacity-50"
                >
                  <StopCircle size={14} />
                  End
                </button>
              ) : null}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Recipients" value={metrics?.recipients_total ?? recipientsTotal} />
            <MetricCard label="Sent" value={metrics?.sent ?? 0} />
            <MetricCard label="Applications" value={metrics?.applications ?? 0} />
            <MetricCard label="Hires" value={metrics?.hires ?? 0} />
          </section>

          <section className="card-lifted p-4">
            <h3 className="text-sm font-semibold text-[var(--text)]">Target jobs</h3>
            <ul className="mt-3 space-y-2">
              {detail.jobs.map((job) => (
                <li
                  key={job.id}
                  className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                >
                  <span className="text-[var(--text)]">{job.job_title}</span>
                  <span className="text-xs capitalize text-white/60">{job.job_status}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card-lifted p-4">
            <h3 className="text-sm font-semibold text-[var(--text)]">Recent events</h3>
            <ul className="mt-3 space-y-2">
              {detail.recent_events.map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-white/60"
                >
                  <span className="font-medium capitalize text-[var(--text)]">
                    {row.event_type.replace(/_/g, " ")}
                  </span>{" "}
                  · {new Date(row.created_at).toLocaleString()}
                </li>
              ))}
              {detail.recent_events.length === 0 ? (
                <li className="text-xs text-white/60">No events yet.</li>
              ) : null}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card-lifted p-4">
      <p className="text-xs uppercase tracking-wide text-white/60">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{value}</p>
    </div>
  );
}
