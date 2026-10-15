"use client";

import { useState } from "react";
import { Loader2, CalendarPlus } from "lucide-react";

export function AddSlotsForm({ jobId, onAdded }: { jobId: string; onAdded: () => void }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!start || !end) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slots: [
            {
              start_at: new Date(start).toISOString(),
              end_at: new Date(end).toISOString(),
            },
          ],
        }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Failed to add slot");
      } else {
        setStart("");
        setEnd("");
        await onAdded();
      }
    } finally {
      setLoading(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="sr-only" htmlFor="slot-start">
        Slot start
      </label>
      <input
        id="slot-start"
        type="datetime-local"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        className="min-h-11 w-full min-w-0 max-w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] focus:border-white/20 focus:outline-none"
        required
        aria-label="Slot start"
      />
      <label className="sr-only" htmlFor="slot-end">
        Slot end
      </label>
      <input
        id="slot-end"
        type="datetime-local"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        className="min-h-11 w-full min-w-0 max-w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] focus:border-white/20 focus:outline-none"
        required
        aria-label="Slot end"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-black hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-2 touch-manipulation"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
        Add slot
      </button>
    </form>
  );
}
