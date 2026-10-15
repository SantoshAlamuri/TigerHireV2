"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const HOUR_START = 8;
const HOUR_END = 20;
const SLOT_MINUTES = 30;

export type AvailabilityWindowRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  is_active: boolean;
};

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function toLocalDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function InterviewerAvailabilityWeekGrid({
  windows,
  onCreateRange,
  readOnly = false,
}: {
  windows: AvailabilityWindowRow[];
  onCreateRange: (start: Date, end: Date) => void;
  readOnly?: boolean;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const dragRef = useRef<{ dayIndex: number; startMin: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    dayIndex: number;
    startMin: number;
    endMin: number;
  } | null>(null);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const windowsByDay = useMemo(() => {
    const map = new Map<string, AvailabilityWindowRow[]>();
    for (const w of windows) {
      if (!w.is_active) continue;
      const key = toLocalDateKey(new Date(w.starts_at));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(w);
    }
    return map;
  }, [windows]);

  const totalMinutes = (HOUR_END - HOUR_START) * 60;
  const gridHeight = (HOUR_END - HOUR_START) * 48;

  const minuteFromY = useCallback(
    (clientY: number, rect: DOMRect) => {
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      const ratio = y / rect.height;
      const raw = HOUR_START * 60 + ratio * totalMinutes;
      return Math.round(raw / SLOT_MINUTES) * SLOT_MINUTES;
    },
    [totalMinutes],
  );

  const finishDrag = useCallback(
    (dayIndex: number, endMin: number) => {
      const start = dragRef.current;
      dragRef.current = null;
      setDragPreview(null);
      if (!start || start.dayIndex !== dayIndex) return;
      const lo = Math.min(start.startMin, endMin);
      const hi = Math.max(start.startMin, endMin);
      if (hi - lo < SLOT_MINUTES) return;
      const day = days[dayIndex];
      const slotStart = new Date(day);
      slotStart.setHours(0, 0, 0, 0);
      slotStart.setMinutes(lo);
      const slotEnd = new Date(day);
      slotEnd.setHours(0, 0, 0, 0);
      slotEnd.setMinutes(hi);
      onCreateRange(slotStart, slotEnd);
    },
    [days, onCreateRange],
  );

  return (
    <div className="card-lifted overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          className="rounded-lg p-2 text-white/60 hover:bg-white/[0.04] hover:text-[var(--text)]"
          aria-label="Previous week"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-medium text-[var(--text)]">
          {formatDayLabel(days[0])} – {formatDayLabel(days[6])}
        </p>
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, 7))}
          className="rounded-lg p-2 text-white/60 hover:bg-white/[0.04] hover:text-[var(--text)]"
          aria-label="Next week"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {!readOnly && (
        <p className="border-b border-[var(--border)] px-4 py-2 text-xs text-white/55">
          Click and drag on a day column to declare a new availability block (local time).
        </p>
      )}

      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-[3rem_repeat(7,1fr)]">
          <div className="border-r border-[var(--border)] bg-[var(--surface)]/40" />
          {days.map((d) => (
            <div
              key={d.toISOString()}
              className="border-b border-r border-[var(--border)] px-1 py-2 text-center text-xs font-medium text-white/70"
            >
              {formatDayLabel(d)}
            </div>
          ))}

          <div className="relative border-r border-[var(--border)]">
            {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i).map((h) => (
              <div
                key={h}
                className="flex h-12 items-start justify-end border-b border-[var(--border)]/60 pr-1 pt-0.5 text-[10px] text-white/40"
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {days.map((day, dayIndex) => {
            const dayKey = toLocalDateKey(day);
            const dayWindows = windowsByDay.get(dayKey) ?? [];
            return (
              <div key={dayKey} className="relative border-r border-[var(--border)]">
                <div
                  className="relative select-none"
                  style={{ height: `${gridHeight}px` }}
                  onMouseDown={(e) => {
                    if (readOnly) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const min = minuteFromY(e.clientY, rect);
                    dragRef.current = { dayIndex, startMin: min };
                    setDragPreview({ dayIndex, startMin: min, endMin: min + SLOT_MINUTES });
                  }}
                  onMouseMove={(e) => {
                    if (!dragRef.current || dragRef.current.dayIndex !== dayIndex) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setDragPreview({
                      dayIndex,
                      startMin: dragRef.current.startMin,
                      endMin: minuteFromY(e.clientY, rect),
                    });
                  }}
                  onMouseUp={(e) => {
                    if (!dragRef.current || dragRef.current.dayIndex !== dayIndex) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    finishDrag(dayIndex, minuteFromY(e.clientY, rect));
                  }}
                  onMouseLeave={() => {
                    if (dragRef.current?.dayIndex === dayIndex) {
                      finishDrag(dayIndex, dragRef.current.startMin);
                    }
                  }}
                >
                  {dayWindows.map((w) => {
                    const s = new Date(w.starts_at);
                    const e = new Date(w.ends_at);
                    const startMin = s.getHours() * 60 + s.getMinutes();
                    const endMin = e.getHours() * 60 + e.getMinutes();
                    const top = ((startMin - HOUR_START * 60) / totalMinutes) * 100;
                    const height = ((endMin - startMin) / totalMinutes) * 100;
                    if (endMin <= HOUR_START * 60 || startMin >= HOUR_END * 60) return null;
                    return (
                      <div
                        key={w.id}
                        className="absolute left-0.5 right-0.5 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/20 px-1 py-0.5 text-[10px] text-[var(--accent)]"
                        style={{
                          top: `${Math.max(0, top)}%`,
                          height: `${Math.min(100 - Math.max(0, top), height)}%`,
                        }}
                        title={w.notes ?? undefined}
                      >
                        {s.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}–
                        {e.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    );
                  })}

                  {dragPreview && dragPreview.dayIndex === dayIndex && (
                    <div
                      className="pointer-events-none absolute left-0.5 right-0.5 rounded-md border border-dashed border-[var(--accent)] bg-[var(--accent)]/30"
                      style={{
                        top: `${((Math.min(dragPreview.startMin, dragPreview.endMin) - HOUR_START * 60) / totalMinutes) * 100}%`,
                        height: `${(Math.abs(dragPreview.endMin - dragPreview.startMin) / totalMinutes) * 100}%`,
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
