"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Megaphone, Plus, X } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";

type CampaignJob = { job_id: string; job_title: string };
type CampaignRow = {
  id: string;
  name: string;
  objective: "more_referrals" | "urgent_role_fill";
  audience_filter: "all_referrers" | "org_verified_only" | "city_match";
  status: "draft" | "active" | "paused" | "ended";
  starts_at: string | null;
  ends_at: string | null;
  launched_at: string | null;
  updated_at: string;
  jobs: CampaignJob[];
  recipient_counts?: Record<string, number>;
};

type CampaignListPayload = { campaigns: CampaignRow[] };
type OpenJobRow = {
  id: string;
  title: string;
  organisation_name: string;
  direct_bonus_amount: number;
};

function objectiveLabel(value: CampaignRow["objective"]): string {
  return value === "urgent_role_fill" ? "Urgent role fill" : "More referrals";
}

export default function CompanyReferralCampaignsPage() {
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [jobs, setJobs] = useState<OpenJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [objective, setObjective] = useState<CampaignRow["objective"]>("more_referrals");
  const [audienceFilter, setAudienceFilter] =
    useState<CampaignRow["audience_filter"]>("all_referrers");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);

  async function loadCampaigns() {
    const res = await fetch("/api/referral-campaigns", { credentials: "include" });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "Failed to load campaigns");
    }
    const payload = (await res.json()) as CampaignListPayload;
    setRows(payload.campaigns ?? []);
  }

  async function loadJobs() {
    const res = await fetch("/api/refer/jobs/open", { credentials: "include" });
    if (!res.ok) return;
    const payload = (await res.json().catch(() => ({}))) as { jobs?: OpenJobRow[] };
    setJobs(payload.jobs ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([loadCampaigns(), loadJobs()]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canCreate = useMemo(
    () => name.trim().length >= 3 && selectedJobIds.length > 0 && !saving,
    [name, selectedJobIds.length, saving],
  );

  async function createCampaign() {
    if (!canCreate) return;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/referral-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          objective,
          audienceFilter,
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          jobIds: selectedJobIds,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Failed to create campaign");
      await loadCampaigns();
      setNotice("Campaign created");
      setShowCreate(false);
      setName("");
      setSelectedJobIds([]);
      setStartsAt("");
      setEndsAt("");
      setAudienceFilter("all_referrers");
      setObjective("more_referrals");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create campaign");
    } finally {
      setSaving(false);
    }
  }

  function toggleJob(jobId: string) {
    setSelectedJobIds((prev) =>
      prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId],
    );
  }

  return (
    <div className="alive-air space-y-6">
      <PageHeader
        title="Referral Campaigns"
        subtitle="Create WhatsApp referral drives for open jobs and track conversions."
      />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="card-lifted px-3 py-2 text-xs text-white/60">
            {rows.length} campaign{rows.length === 1 ? "" : "s"}
          </div>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"
          >
            {showCreate ? <X size={15} /> : <Plus size={15} />}
            {showCreate ? "Close" : "New campaign"}
          </button>
        </div>

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

        {showCreate ? (
          <section className="card-lifted space-y-3 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <Megaphone size={16} className="text-[var(--accent)]" />
              Create campaign
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Campaign name"
                className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
              />
              <select
                value={objective}
                onChange={(e) => setObjective(e.target.value as CampaignRow["objective"])}
                className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
              >
                <option value="more_referrals">More referrals</option>
                <option value="urgent_role_fill">Urgent role fill</option>
              </select>
              <select
                value={audienceFilter}
                onChange={(e) =>
                  setAudienceFilter(e.target.value as CampaignRow["audience_filter"])
                }
                className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
              >
                <option value="all_referrers">All active referrers</option>
                <option value="org_verified_only">Org-verified referrers</option>
                <option value="city_match">Referrers with city filled</option>
              </select>
              <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
                Start date
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
                End date
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
                />
              </label>
            </div>
            <div className="card-lifted space-y-2 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                Select jobs
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {jobs.map((job) => (
                  <label
                    key={job.id}
                    className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] px-2 py-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={selectedJobIds.includes(job.id)}
                      onChange={() => toggleJob(job.id)}
                    />
                    <span className="text-white/60">
                      <span className="block font-medium text-[var(--text)]">{job.title}</span>
                      <span className="block">{job.organisation_name}</span>
                      {job.direct_bonus_amount > 0 ? (
                        <span className="mt-0.5 block text-[11px] text-[var(--accent)]">
                          Referrer bonus ₹{Number(job.direct_bonus_amount).toLocaleString("en-IN")}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
              {jobs.length === 0 ? (
                <p className="text-xs text-white/60">
                  No open referral jobs visible yet. Configure public/internal listing on jobs
                  first.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={!canCreate}
              onClick={createCampaign}
              className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Create campaign
            </button>
          </section>
        ) : null}

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="card-lifted p-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="mt-3 h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="card-lifted p-8 text-center text-sm text-white/60">
            No campaigns yet. Create your first referral drive.
          </div>
        ) : (
          <div className="card-lifted overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--surface)]/40 text-xs text-white/60">
                <tr>
                  <th className="px-3 py-2 font-medium">Campaign</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Objective</th>
                  <th className="px-3 py-2 font-medium">Jobs</th>
                  <th className="px-3 py-2 font-medium text-right">Recipients</th>
                  <th className="px-3 py-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const recipients =
                    Object.values(row.recipient_counts ?? {}).reduce((sum, c) => sum + c, 0) || 0;
                  return (
                    <tr key={row.id} className="border-b border-[var(--border)]/60">
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/company/referrals/campaigns/${row.id}`}
                          className="font-medium text-[var(--accent)]"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 capitalize text-[var(--text)]">{row.status}</td>
                      <td className="px-3 py-2.5 text-white/60">{objectiveLabel(row.objective)}</td>
                      <td className="px-3 py-2.5 text-white/60">{row.jobs.length}</td>
                      <td className="px-3 py-2.5 text-right text-[var(--text)]">{recipients}</td>
                      <td className="px-3 py-2.5 text-white/60">
                        {new Date(row.updated_at).toLocaleString()}
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
  );
}
