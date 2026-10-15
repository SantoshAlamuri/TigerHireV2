"use client";

import { useMemo, useState } from "react";
import { SettingsModule } from "@/components/settings/SettingsModule";
import { AuditLogTable } from "@/components/settings/AuditLogTable";
import { useApiQuery } from "@/lib/hooks/use-api";

interface AuditEntry {
  id: string;
  event_type: string;
  resource_type: string | null;
  resource_id: string | null;
  actor_email: string | null;
  created_at: string;
}

interface DsrEntry {
  id: string;
  status: string;
  requested_via: string | null;
  created_at: string;
  completed_at: string | null;
}

interface RetentionSnapshot {
  pendingRequests: number;
  completedRequests: number;
  deletionsLast30d: number;
  generatedAt: string;
}

export default function CompanySettingsAuditPage() {
  const [limit, setLimit] = useState(50);
  const { data, loading, error } = useApiQuery<{ entries: AuditEntry[] }>("/api/settings/audit", {
    limit,
  });
  const { data: dsrData, loading: dsrLoading } = useApiQuery<{
    requests: DsrEntry[];
    total: number;
  }>("/api/compliance/dsr", { limit: 10, offset: 0 });
  const { data: retentionData, loading: retentionLoading } = useApiQuery<RetentionSnapshot>(
    "/api/compliance/retention-report",
  );

  const entries = useMemo(() => data?.entries ?? [], [data?.entries]);

  return (
    <SettingsModule title="Settings · Audit Log" subtitle="Review immutable settings activity">
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="card-lifted p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/60">DSR pending</p>
            <p className="mt-1 text-xl font-semibold text-[var(--text)]">
              {retentionLoading ? "…" : (retentionData?.pendingRequests ?? 0)}
            </p>
          </div>
          <div className="card-lifted p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/60">DSR completed</p>
            <p className="mt-1 text-xl font-semibold text-[var(--text)]">
              {retentionLoading ? "…" : (retentionData?.completedRequests ?? 0)}
            </p>
          </div>
          <div className="card-lifted p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/60">
              Retention deletions (30d)
            </p>
            <p className="mt-1 text-xl font-semibold text-[var(--text)]">
              {retentionLoading ? "…" : (retentionData?.deletionsLast30d ?? 0)}
            </p>
          </div>
        </div>

        <div className="card-lifted p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text)]">
              Recent data subject requests
            </h3>
            <span className="text-xs text-white/60">
              {dsrLoading ? "Loading..." : `${dsrData?.total ?? 0} total`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-white/60">
                  <th className="px-2 py-1">Request ID</th>
                  <th className="px-2 py-1">Status</th>
                  <th className="px-2 py-1">Via</th>
                  <th className="px-2 py-1">Created</th>
                  <th className="px-2 py-1">Completed</th>
                </tr>
              </thead>
              <tbody>
                {(dsrData?.requests ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-[var(--border)] text-white/60">
                    <td className="px-2 py-1 font-mono">{row.id.slice(0, 8)}…</td>
                    <td className="px-2 py-1">{row.status}</td>
                    <td className="px-2 py-1">{row.requested_via ?? "—"}</td>
                    <td className="px-2 py-1">
                      {new Date(row.created_at).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-2 py-1">
                      {row.completed_at
                        ? new Date(row.completed_at).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
                {!dsrLoading && (dsrData?.requests?.length ?? 0) === 0 ? (
                  <tr>
                    <td className="px-2 py-3 text-white/60" colSpan={5}>
                      No DSR requests found for your scope.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {loading ? <p className="text-sm text-white/60">Loading audit log...</p> : null}
        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        ) : null}
        <AuditLogTable entries={entries} onLoadMore={() => setLimit((prev) => prev + 25)} />
      </div>
    </SettingsModule>
  );
}
