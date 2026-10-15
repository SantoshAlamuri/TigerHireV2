"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Play, X, RefreshCw, Square, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/lib/hooks/use-api";
import { getAgentRunTone, getAgentTypeTone } from "@/lib/status-tones";
import { mapDbAgentRunToView } from "@/lib/mappers";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { AgentType, AgentRunStatus } from "@/types";
import {
  ADMIN_AGENT_FILTER_OPTIONS,
  ADMIN_AGENT_LABELS,
  ADMIN_AGENT_STATUS_FILTER_OPTIONS,
  ADMIN_RUN_AGENT_OPTIONS,
  type AdminRunAgentType,
} from "@/lib/agents/admin-agent-registry";

interface RunResult {
  runId: string;
  processed: number;
  created: number;
  errors: number;
  updated?: number;
}

interface AgentRunsResponse {
  logs: Record<string, unknown>[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const STATUS_DOT: Record<string, string> = {
  completed: "bg-emerald-400",
  running: "bg-amber-400",
  failed: "bg-red-400",
  completed_with_errors: "bg-amber-400",
  success: "bg-emerald-400",
  error: "bg-red-400",
  paused: "bg-orange-400",
  cancelled: "bg-zinc-400",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDuration(start: string, end: string | null): string {
  if (!end) return "In progress...";
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(diffMs / 60000);
  const secs = Math.round((diffMs % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export default function AdminAgentsPage() {
  const { user } = useAuth();
  const canManageRuns = user?.role === "super_admin";
  const [filterAgent, setFilterAgent] = useState<"all" | AgentType>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | AgentRunStatus>("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<25 | 50 | 100>(25);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const queryParams = useMemo(
    () => ({
      ...(filterAgent !== "all" ? { agent: filterAgent } : {}),
      ...(filterStatus !== "all" ? { status: filterStatus } : {}),
      page,
      limit,
    }),
    [filterAgent, filterStatus, page, limit],
  );

  const { data, loading, refetch } = useApiQuery<AgentRunsResponse>(
    "/api/admin/agents",
    queryParams,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [agent, setAgent] = useState<AdminRunAgentType>("talent_scout");
  const [batchSize, setBatchSize] = useState("");
  const [jobId, setJobId] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [maxPairs, setMaxPairs] = useState("");
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runSuccess, setRunSuccess] = useState<RunResult | null>(null);
  const [actionLoadingById, setActionLoadingById] = useState<
    Record<string, "stop" | "restart" | null>
  >({});
  const [actionError, setActionError] = useState<string | null>(null);

  const runs = data?.logs?.map(mapDbAgentRunToView) ?? [];
  const pagination = data?.pagination;

  useEffect(() => {
    if (!autoRefresh) return;
    const hasRunning = runs.some((run) => run.status === "running");
    if (!hasRunning) return;
    const interval = setInterval(() => {
      void refetch();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, refetch, runs]);

  async function handleRun() {
    setRunLoading(true);
    setRunError(null);
    setRunSuccess(null);
    try {
      if (agent === "fitscore" && !jobId.trim()) {
        setRunError(
          "Job ID is required for scoring runs so organisation entitlement can be checked.",
        );
        return;
      }
      const body: Record<string, unknown> = { agent };
      if (batchSize.trim()) body.batchSize = parseInt(batchSize, 10);
      if (agent === "fitscore") {
        if (jobId.trim()) body.jobId = jobId.trim();
        if (candidateId.trim()) body.candidateId = candidateId.trim();
        if (maxPairs.trim()) body.maxPairs = parseInt(maxPairs, 10);
      }

      const res = await fetch("/api/admin/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        setRunError(json?.error ?? `Request failed (${res.status})`);
        return;
      }
      setRunSuccess({
        runId: json.runId,
        processed: json.processed ?? 0,
        created: json.created ?? 0,
        errors: json.errors ?? 0,
        updated: json.updated,
      });
      await refetch();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setRunLoading(false);
    }
  }

  function closeModal() {
    setModalOpen(false);
    setRunError(null);
    setRunSuccess(null);
  }

  async function handleRunAction(runId: string, action: "stop" | "restart") {
    setActionError(null);
    setActionLoadingById((prev) => ({ ...prev, [runId]: action }));
    try {
      const res = await fetch("/api/admin/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, action }),
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError((json as { error?: string })?.error ?? `Request failed (${res.status})`);
        return;
      }
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setActionLoadingById((prev) => ({ ...prev, [runId]: null }));
    }
  }

  return (
    <>
      <PageHeader
        title="Agent Monitoring"
        subtitle="AI agent runs and performance"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-white/[0.04]"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            {canManageRuns ? (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
              >
                <Play size={16} />
                Run Agent
              </button>
            ) : null}
          </div>
        }
      />
      <div className="card-lifted mb-4 flex flex-wrap items-center gap-3 rounded-xl p-3">
        <select
          value={filterAgent}
          onChange={(e) => {
            setFilterAgent(e.target.value as "all" | AgentType);
            setPage(1);
          }}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-white/30"
        >
          <option value="all">All agents</option>
          {ADMIN_AGENT_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value as "all" | AgentRunStatus);
            setPage(1);
          }}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-white/30"
        >
          <option value="all">All statuses</option>
          {ADMIN_AGENT_STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={limit}
          onChange={(e) => {
            setLimit(Number(e.target.value) as 25 | 50 | 100);
            setPage(1);
          }}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-white/30"
        >
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-white/60">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--border)] bg-[var(--bg)]"
          />
          Auto refresh running runs
        </label>
      </div>

      {actionError && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {actionError}
        </div>
      )}

      {loading ? (
        <div className="space-y-2 rounded-xl card-lifted p-4">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
        </div>
      ) : (
        <div className="card-lifted overflow-x-auto rounded-xl">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                {[
                  "Agent",
                  "Started",
                  "Duration",
                  "Processed",
                  "Created",
                  "Updated",
                  "Errors",
                  "Cost",
                  "Status",
                  ...(canManageRuns ? ["Actions"] : []),
                ].map((h) => (
                  <th
                    key={h}
                    className="heading-card whitespace-nowrap px-4 py-3 text-xs font-medium tracking-wide text-white/60"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr
                  key={run.id}
                  className="card-lifted-hover border-b border-[var(--border)] last:border-b-0 transition-colors"
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge tone={getAgentTypeTone(run.agentType)} size="sm">
                      {ADMIN_AGENT_LABELS[run.agentType] ?? run.agentType}
                    </StatusBadge>
                  </td>
                  <td
                    className="text-body whitespace-nowrap px-4 py-3 text-white/60"
                    suppressHydrationWarning
                  >
                    {formatDateTime(run.startedAt)}
                  </td>
                  <td className="text-body whitespace-nowrap px-4 py-3 text-white/60">
                    {getDuration(run.startedAt, run.completedAt)}
                  </td>
                  <td
                    className="text-body whitespace-nowrap px-4 py-3 text-[var(--text)]"
                    suppressHydrationWarning
                  >
                    {run.recordsProcessed.toLocaleString()}
                  </td>
                  <td
                    className="text-body whitespace-nowrap px-4 py-3 text-white/60"
                    suppressHydrationWarning
                  >
                    {run.recordsCreated.toLocaleString()}
                  </td>
                  <td
                    className="text-body whitespace-nowrap px-4 py-3 text-white/60"
                    suppressHydrationWarning
                  >
                    {run.recordsUpdated.toLocaleString()}
                  </td>
                  <td className="text-body whitespace-nowrap px-4 py-3">
                    <span className={run.errorsCount > 0 ? "text-red-400" : "text-white/60"}>
                      {run.errorsCount}
                    </span>
                  </td>
                  <td className="text-body whitespace-nowrap px-4 py-3 text-[var(--text)]">
                    ${run.costUsd.toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[run.status] ?? ""}`}
                      />
                      <StatusBadge
                        tone={getAgentRunTone(run.status)}
                        size="sm"
                        className="capitalize"
                      >
                        {run.status}
                      </StatusBadge>
                    </span>
                  </td>
                  {canManageRuns ? (
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-2">
                        {run.status === "running" && (
                          <button
                            type="button"
                            onClick={() => handleRunAction(run.id, "stop")}
                            disabled={actionLoadingById[run.id] != null}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {actionLoadingById[run.id] === "stop" ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Square size={12} />
                            )}
                            Stop
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRunAction(run.id, "restart")}
                          disabled={actionLoadingById[run.id] != null}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--text)] transition hover:bg-[var(--bg)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {actionLoadingById[run.id] === "restart" ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <RotateCcw size={12} />
                          )}
                          Restart
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td
                    colSpan={canManageRuns ? 10 : 9}
                    className="text-body px-4 py-10 text-center text-white/60"
                  >
                    No agent runs recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-sm text-white/60">
          {pagination
            ? `Showing page ${pagination.page} of ${Math.max(pagination.totalPages, 1)} (${pagination.total} total runs)`
            : `${runs.length} runs`}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={(pagination?.page ?? page) <= 1}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm text-[var(--text)] transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((prev) => prev + 1)}
            disabled={pagination ? pagination.page >= pagination.totalPages : runs.length < limit}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm text-[var(--text)] transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md"
          onClick={closeModal}
        >
          <div
            className="relative w-full max-w-md card-lifted p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeModal}
              aria-label="Close"
              className="absolute right-4 top-4 rounded-lg p-1 text-white/60 transition hover:bg-[var(--bg)] hover:text-[var(--text)]"
            >
              <X size={18} />
            </button>
            <h2 className="heading-card text-lg text-[var(--text)]">Run Agent</h2>

            <div className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="run-agent-type"
                  className="mb-1.5 block text-sm font-medium text-white/60"
                >
                  Agent type
                </label>
                <select
                  id="run-agent-type"
                  value={agent}
                  onChange={(e) => setAgent(e.target.value as AdminRunAgentType)}
                  aria-label="Agent type"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  {ADMIN_RUN_AGENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/60">
                  Batch size (optional)
                </label>
                <input
                  type="number"
                  value={batchSize}
                  onChange={(e) => setBatchSize(e.target.value)}
                  placeholder="Leave empty for default"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
                />
              </div>

              {agent === "fitscore" && (
                <>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-white/60">
                      Job ID (required)
                    </label>
                    <input
                      type="text"
                      value={jobId}
                      onChange={(e) => setJobId(e.target.value)}
                      placeholder="Enter job ID"
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-white/60">
                      Candidate ID (optional)
                    </label>
                    <input
                      type="text"
                      value={candidateId}
                      onChange={(e) => setCandidateId(e.target.value)}
                      placeholder="Leave empty for all"
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-white/60">
                      Max pairs (optional)
                    </label>
                    <input
                      type="number"
                      value={maxPairs}
                      onChange={(e) => setMaxPairs(e.target.value)}
                      placeholder="Leave empty for default (100)"
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
                    />
                  </div>
                </>
              )}
            </div>

            {runError && <p className="mt-4 text-sm text-red-400">{runError}</p>}

            {runSuccess && (
              <p className="mt-4 text-sm text-emerald-400">
                Run completed. Processed: {runSuccess.processed.toLocaleString()}, Created:{" "}
                {runSuccess.created.toLocaleString()}, Errors: {runSuccess.errors}
                {runSuccess.updated !== undefined
                  ? `, Updated: ${runSuccess.updated.toLocaleString()}`
                  : ""}
              </p>
            )}

            <button
              type="button"
              onClick={handleRun}
              disabled={runLoading}
              className="mt-6 w-full rounded-full bg-[var(--accent)] py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {runLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Running...
                </span>
              ) : (
                "Run"
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
