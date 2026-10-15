"use client";

import { useCallback, useMemo, useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery, useOptimisticMutation } from "@/lib/hooks/use-api";
import {
  InterviewerAvailabilityWeekGrid,
  type AvailabilityWindowRow,
} from "./components/InterviewerAvailabilityWeekGrid";

type WindowDto = AvailabilityWindowRow & {
  recurring_pattern?: string | null;
};

function formatRange(starts: string, ends: string): string {
  const s = new Date(starts);
  const e = new Date(ends);
  const date = s.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const t1 = s.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const t2 = e.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${t1} – ${t2}`;
}

function isFuture(startsAt: string): boolean {
  return new Date(startsAt).getTime() > Date.now();
}

export default function MyAvailabilityPage() {
  const [pendingNotes, setPendingNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const range = useMemo(() => {
    const from = new Date();
    from.setDate(from.getDate() - 7);
    const to = new Date();
    to.setDate(to.getDate() + 56);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);

  const { data, loading, refetch } = useApiQuery<{ windows: WindowDto[] }>(
    `/api/me/availability?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
  );

  const windows = data?.windows ?? [];

  const { mutate: createWindow, loading: creating } = useOptimisticMutation<
    { window: WindowDto },
    { starts_at: string; ends_at: string; notes?: string | null }
  >("/api/me/availability");

  const [patching, setPatching] = useState(false);

  const handleCreateRange = useCallback(
    async (start: Date, end: Date) => {
      setActionError(null);
      if (end <= start) {
        setActionError("End time must be after start time.");
        return;
      }
      const result = await createWindow({
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        notes: pendingNotes.trim() || null,
      });
      if (result?.window) {
        setPendingNotes("");
        await refetch();
      } else {
        setActionError("Could not save availability. Try again.");
      }
    },
    [createWindow, pendingNotes, refetch],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Remove this availability window?")) return;
      setActionError(null);
      setDeletingId(id);
      try {
        const res = await fetch(`/api/me/availability/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          setActionError("Could not delete window.");
          return;
        }
        await refetch();
      } finally {
        setDeletingId(null);
      }
    },
    [refetch],
  );

  const upcoming = useMemo(
    () => windows.filter((w) => w.is_active && new Date(w.ends_at).getTime() > Date.now()),
    [windows],
  );
  const past = useMemo(
    () => windows.filter((w) => !isFuture(w.starts_at) || !w.is_active),
    [windows],
  );

  return (
    <div>
      <PageHeader
        title="My availability"
        subtitle="Declare when you are free for interviews so recruiters can schedule without back-and-forth."
      />

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-white/80" htmlFor="new-window-notes">
          Default notes for new blocks (optional)
        </label>
        <input
          id="new-window-notes"
          value={pendingNotes}
          onChange={(e) => setPendingNotes(e.target.value)}
          placeholder="e.g. Prefer technical interviews, 45 min slots"
          className="w-full max-w-xl rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text)]"
        />
      </div>

      {actionError && (
        <p className="mb-4 text-sm text-red-400" role="alert">
          {actionError}
        </p>
      )}

      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <InterviewerAvailabilityWeekGrid windows={windows} onCreateRange={handleCreateRange} />
      )}

      <section className="mt-8">
        <h2 className="heading-card mb-3 text-lg text-[var(--text)]">Upcoming windows</h2>
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-white/60">No upcoming availability declared yet.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((w) => (
              <li
                key={w.id}
                className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--text)]">
                    {formatRange(w.starts_at, w.ends_at)}
                  </p>
                  {w.notes && <p className="mt-1 text-xs text-white/60">{w.notes}</p>}
                </div>
                {isFuture(w.starts_at) && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/[0.04]"
                      onClick={() => {
                        setEditingId(w.id);
                        setEditNotes(w.notes ?? "");
                      }}
                    >
                      <Pencil size={14} />
                      Edit notes
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === w.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                      onClick={() => handleDelete(w.id)}
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="heading-card mb-3 text-lg text-[var(--text)]">Past windows</h2>
          <ul className="space-y-2 opacity-70">
            {past.map((w) => (
              <li
                key={w.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-white/70"
              >
                {formatRange(w.starts_at, w.ends_at)}
                {w.notes && <span className="mt-1 block text-xs">{w.notes}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {editingId && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl">
            <h3 className="heading-card text-lg text-[var(--text)]">Edit notes</h3>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={3}
              className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/[0.04]"
                onClick={() => setEditingId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={patching}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
                onClick={async () => {
                  if (!editingId) return;
                  setPatching(true);
                  setActionError(null);
                  try {
                    const res = await fetch(`/api/me/availability/${editingId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({ notes: editNotes.trim() || null }),
                    });
                    if (!res.ok) {
                      setActionError("Could not update notes.");
                      return;
                    }
                    setEditingId(null);
                    await refetch();
                  } finally {
                    setPatching(false);
                  }
                }}
              >
                {patching && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {(creating || patching) && (
        <p className="mt-4 flex items-center gap-2 text-sm text-white/60">
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving…
        </p>
      )}
    </div>
  );
}
