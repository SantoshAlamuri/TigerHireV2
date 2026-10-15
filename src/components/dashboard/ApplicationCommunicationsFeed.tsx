"use client";

import { useMemo, useState } from "react";
import { Filter, FileText, MessageSquare, StickyNote, ListOrdered } from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";

type FilterKey = "all" | "messages" | "system" | "notes";

interface CommEvent {
  id: string;
  at: string;
  kind: "message" | "system" | "note";
  label: string;
  detail: string | null;
}

const FILTERS: { value: FilterKey; label: string }[] = [
  { value: "all", label: "All" },
  { value: "messages", label: "Messages" },
  { value: "system", label: "System" },
  { value: "notes", label: "Notes" },
];

export function ApplicationCommunicationsFeed({
  applicationId,
  enabled,
}: {
  applicationId: string;
  /** Timeline is read-only (P7). Composers live elsewhere. */
  enabled: boolean;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const { data, loading, error } = useApiQuery<{
    events: CommEvent[];
    notice?: string;
  }>(
    enabled && applicationId
      ? `/api/applications/${encodeURIComponent(applicationId)}/communications`
      : null,
  );

  const events = useMemo(() => {
    const list = data?.events ?? [];
    if (filter === "all") return list;
    if (filter === "messages") return list.filter((e) => e.kind === "message");
    if (filter === "system") return list.filter((e) => e.kind === "system");
    if (filter === "notes") return list.filter((e) => e.kind === "note");
    return list;
  }, [data, filter]);

  if (!enabled || !applicationId) return null;

  return (
    <section className="rounded-2xl border border-[var(--border)]/80 bg-[var(--surface)]/50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-[var(--text)]">Activity & messages</h3>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter timeline">
          {FILTERS.map((f) => {
            const Icon =
              f.value === "messages"
                ? MessageSquare
                : f.value === "system"
                  ? ListOrdered
                  : f.value === "notes"
                    ? StickyNote
                    : Filter;
            return (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  filter === f.value
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "border-[var(--border)]/60 text-[var(--text-muted)] hover:border-[var(--border)]"
                }`}
              >
                <Icon className="h-3.5 w-3.5 opacity-80" aria-hidden />
                {f.label}
              </button>
            );
          })}
        </div>
      </div>
      {data?.notice && (
        <p className="mt-2 text-xs text-amber-600/90 dark:text-amber-300/90">{data.notice}</p>
      )}
      {loading ? (
        <p className="mt-3 text-sm text-[var(--text-muted)]">Loading…</p>
      ) : error ? (
        <p className="mt-3 text-sm text-red-500/80" role="alert">
          {error}
        </p>
      ) : (
        <ol className="mt-3 max-h-72 space-y-2.5 overflow-y-auto pr-1 text-sm">
          {events.length === 0 ? (
            <li className="text-[var(--text-muted)]">No items for this filter.</li>
          ) : (
            events.map((e) => {
              const isNote = e.kind === "note";
              return (
                <li
                  key={e.id + e.at}
                  className={
                    isNote
                      ? "border-l-2 border-[var(--border)]/40 rounded-md bg-[var(--bg-elevated)]/60 pl-3 pr-2 py-1.5"
                      : "border-l-2 border-[var(--border)]/60 pl-3"
                  }
                >
                  <div className="text-xs text-[var(--text-muted)]">
                    {new Date(e.at).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </div>
                  <div
                    className={`font-medium text-[var(--text)] ${isNote ? "inline-flex items-center gap-1.5" : ""}`}
                  >
                    {isNote && (
                      <FileText className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden />
                    )}
                    {e.label}
                  </div>
                  {e.detail && (
                    <p
                      className={
                        isNote ? "text-[var(--text-muted)]/90" : "text-[var(--text-muted)]"
                      }
                    >
                      {e.detail}
                    </p>
                  )}
                </li>
              );
            })
          )}
        </ol>
      )}
      <p className="mt-2 text-xs text-[var(--text-muted)]/80">
        Read-only view; reply via WhatsApp or add notes in their sections above.
      </p>
    </section>
  );
}
