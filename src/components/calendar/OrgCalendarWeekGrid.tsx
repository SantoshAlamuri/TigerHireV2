"use client";

import Link from "next/link";
import { useMemo } from "react";
import { groupEventsByLocalDay } from "@/lib/calendar/group-events-by-day";
import {
  formatDayLabelFromKey,
  getTimezoneShortLabel,
  minutesSinceMidnightInTimezone,
  toDateKeyInTimezone,
  weekDayKeysInTimezone,
} from "@/lib/calendar/calendar-timezone";
import type { OrgCalendarEvent } from "@/lib/calendar/org-calendar-events";
import { formatDisplayTimeInZone } from "@/lib/locale/display";
import {
  CALENDAR_KIND_CHIP_CLASS,
  CALENDAR_KIND_LABEL,
} from "@/components/calendar/calendar-event-styles";

const HOUR_START = 8;
const HOUR_END = 20;

function eventEndMs(ev: OrgCalendarEvent): number {
  if (ev.endAt) return new Date(ev.endAt).getTime();
  return new Date(ev.startAt).getTime() + 30 * 60 * 1000;
}

export function OrgCalendarWeekGrid({
  anchor,
  events,
  timeZone,
}: {
  anchor: Date;
  events: OrgCalendarEvent[];
  timeZone: string;
}) {
  const dayKeys = useMemo(() => weekDayKeysInTimezone(anchor, timeZone), [anchor, timeZone]);
  const eventsByDay = useMemo(() => groupEventsByLocalDay(events, timeZone), [events, timeZone]);
  const totalMinutes = (HOUR_END - HOUR_START) * 60;
  const gridHeight = (HOUR_END - HOUR_START) * 48;
  const todayKey = toDateKeyInTimezone(new Date(), timeZone);
  const tzLabel = getTimezoneShortLabel(timeZone);

  return (
    <OrgCalendarWeekGridBody
      dayKeys={dayKeys}
      eventsByDay={eventsByDay}
      totalMinutes={totalMinutes}
      gridHeight={gridHeight}
      todayKey={todayKey}
      timeZone={timeZone}
      tzLabel={tzLabel}
    />
  );
}

function OrgCalendarWeekGridBody({
  dayKeys,
  eventsByDay,
  totalMinutes,
  gridHeight,
  todayKey,
  timeZone,
  tzLabel,
}: {
  dayKeys: string[];
  eventsByDay: Map<string, OrgCalendarEvent[]>;
  totalMinutes: number;
  gridHeight: number;
  todayKey: string;
  timeZone: string;
  tzLabel: string;
}) {
  return (
    <div className="card-lifted overflow-hidden">
      <p className="border-b border-[var(--border)] px-4 py-2 text-xs text-white/60">
        Times shown in <span className="font-medium text-white/70">{tzLabel}</span>
      </p>
      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-[3rem_repeat(7,1fr)]">
          <div className="border-r border-[var(--border)] bg-[var(--surface)]/40" />
          {dayKeys.map((key) => (
            <DayHeader key={key} dayKey={key} isToday={key === todayKey} timeZone={timeZone} />
          ))}
          <TimeGutter />
          {dayKeys.map((key) => (
            <DayColumn
              key={key}
              dayEvents={eventsByDay.get(key) ?? []}
              isToday={key === todayKey}
              totalMinutes={totalMinutes}
              gridHeight={gridHeight}
              timeZone={timeZone}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayHeader({
  dayKey,
  isToday,
  timeZone,
}: {
  dayKey: string;
  isToday: boolean;
  timeZone: string;
}) {
  return <DayHeaderBody dayKey={dayKey} isToday={isToday} timeZone={timeZone} />;
}

function DayHeaderBody({
  dayKey,
  isToday,
  timeZone,
}: {
  dayKey: string;
  isToday: boolean;
  timeZone: string;
}) {
  return (
    <div
      className={`border-b border-r border-[var(--border)] px-1 py-2 text-center text-xs font-medium ${
        isToday ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "text-white/70"
      }`}
    >
      {formatDayLabelFromKey(dayKey, timeZone)}
    </div>
  );
}

function TimeGutter() {
  return (
    <div className="relative border-r border-[var(--border)]">
      {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i).map((h) => (
        <div
          key={h}
          className="flex h-12 items-start justify-end border-b border-[var(--border)]/60 pr-1 pt-0.5 text-label text-white/60"
        >
          {String(h).padStart(2, "0")}:00
        </div>
      ))}
    </div>
  );
}

function DayColumn({
  dayEvents,
  isToday,
  totalMinutes,
  gridHeight,
  timeZone,
}: {
  dayEvents: OrgCalendarEvent[];
  isToday: boolean;
  totalMinutes: number;
  gridHeight: number;
  timeZone: string;
}) {
  return (
    <div
      className={`relative border-r border-[var(--border)] ${
        isToday ? "bg-[var(--accent)]/[0.03]" : ""
      }`}
    >
      <div className="relative" style={{ height: `${gridHeight}px` }}>
        {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 border-b border-[var(--border)]/40"
            style={{
              top: `${(i / (HOUR_END - HOUR_START)) * 100}%`,
              height: `${100 / (HOUR_END - HOUR_START)}%`,
            }}
          />
        ))}
        {dayEvents.map((ev) => (
          <EventBlock key={ev.id} ev={ev} totalMinutes={totalMinutes} timeZone={timeZone} />
        ))}
      </div>
    </div>
  );
}

function EventBlock({
  ev,
  totalMinutes,
  timeZone,
}: {
  ev: OrgCalendarEvent;
  totalMinutes: number;
  timeZone: string;
}) {
  const startMin = minutesSinceMidnightInTimezone(ev.startAt, timeZone);
  const endMin = minutesSinceMidnightInTimezone(new Date(eventEndMs(ev)).toISOString(), timeZone);
  const clampedStart = Math.max(startMin, HOUR_START * 60);
  const clampedEnd = Math.min(endMin, HOUR_END * 60);
  if (clampedEnd <= clampedStart) return null;

  const top = ((clampedStart - HOUR_START * 60) / totalMinutes) * 100;
  const height = ((clampedEnd - clampedStart) / totalMinutes) * 100;
  const chipClass = CALENDAR_KIND_CHIP_CLASS[ev.kind];
  const label = CALENDAR_KIND_LABEL[ev.kind];
  const title = `${label}: ${ev.candidateName ?? "—"} · ${ev.jobTitle}`;
  const time = formatDisplayTimeInZone(ev.startAt, timeZone);

  return (
    <Link
      href={ev.href}
      className={`absolute left-0.5 right-0.5 overflow-hidden rounded-md border px-1 py-0.5 text-label leading-tight transition hover:brightness-110 ${chipClass}`}
      style={{
        top: `${top}%`,
        height: `${Math.max(height, 4)}%`,
        minHeight: "1.25rem",
      }}
      title={title}
    >
      <span className="block truncate font-medium">{time}</span>
      <span className="block truncate opacity-90">{ev.candidateName ?? ev.jobTitle}</span>
    </Link>
  );
}
