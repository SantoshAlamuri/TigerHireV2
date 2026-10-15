"use client";

import { Loader2 } from "lucide-react";
import { formatDisplayDate, formatDisplayTime } from "@/lib/locale/display";

export type InterviewerDeclaredWindow = {
  id: string;
  user_id: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  interviewer: { id: string; display_name: string | null };
};

function formatWindowLabel(w: InterviewerDeclaredWindow): string {
  const day = formatDisplayDate(w.starts_at, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const t1 = formatDisplayTime(w.starts_at);
  const t2 = formatDisplayTime(w.ends_at);
  const who = w.interviewer.display_name?.trim() || "Interviewer";
  return `${day} ${t1}–${t2} · ${who}`;
}

export function InterviewerAvailabilityPicker({
  windows,
  loading,
  onPick,
}: {
  windows: InterviewerDeclaredWindow[];
  loading: boolean;
  onPick: (window: InterviewerDeclaredWindow) => void;
}) {
  if (loading) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-white/60">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading interviewer availability…
      </p>
    );
  }

  if (windows.length === 0) {
    return (
      <p className="py-4 text-sm text-white/60">
        No declared windows in this date range for assigned interviewers.
      </p>
    );
  }

  const byInterviewer = new Map<string, InterviewerDeclaredWindow[]>();
  for (const w of windows) {
    const key = w.user_id;
    if (!byInterviewer.has(key)) byInterviewer.set(key, []);
    byInterviewer.get(key)!.push(w);
  }

  return (
    <div className="max-h-64 space-y-4 overflow-y-auto pr-1">
      {[...byInterviewer.entries()].map(([userId, list]) => (
        <div key={userId}>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/50">
            {list[0]?.interviewer.display_name?.trim() || "Interviewer"}
          </p>
          <ul className="space-y-1.5">
            {list.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => onPick(w)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-left text-sm text-[var(--text)] transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/[0.06]"
                >
                  {formatWindowLabel(w)}
                  {w.notes && <span className="mt-0.5 block text-xs text-white/55">{w.notes}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
