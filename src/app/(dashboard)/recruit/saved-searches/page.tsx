"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Bell, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/lib/hooks/use-api";
import type { SavedSearch as SavedSearchType, AlertFrequency } from "@/types";

interface SavedSearchRow extends SavedSearchType {
  id: string;
  created_at: string;
}

export default function SavedSearchesPage() {
  const [saving, setSaving] = useState(false);

  const { data, loading, error, refetch } = useApiQuery<{
    searches: SavedSearchRow[];
  }>("/api/saved-searches");
  const searches = data?.searches ?? [];

  const handleToggleAlert = async (id: string, enabled: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/saved-searches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_enabled: enabled }),
        credentials: "include",
      });
      if (res.ok) await refetch();
    } finally {
      setSaving(false);
    }
  };

  const handleChangeFreq = async (id: string, freq: AlertFrequency) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/saved-searches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_frequency: freq }),
        credentials: "include",
      });
      if (res.ok) await refetch();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this saved search?")) return;
    try {
      const res = await fetch(`/api/saved-searches/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) await refetch();
    } catch {
      // ignore
    }
  };

  return (
    <>
      <PageHeader title="Saved searches" subtitle="Manage your saved searches and job alerts" />
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card-lifted space-y-3 p-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="card-lifted flex flex-col items-center gap-3 py-14">
          <p className="px-4 text-center text-sm text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-white/65 transition hover:bg-white/[0.04]"
          >
            Retry
          </button>
        </div>
      ) : searches.length === 0 ? (
        <div className="card-lifted mx-auto max-w-md px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-500/10 text-white/45">
            <Search className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-[var(--text)]">No saved searches yet</h2>
          <p className="text-body mt-2 text-sm text-white/65">
            Save a filter from Jobs (status, team, etc.) or the candidate pool. We&apos;ll keep the
            criteria and can email you on a schedule when alerts are on.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:items-center">
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link
                href="/recruit/jobs"
                className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
              >
                Open jobs
              </Link>
              <Link
                href="/recruit/candidates"
                className="inline-flex items-center justify-center rounded-md border border-[var(--border)] px-5 py-2.5 text-sm font-medium text-[var(--text)] transition hover:bg-white/[0.04]"
              >
                Candidate pool
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {searches.map((s) => (
            <div key={s.id} className="card-lifted p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Search size={18} className="text-[var(--accent)]" />
                  <h3 className="heading-card text-sm text-[var(--text)]">{s.name}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm text-white/65">
                    <Bell size={14} />
                    Alerts
                  </label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!s.alert_enabled}
                    aria-label={`Toggle alerts ${s.alert_enabled ? "off" : "on"}`}
                    onClick={() => handleToggleAlert(s.id, !s.alert_enabled)}
                    disabled={saving}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${s.alert_enabled ? "bg-[var(--accent)]" : "bg-[var(--border-interactive)]"}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform mt-0.5 ${s.alert_enabled ? "translate-x-[22px]" : "translate-x-[2px]"}`}
                    />
                  </button>
                  {s.alert_enabled && (
                    <select
                      value={s.alert_frequency}
                      onChange={(e) => handleChangeFreq(s.id, e.target.value as AlertFrequency)}
                      disabled={saving}
                      aria-label="Alert frequency"
                      className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text)] focus:border-white/20 focus:outline-none"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="never">Never</option>
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(s.id)}
                    className="rounded-md p-1.5 text-red-400 hover:bg-red-500/10"
                    aria-label="Delete search"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {Object.keys(s.filters || {}).length > 0 && (
                <p className="mt-2 text-xs text-white/45">Filters: {JSON.stringify(s.filters)}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
