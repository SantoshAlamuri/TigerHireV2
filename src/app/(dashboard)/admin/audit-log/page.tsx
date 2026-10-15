"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/lib/hooks/use-api";

type AuditEvent = {
  id: number;
  user_id: string;
  action: string;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  changed_by?: string | null;
  ip_address?: string | null;
  created_at: string;
};

const ACTION_OPTIONS = ["", "created", "updated", "deleted", "role_changed", "org_changed"];
const REPORT_OUTLINE_BUTTON_CLASS =
  "inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/8 px-4 py-2 text-sm font-semibold text-[var(--accent)] transition-colors duration-200 hover:border-[var(--accent)]/45 hover:bg-[var(--accent)]/15 hover:text-[var(--accent-hover)]";
const REPORT_TABLE_ROW_CLASS =
  "card-lifted-hover border-b border-[var(--border)] last:border-b-0 transition-colors duration-150";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminAuditLogPage() {
  const [page, setPage] = useState(1);
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const params = useMemo(() => {
    const p: Record<string, string | number> = { page, limit: 50 };
    if (userId.trim()) p.user_id = userId.trim();
    if (action) p.action = action;
    if (from) p.from = `${from}T00:00:00.000Z`;
    if (to) p.to = `${to}T23:59:59.999Z`;
    return p;
  }, [page, userId, action, from, to]);

  const { data, loading } = useApiQuery<{
    events: AuditEvent[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>("/api/admin/users/audit-log", params);

  const events = data?.events ?? [];
  const pagination = data?.pagination ?? { page: 1, limit: 50, total: 0, totalPages: 0 };

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="User lifecycle events (created, updated, deleted, role/organisation changes)"
        actions={
          <Link href="/admin/users" className={REPORT_OUTLINE_BUTTON_CLASS}>
            <ArrowLeft size={16} />
            Back to users
          </Link>
        }
      />
      <div className="card-lifted mb-4 grid gap-3 rounded-xl p-4 sm:grid-cols-2 xl:grid-cols-5">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-white/60">
            User ID
          </label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Filter by user ID"
            className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text)] placeholder:text-white/60 transition-colors duration-150 hover:border-[var(--accent)]/30 focus:border-white/20 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-white/60">
            Action
          </label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text)] transition-colors duration-150 hover:border-[var(--accent)]/30 focus:border-white/20 focus:outline-none"
          >
            {ACTION_OPTIONS.map((a) => (
              <option key={a || "all"} value={a}>
                {a || "All"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-white/60">
            From
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text)] transition-colors duration-150 hover:border-[var(--accent)]/30 focus:border-white/20 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-white/60">
            To
          </label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text)] transition-colors duration-150 hover:border-[var(--accent)]/30 focus:border-white/20 focus:outline-none"
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => {
              setPage(1);
              setUserId("");
              setAction("");
              setFrom("");
              setTo("");
            }}
            className="h-9 rounded-lg border border-[var(--border)] px-3 text-sm font-medium text-white/60 transition-colors duration-150 hover:border-[var(--accent)]/30 hover:bg-white/[0.04] hover:text-[var(--text)]"
          >
            Clear filters
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 rounded-xl card-lifted p-4">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
        </div>
      ) : (
        <>
          <div className="card-lifted overflow-x-auto rounded-xl">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface)]/45">
                  <th className="heading-card px-4 py-3 text-xs font-medium tracking-wide text-white/60">
                    Time
                  </th>
                  <th className="heading-card px-4 py-3 text-xs font-medium tracking-wide text-white/60">
                    User ID
                  </th>
                  <th className="heading-card px-4 py-3 text-xs font-medium tracking-wide text-white/60">
                    Action
                  </th>
                  <th className="heading-card px-4 py-3 text-xs font-medium tracking-wide text-white/60">
                    Changed by
                  </th>
                  <th className="heading-card px-4 py-3 text-xs font-medium tracking-wide text-white/60">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id} className={REPORT_TABLE_ROW_CLASS}>
                    <td
                      className="text-body whitespace-nowrap px-4 py-3 tabular-nums text-white/60"
                      suppressHydrationWarning
                    >
                      {formatDate(ev.created_at)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-[var(--text)]">
                      {String(ev.user_id).slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-xs font-medium text-[var(--accent)]">
                        {ev.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-white/60">
                      {ev.changed_by ? `${String(ev.changed_by).slice(0, 8)}…` : "—"}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-xs text-white/60">
                      {ev.old_data || ev.new_data
                        ? JSON.stringify(ev.new_data ?? ev.old_data ?? {}).slice(0, 80) +
                          (ev.new_data || ev.old_data ? "…" : "")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-body text-sm text-white/60">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--text)] transition-colors duration-150 hover:border-[var(--accent)]/30 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--text)] transition-colors duration-150 hover:border-[var(--accent)]/30 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
