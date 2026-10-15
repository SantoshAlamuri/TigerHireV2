"use client";

import { type Dispatch, type SetStateAction } from "react";
import { AlertTriangle, Loader2, RefreshCw, Search, Upload } from "../agency-pipeline-icons";

type StageOption = {
  key: string;
  label: string;
  color: string;
};

type StageCount = StageOption & {
  count: number;
};

export function AgencyPipelineControls(props: {
  scoreError: string | null;
  pipelineActionError: string | null;
  setPipelineActionError: Dispatch<SetStateAction<string | null>>;
  pendingCount: number;
  scoreProgress: { done: number; total: number; current: string | null } | null;
  scoringAll: boolean;
  onScoreAll: () => void;
  totalCount: number;
  stageCounts: StageCount[];
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  clientFilter: string | null;
  setClientFilter: Dispatch<SetStateAction<string | null>>;
  clientOptions: Array<{ id: string; label: string }>;
  roleFilter: string | null;
  setRoleFilter: Dispatch<SetStateAction<string | null>>;
  roleOptions: Array<{ id: string; title: string }>;
  onOpenUpload: () => void;
  onBackfill: () => void;
  backfilling: boolean;
  selectedCount: number;
  allFilteredSelected: boolean;
  onToggleSelectAllFiltered: () => void;
  filteredCount: number;
  bulkAgencyStage: string;
  setBulkAgencyStage: Dispatch<SetStateAction<string>>;
  stageOptions: StageOption[];
  bulkActionLoading: boolean;
  onBulkAction: (action: "agency_stage" | "reject" | "delete") => void;
  onClearSelection: () => void;
  /** Hide the “not scored” callout while e.g. upload modal is open so only one prominent banner shows. */
  suppressPendingScoringBanner?: boolean;
  /** Distinct people when >1 pipeline row exists per candidate (e.g. multiple roles). */
  uniqueCandidateCount: number;
}) {
  const {
    scoreError,
    pipelineActionError,
    setPipelineActionError,
    pendingCount,
    scoreProgress,
    scoringAll,
    onScoreAll,
    totalCount,
    stageCounts,
    searchQuery,
    setSearchQuery,
    clientFilter,
    setClientFilter,
    clientOptions,
    roleFilter,
    setRoleFilter,
    roleOptions,
    onOpenUpload,
    onBackfill,
    backfilling,
    selectedCount,
    allFilteredSelected,
    onToggleSelectAllFiltered,
    filteredCount,
    bulkAgencyStage,
    setBulkAgencyStage,
    stageOptions,
    bulkActionLoading,
    onBulkAction,
    onClearSelection,
    suppressPendingScoringBanner = false,
    uniqueCandidateCount,
  } = props;

  return (
    <>
      {scoreError && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          <strong>Scoring error:</strong> {scoreError}
        </div>
      )}
      {pipelineActionError && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          <strong>Pipeline:</strong> {pipelineActionError}{" "}
          <button
            type="button"
            className="ml-1 underline hover:text-red-300"
            onClick={() => setPipelineActionError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {pendingCount > 0 && !suppressPendingScoringBanner && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="shrink-0 text-amber-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-300">
                {pendingCount} candidate{pendingCount !== 1 ? "s" : ""} not scored
              </p>
              {scoreProgress && scoringAll ? (
                <div className="mt-1.5">
                  <div className="flex items-center gap-2 text-xs text-amber-400/70">
                    <Loader2 size={12} className="animate-spin" />
                    Scoring {scoreProgress.current ?? "..."} ({scoreProgress.done}/
                    {scoreProgress.total})
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-amber-500/20">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all"
                      style={{ width: `${(scoreProgress.done / scoreProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="mt-0.5 text-xs text-amber-400/70">
                  Scoring runs in the background. Click below to queue all pending profiles.
                </p>
              )}
            </div>
            {!scoringAll && (
              <button
                type="button"
                onClick={onScoreAll}
                className="shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-black transition hover:bg-amber-400"
              >
                Score All ({pendingCount})
              </button>
            )}
          </div>
        </div>
      )}

      <section className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm font-medium text-[var(--text)]">
            {uniqueCandidateCount !== totalCount ? (
              <>
                <strong>{totalCount}</strong> pipeline rows ·{" "}
                <strong>{uniqueCandidateCount}</strong>{" "}
                {uniqueCandidateCount === 1 ? "person" : "people"}
                <span className="ml-1 text-xs font-normal text-white/55">
                  (same candidate can appear once per job)
                </span>
              </>
            ) : (
              <>
                {totalCount} candidate{totalCount !== 1 ? "s" : ""}
              </>
            )}
          </span>
          <span className="hidden text-[var(--border)] sm:inline">|</span>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {stageCounts.map((stage) => (
              <span key={stage.key} className={`text-xs ${stage.color}`}>
                {stage.label}: <strong>{stage.count}</strong>
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
          <div className="relative min-w-[200px] flex-1 sm:max-w-md sm:flex-none">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/55" />
            <input
              type="text"
              placeholder="Search candidates or jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-md border border-white/10 bg-white/[0.03] pl-8 pr-3 text-sm text-white/75 placeholder:text-white/45 focus:outline-none focus:ring-1 focus:ring-white/20"
            />
          </div>
          {clientOptions.length > 1 && (
            <select
              aria-label="Filter by client"
              value={clientFilter ?? ""}
              onChange={(e) => setClientFilter(e.target.value || null)}
              className="h-9 rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm text-white/75 focus:outline-none focus:ring-1 focus:ring-white/20"
            >
              <option value="">All clients</option>
              {clientOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
          {roleOptions.length > 1 && (
            <select
              aria-label="Filter by role"
              value={roleFilter ?? ""}
              onChange={(e) => setRoleFilter(e.target.value || null)}
              className="h-9 rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm text-white/75 focus:outline-none focus:ring-1 focus:ring-white/20"
            >
              <option value="">All roles</option>
              {roleOptions.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.title}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={onOpenUpload}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3 text-xs font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white"
          >
            <Upload size={14} />
            Upload candidates
          </button>
          <button
            type="button"
            onClick={onBackfill}
            disabled={backfilling}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3 text-xs font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {backfilling ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {backfilling ? "Syncing..." : "Sync pipeline"}
          </button>
        </div>
      </section>

      {selectedCount > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-3 py-2">
          <span className="text-sm font-medium text-[var(--text)]">{selectedCount} selected</span>
          <button
            type="button"
            onClick={onToggleSelectAllFiltered}
            disabled={filteredCount === 0 || bulkActionLoading}
            className="text-xs font-medium text-[var(--accent)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {allFilteredSelected ? "Clear filtered" : "Select filtered"}
          </button>
          <span className="text-[var(--border)]">|</span>
          <select
            aria-label="Bulk move to agency stage"
            value={bulkAgencyStage}
            onChange={(e) => setBulkAgencyStage(e.target.value)}
            disabled={bulkActionLoading}
            className="h-8 max-w-[200px] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text)]"
          >
            <option value="">Move to stage...</option>
            {stageOptions.map((stage) => (
              <option key={stage.key} value={stage.key}>
                {stage.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={bulkActionLoading || !bulkAgencyStage}
            onClick={() => onBulkAction("agency_stage")}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--accent)] px-3 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bulkActionLoading ? <Loader2 size={12} className="animate-spin" /> : null}
            Move
          </button>
          <button
            type="button"
            disabled={bulkActionLoading}
            onClick={() => onBulkAction("reject")}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-500/40 px-3 text-xs font-semibold text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            disabled={bulkActionLoading}
            onClick={() => onBulkAction("delete")}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-600/50 px-3 text-xs font-semibold text-red-300 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete
          </button>
          <button
            type="button"
            disabled={bulkActionLoading}
            onClick={onClearSelection}
            className="ml-auto text-xs text-white/60 hover:text-[var(--text)]"
          >
            Clear selection
          </button>
        </div>
      )}
    </>
  );
}
