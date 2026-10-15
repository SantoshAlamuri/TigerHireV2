"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, Inbox, MessageCircle, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/lib/hooks/use-api";

interface WhatsAppSessionRow {
  id: string;
  phone: string;
  session_state: string;
  context: Record<string, unknown>;
  last_message_at: string;
  created_at: string;
  last_candidate_message_at?: string | null;
  qa_step?: number | null;
  alerts_expires_at?: string | null;
  alert_last_sent_at?: string | null;
}

interface SessionsResponse {
  sessions: WhatsAppSessionRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function summarizeContext(ctx: Record<string, unknown>): string {
  try {
    const s = JSON.stringify(ctx ?? {});
    return s.length > 160 ? `${s.slice(0, 160)}…` : s;
  } catch {
    return "—";
  }
}

function toShortTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function contextTags(ctx: Record<string, unknown>): string[] {
  const tags: string[] = [];
  if (typeof ctx.candidate_id === "string" && ctx.candidate_id.length > 0)
    tags.push("Candidate linked");
  if (typeof ctx.document_id === "string" && ctx.document_id.length > 0) tags.push("CV on file");
  if (typeof ctx.referral_id === "string" && ctx.referral_id.length > 0) tags.push("Referral");
  if (ctx.conversation_outcome === "handover") tags.push("Human handover");
  if (ctx.human_takeover_active === true) tags.push("Human takeover active");
  if (typeof ctx.last_assistant_reply_key === "string" && ctx.last_assistant_reply_key.length > 0) {
    tags.push(`Last bot: ${ctx.last_assistant_reply_key.replaceAll("_", " ")}`);
  }
  const unclear = Number(ctx.unclear_turn_count ?? 0);
  if (Number.isFinite(unclear) && unclear > 0) tags.push(`Unclear turns: ${unclear}`);
  return tags;
}

function contextSecondaryLine(ctx: Record<string, unknown>): string | null {
  if (ctx.human_takeover_active === true) {
    const until = toShortTimestamp(
      typeof ctx.human_takeover_until === "string" ? ctx.human_takeover_until : null,
    );
    return until ? `Bot paused until ${until}` : "Bot currently paused for human follow-up";
  }
  if (ctx.conversation_outcome === "handover") {
    const reason = typeof ctx.handover_reason === "string" ? ctx.handover_reason : null;
    const at = toShortTimestamp(
      typeof ctx.handover_requested_at === "string" ? ctx.handover_requested_at : null,
    );
    const reasonText = reason ? reason.replaceAll("_", " ") : "unspecified";
    if (at) return `Handover: ${reasonText} · ${at}`;
    return `Handover: ${reasonText}`;
  }
  return null;
}

function getHandoverMeta(ctx: Record<string, unknown>): {
  isHandover: boolean;
  reason: string | null;
  requestedAt: string | null;
} {
  const isHandover = ctx.conversation_outcome === "handover";
  const reason = typeof ctx.handover_reason === "string" ? ctx.handover_reason : null;
  const requestedAt =
    typeof ctx.handover_requested_at === "string" ? ctx.handover_requested_at : null;
  return { isHandover, reason, requestedAt };
}

export default function AdminWhatsAppSessionsPage() {
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [stateFilter, setStateFilter] = useState("");
  const [handoverOnly, setHandoverOnly] = useState(false);

  const queryParams = useMemo(
    () => ({
      page,
      limit,
      ...(stateFilter.trim() ? { state: stateFilter.trim() } : {}),
      ...(handoverOnly ? { handover: "1" } : {}),
    }),
    [page, limit, stateFilter, handoverOnly],
  );

  const { data, loading, error, refetch } = useApiQuery<SessionsResponse>(
    "/api/admin/whatsapp-sessions",
    queryParams,
  );

  const sessions = data?.sessions ?? [];
  const pagination = data?.pagination;
  const handoverCount = sessions.filter(
    (row) => getHandoverMeta(row.context ?? {}).isHandover,
  ).length;

  return (
    <>
      <PageHeader
        title="WhatsApp sessions"
        subtitle="Platform view: one row per phone — session state and context (not a full chat log)."
      />
      <div className="card-lifted mb-4 flex flex-wrap items-center gap-3 rounded-xl p-3">
        <div className="flex items-center gap-2 card-lifted px-3 py-2">
          <Inbox size={18} className="text-white/60" />
          <label htmlFor="wa-state-filter" className="text-xs text-white/60">
            Filter by state
          </label>
          <input
            id="wa-state-filter"
            type="text"
            placeholder="e.g. scored, new"
            value={stateFilter}
            onChange={(e) => {
              setStateFilter(e.target.value);
              setPage(1);
            }}
            className="min-w-[140px] rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm text-[var(--text)]"
          />
        </div>
        <button
          type="button"
          onClick={() => refetch({ silent: false })}
          className="inline-flex items-center gap-2 card-lifted px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-white/[0.04]"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
        <button
          type="button"
          onClick={() => {
            setHandoverOnly((v) => !v);
            setPage(1);
          }}
          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${
            handoverOnly
              ? "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]"
              : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] hover:bg-white/[0.04]"
          }`}
        >
          <AlertTriangle size={16} />
          {handoverOnly ? "Showing handovers" : "Show handovers only"}
        </button>
        <span className="text-xs text-white/60">
          Handover sessions in this view:{" "}
          <span className="font-semibold text-amber-300">{handoverCount}</span>
        </span>
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {loading && !data ? (
        <div className="space-y-2 rounded-xl card-lifted p-4">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
        </div>
      ) : (
        <>
          <div className="card-lifted overflow-x-auto rounded-xl">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-white/60">
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">State</th>
                  <th className="px-4 py-3 font-medium">Follow-up</th>
                  <th className="px-4 py-3 font-medium">Last activity</th>
                  <th className="px-4 py-3 font-medium">Last candidate msg</th>
                  <th className="px-4 py-3 font-medium">Context (preview)</th>
                  <th className="px-4 py-3 font-medium w-[140px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-white/60">
                      No sessions match this filter.
                    </td>
                  </tr>
                ) : (
                  sessions.map((row) => (
                    <tr
                      key={row.id}
                      className={`card-lifted-hover border-b border-[var(--border)] last:border-b-0 ${
                        getHandoverMeta(row.context ?? {}).isHandover ? "bg-amber-500/[0.04]" : ""
                      }`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[var(--text)]">
                        +{row.phone}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-white/[0.04] px-2 py-0.5 text-xs font-medium text-white/55 ring-1 ring-inset ring-white/[0.06]">
                          {row.session_state}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">
                        {(() => {
                          const meta = getHandoverMeta(row.context ?? {});
                          if (!meta.isHandover) {
                            return <span className="text-white/60">—</span>;
                          }
                          return (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-200">
                                <AlertTriangle size={12} />
                                Needs human
                              </span>
                              {meta.reason && (
                                <p className="text-[10px] uppercase tracking-wide text-amber-200/80">
                                  {meta.reason.replaceAll("_", " ")}
                                </p>
                              )}
                              {meta.requestedAt && (
                                <p className="text-[10px] text-white/60">
                                  {formatDateTime(meta.requestedAt)}
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-white/60">
                        {formatDateTime(row.last_message_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-white/60">
                        {row.last_candidate_message_at
                          ? formatDateTime(row.last_candidate_message_at)
                          : "—"}
                      </td>
                      <td
                        className="max-w-md px-4 py-3 text-xs text-white/60"
                        title={JSON.stringify(row.context ?? {})}
                      >
                        {(() => {
                          const ctx = row.context ?? {};
                          const tags = contextTags(ctx);
                          const secondary = contextSecondaryLine(ctx);
                          if (tags.length === 0 && !secondary) {
                            return <span className="text-white/60">No context</span>;
                          }
                          return (
                            <div className="space-y-1.5">
                              {tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {tags.slice(0, 3).map((tag) => (
                                    <span
                                      key={tag}
                                      className="rounded border border-[var(--border)] bg-[var(--surface)]/70 px-1.5 py-0.5 text-[10px] text-[var(--text)]"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                  {tags.length > 3 && (
                                    <span className="rounded border border-[var(--border)] bg-[var(--surface)]/70 px-1.5 py-0.5 text-[10px] text-white/60">
                                      +{tags.length - 3} more
                                    </span>
                                  )}
                                </div>
                              )}
                              {secondary && (
                                <p className="text-[10px] leading-relaxed text-white/60">
                                  {secondary}
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link
                          href={`/admin/whatsapp-sessions/${row.phone}`}
                          scroll={false}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-white/[0.04]"
                        >
                          <MessageCircle size={14} />
                          See & reply
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-white/60">
              <span>
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} rows)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 disabled:opacity-40"
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
