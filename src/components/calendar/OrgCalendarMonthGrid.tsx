"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  getTimezoneShortLabel,
  monthGridDayKeys,
  toDateKeyInTimezone,
} from "@/lib/calendar/calendar-timezone";
import { groupEventsByLocalDay } from "@/lib/calendar/group-events-by-day";
import type { OrgCalendarEvent } from "@/lib/calendar/org-calendar-events";
import { CALENDAR_KIND_CHIP_CLASS } from "@/components/calendar/calendar-event-styles";
import { formatDisplayDateTimeInZone } from "@/lib/locale/display";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function OrgCalendarMonthGrid({
  anchor,
  events,
  timeZone,
  selectedDayKey,
  onSelectDay,
}: {
  anchor: Date;
  events: OrgCalendarEvent[];
  timeZone: string;
  selectedDayKey: string | null;
  onSelectDay: (key: string | null) => void;
}) {
  const cells = useMemo(() => monthGridDayKeys(anchor, timeZone), [anchor, timeZone]);
  const eventsByDay = useMemo(() => groupEventsByLocalDay(events, timeZone), [events, timeZone]);
  const todayKey = toDateKeyInTimezone(new Date(), timeZone);
  const tzLabel = getTimezoneShortLabel(timeZone);

  return (
    <div className="card-lifted overflow-hidden p-3">
      <p className="mb-2 text-xs text-white/60">
        Dates and times in <span className="font-medium text-white/70">{tzLabel}</span>
      </p>
      <div className="mb-2 grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="text-center text-label font-medium uppercase text-white/60">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const dayEvents = eventsByDay.get(cell.key) ?? [];
          const isToday = cell.key === todayKey;
          const isSelected = cell.key === selectedDayKey;

          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => onSelectDay(isSelected ? null : cell.key)}
              className={`min-h-[4.5rem] rounded-lg border p-1.5 text-left transition ${
                isSelected
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border)] bg-[var(--bg-elevated)]/40 hover:border-white/20"
              } ${!cell.inMonth ? "opacity-40" : ""} ${isToday && !isSelected ? "ring-1 ring-[var(--accent)]/50" : ""}`}
            >
              <span
                className={`text-xs font-medium ${isToday ? "text-[var(--accent)]" : "text-white/70"}`}
              >
                {cell.dayNum}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayEvents.slice(0, 2).map((ev) => (
                  <div
                    key={ev.id}
                    className={`truncate rounded px-1 py-0.5 text-label ${CALENDAR_KIND_CHIP_CLASS[ev.kind]}`}
                  >
                    {ev.candidateName ?? ev.jobTitle}
                  </div>
                ))}
                {dayEvents.length > 2 ? (
                  <span className="text-label text-white/60">+{dayEvents.length - 2} more</span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MonthDayAgenda({
  events,
  dayKey,
  timeZone,
}: {
  events: OrgCalendarEvent[];
  dayKey: string | null;
  timeZone: string;
}) {
  if (!dayKey) return null;
  const dayEvents = events.filter((ev) => toDateKeyInTimezone(ev.startAt, timeZone) === dayKey);
  if (dayEvents.length === 0) {
    return <p className="text-sm text-white/55">No events on this day.</p>;
  }

  return (
    <ul className="space-y-2">
      {dayEvents.map((ev) => (
        <li key={ev.id}>
          <Link
            href={ev.href}
            className="card-lifted card-lifted-hover block p-3 text-sm text-[var(--text)]"
          >
            <span className="block text-xs text-white/65">
              {formatDisplayDateTimeInZone(ev.startAt, timeZone)}
            </span>
            <span className="mt-1 block">
              {ev.candidateName ?? "—"} · {ev.jobTitle}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
