"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useToast } from "@/components/ui/Toast";
import {
  SUPPORT_REQUEST_PRIORITIES,
  SUPPORT_REQUEST_STATUSES,
  type UpdateSupportRequestInput,
} from "@/lib/validations/support";

type SupportRequestRow = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by_name: string | null;
  created_by_email: string | null;
  source: string;
  category: string;
  priority: (typeof SUPPORT_REQUEST_PRIORITIES)[number];
  status: (typeof SUPPORT_REQUEST_STATUSES)[number];
  owner_team: string;
  assignee_user_id: string | null;
  subject: string;
  description: string;
  context_path: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
};

type SupportRequestsResponse = {
  requests: SupportRequestRow[];
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminSupportRequestsPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<
    "all" | (typeof SUPPORT_REQUEST_STATUSES)[number]
  >("all");
  const [priorityFilter, setPriorityFilter] = useState<
    "all" | (typeof SUPPORT_REQUEST_PRIORITIES)[number]
  >("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const queryParams = useMemo(
    () => ({
      ...(statusFilter !== "all" ? { status: statusFilter } : {}),
      ...(priorityFilter !== "all" ? { priority: priorityFilter } : {}),
      limit: 100,
    }),
    [priorityFilter, statusFilter],
  );

  const { data, loading, error, refetch, mergeData } = useApiQuery<SupportRequestsResponse>(
    "/api/admin/support-requests",
    queryParams,
  );

  async function updateRequest(id: string, patch: Omit<UpdateSupportRequestInput, "id">) {
    setUpdatingId(id);
    try {
      const response = await fetch("/api/admin/support-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, ...patch }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        request?: SupportRequestRow;
      };
      if (!response.ok || !payload.request) {
        throw new Error(payload.error ?? "Could not update support request.");
      }
      mergeData((prev) => {
        const existing = prev?.requests ?? [];
        return {
          requests: existing.map((row) =>
            row.id === payload.request!.id ? payload.request! : row,
          ),
        };
      });
      toast({ title: "Support request updated", tone: "success" });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Could not update support request.",
        tone: "error",
      });
    } finally {
      setUpdatingId(null);
    }
  }

  const requests = data?.requests ?? [];

  return (
    <>
      <PageHeader title="Support Requests" subtitle="In-app support tickets raised by users" />

      <div className="card-lifted mb-4 flex flex-wrap items-center gap-3 rounded-xl p-4">
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "all" | (typeof SUPPORT_REQUEST_STATUSES)[number])
          }
          className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
        >
          <option value="all">All statuses</option>
          {SUPPORT_REQUEST_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) =>
            setPriorityFilter(e.target.value as "all" | (typeof SUPPORT_REQUEST_PRIORITIES)[number])
          }
          className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
        >
          <option value="all">All priorities</option>
          {SUPPORT_REQUEST_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {priority.toUpperCase()}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => refetch({ silent: false })}
          className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-white/80 hover:bg-[var(--surface)]"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-2 rounded-xl card-lifted p-4">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : (
        <div className="card-lifted overflow-x-auto rounded-xl">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--bg-elevated)]/70 text-xs uppercase tracking-wide text-white/60">
              <tr>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Requester</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Owner team</th>
                <th className="px-3 py-2">Context</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((row) => (
                <tr key={row.id} className="border-t border-[var(--border)]/70">
                  <td className="px-3 py-2">
                    <p className="font-medium text-[var(--text)]">{row.subject}</p>
                    <p className="mt-1 max-w-md text-xs text-white/60">{row.description}</p>
                  </td>
                  <td className="px-3 py-2 text-xs text-white/70">
                    <p>{row.created_by_name ?? "Unknown user"}</p>
                    <p>{row.created_by_email ?? "—"}</p>
                  </td>
                  <td className="px-3 py-2 text-white/70">{row.category}</td>
                  <td className="px-3 py-2 text-white/70">{row.priority.toUpperCase()}</td>
                  <td className="px-3 py-2">
                    <select
                      value={row.status}
                      disabled={updatingId === row.id}
                      onChange={(e) =>
                        void updateRequest(row.id, {
                          status: e.target.value as (typeof SUPPORT_REQUEST_STATUSES)[number],
                        })
                      }
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--text)]"
                    >
                      {SUPPORT_REQUEST_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={row.owner_team}
                      disabled={updatingId === row.id}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (!next || next === row.owner_team) return;
                        void updateRequest(row.id, { ownerTeam: next });
                      }}
                      className="w-28 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--text)]"
                    />
                  </td>
                  <td className="px-3 py-2 text-xs text-white/60">{row.context_path ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-white/60">
                    {formatDateTime(row.created_at)}
                  </td>
                  <td className="px-3 py-2">
                    {row.status !== "resolved" ? (
                      <button
                        type="button"
                        disabled={updatingId === row.id}
                        onClick={() =>
                          void updateRequest(row.id, {
                            status: "resolved",
                            resolutionNotes: "Resolved via admin support queue",
                          })
                        }
                        className="rounded-lg border border-emerald-500/40 px-2 py-1 text-xs text-emerald-300 disabled:opacity-60"
                      >
                        Resolve
                      </button>
                    ) : (
                      <span className="text-xs text-emerald-300">
                        Resolved {row.resolved_at ? formatDateTime(row.resolved_at) : ""}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-white/60">
                    No support requests found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
