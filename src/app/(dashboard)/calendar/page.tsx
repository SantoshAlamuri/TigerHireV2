"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock, List } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { CalendarKindLegend } from "@/components/calendar/CalendarKindLegend";
import { CalendarSchedulingGaps } from "@/components/calendar/CalendarSchedulingGaps";
import { OrgCalendarMonthGrid, MonthDayAgenda } from "@/components/calendar/OrgCalendarMonthGrid";
import { OrgCalendarWeekGrid } from "@/components/calendar/OrgCalendarWeekGrid";
import {
  CALENDAR_KIND_CHIP_CLASS,
  CALENDAR_KIND_LABEL,
} from "@/components/calendar/calendar-event-styles";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/auth/AuthProvider";
import { addDays, monthRangeFromAnchor, weekRangeFromAnchor } from "@/lib/calendar/calendar-range";
import {
  calendarTimezoneSelectOptions,
  loadStoredCalendarTimezone,
  resolveCalendarTimezone,
  storeCalendarTimezone,
} from "@/lib/calendar/calendar-timezone";
import type { OrgCalendarEvent } from "@/lib/calendar/org-calendar-events";
import type { JobSchedulingSummary } from "@/lib/calendar/org-calendar-scheduling-summary";
import { CALENDAR_EVENT_ACTION_LABEL } from "@/lib/calendar/scheduling-hrefs";
import { useApiQuery } from "@/lib/hooks/use-api";
import { formatDisplayDate, formatDisplayDateTimeInZone } from "@/lib/locale/display";
import { isPlanDocumentUiEnabled } from "@/lib/rollouts/plan-document-ui";
import { JobCreateSlotsLauncher } from "@/components/scheduling/JobCreateSlotsLauncher";

type ViewMode = "week" | "month";

function myAvailabilityHref(role: string | undefined): string {
  return role === "recruiter" ? "/recruit/my-availability" : "/company/my-availability";
}

function jobsHref(role: string | undefined): string {
  if (role === "hiring_manager") return "/company/my-jobs";
  if (role === "leadership") return "/company/jobs";
  return "/recruit/jobs";
}

export default function OrgCalendarPage() {
  const enabled = isPlanDocumentUiEnabled();
  const { user } = useAuth();
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [jobFilter, setJobFilter] = useState("");
  const [interviewerFilter, setInterviewerFilter] = useState("");
  const [selectedMonthDay, setSelectedMonthDay] = useState<string | null>(null);
  const [agendaExpanded, setAgendaExpanded] = useState(true);
  const [tzSelection, setTzSelection] = useState(loadStoredCalendarTimezone);

  useEffect(() => {
    storeCalendarTimezone(tzSelection);
  }, [tzSelection]);

  const timeZone = useMemo(() => resolveCalendarTimezone(tzSelection), [tzSelection]);

  const range = useMemo(() => {
    if (view === "week") return weekRangeFromAnchor(anchor);
    return monthRangeFromAnchor(anchor);
  }, [anchor, view]);

  const qs = useMemo(() => {
    const p = new URLSearchParams({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    });
    if (jobFilter) p.set("job_id", jobFilter);
    return p.toString();
  }, [range, jobFilter]);

  const { data, loading, error, refetch } = useApiQuery<{
    events: OrgCalendarEvent[];
    schedulingSummaries: JobSchedulingSummary[];
  }>(enabled ? `/api/calendar/events?${qs}` : null);

  const events = data?.events ?? [];
  const schedulingSummaries = data?.schedulingSummaries ?? [];
  const filteredEvents = useMemo(
    () =>
      events.filter(
        (ev) =>
          !interviewerFilter ||
          ev.interviewerLabel === interviewerFilter ||
          interviewerFilter === "",
      ),
    [events, interviewerFilter],
  );

  const jobOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of schedulingSummaries) map.set(s.jobId, s.jobTitle);
    for (const e of events) map.set(e.jobId, e.jobTitle);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [schedulingSummaries, events]);

  const interviewerOptions = useMemo(
    () => [...new Set(events.map((e) => e.interviewerLabel).filter(Boolean) as string[])],
    [events],
  );

  const eventCounts = useMemo(() => {
    const counts = { interview: 0, assessment_deadline: 0, offer_expiry: 0 };
    for (const ev of filteredEvents) counts[ev.kind] += 1;
    return counts;
  }, [filteredEvents]);

  if (!enabled) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="This week"
          subtitle="Enable plan document mode to use the org timeline."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="This week"
        subtitle="See interviews, assessment due dates, and offer deadlines across jobs. Click anything to open Scheduling or the right job tab — you don’t create slots here."
        actions={
          user?.role === "hiring_manager" ||
          user?.role === "leadership" ||
          user?.role === "employee" ? (
            <Link
              href={myAvailabilityHref(user?.role)}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--text)] hover:bg-white/[0.04]"
            >
              My availability
            </Link>
          ) : (
            <JobCreateSlotsLauncher buttonLabel="Create slots" onCreated={() => void refetch()} />
          )
        }
      />

      <CalendarToolbar
        view={view}
        setView={setView}
        anchor={anchor}
        setAnchor={setAnchor}
        range={range}
        jobFilter={jobFilter}
        setJobFilter={setJobFilter}
        interviewerFilter={interviewerFilter}
        setInterviewerFilter={setInterviewerFilter}
        jobOptions={jobOptions}
        interviewerOptions={interviewerOptions}
        tzSelection={tzSelection}
        setTzSelection={setTzSelection}
        eventCounts={eventCounts}
      />

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <CalendarSchedulingGaps summaries={schedulingSummaries} loading={loading} />

      {/* Week/month grids need width — on mobile the agenda below is the primary view. */}
      <div className="hidden sm:block">
        {loading ? (
          <Skeleton className="h-80 w-full" />
        ) : view === "week" ? (
          <OrgCalendarWeekGrid anchor={anchor} events={filteredEvents} timeZone={timeZone} />
        ) : (
          <div className="space-y-4 card-lifted p-4">
            <OrgCalendarMonthGrid
              anchor={anchor}
              events={filteredEvents}
              timeZone={timeZone}
              selectedDayKey={selectedMonthDay}
              onSelectDay={setSelectedMonthDay}
            />
            <MonthDayAgenda events={filteredEvents} dayKey={selectedMonthDay} timeZone={timeZone} />
          </div>
        )}
      </div>

      <section className="card-lifted overflow-hidden">
        <button
          type="button"
          onClick={() => setAgendaExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]"
          aria-expanded={agendaExpanded}
        >
          <span className="text-sm font-medium text-[var(--text)]">
            Agenda ({filteredEvents.length})
          </span>
          <span className="text-xs text-white/65">{agendaExpanded ? "Hide" : "Show"}</span>
        </button>
        {agendaExpanded ? (
          <div className="border-t border-[var(--border)] p-4">
            {filteredEvents.length === 0 ? (
              <CalendarEmptyState userRole={user?.role} />
            ) : (
              <CalendarAgendaList events={filteredEvents} timeZone={timeZone} />
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

/**
 * The quick-links row is gone.
 *
 * It sat between the title and the toolbar with three chips, and every one of
 * them collided with something already on screen:
 *
 *   "My availability"  — the identical link, to the identical href, rendered as
 *                        the page-header button a few pixels above it.
 *   "All jobs"         — navigated AWAY to the jobs list, directly above an
 *                        "All jobs" select that FILTERS this calendar. Same two
 *                        words, opposite behaviour, one row apart.
 *   "Pending actions"  — /tasks, which is a top-level nav tab called Tasks.
 *
 * So the row cost a full band of vertical space above the fold and taught the
 * reader that identical labels do different things. Every destination it held
 * is still one click away from the header button or the top nav.
 */
function CalendarToolbar({
  view,
  setView,
  anchor,
  setAnchor,
  range,
  jobFilter,
  setJobFilter,
  interviewerFilter,
  setInterviewerFilter,
  jobOptions,
  interviewerOptions,
  tzSelection,
  setTzSelection,
  eventCounts,
}: {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  anchor: Date;
  setAnchor: (d: Date) => void;
  range: { from: Date; to: Date };
  jobFilter: string;
  setJobFilter: (v: string) => void;
  interviewerFilter: string;
  setInterviewerFilter: (v: string) => void;
  jobOptions: [string, string][];
  interviewerOptions: string[];
  tzSelection: string;
  setTzSelection: (v: string) => void;
  eventCounts: { interview: number; assessment_deadline: number; offer_expiry: number };
}) {
  const tzOptions = calendarTimezoneSelectOptions();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-[var(--border)] p-0.5">
          <button
            type="button"
            onClick={() => setView("week")}
            className={`rounded-md px-3 py-1.5 text-sm ${view === "week" ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "text-[var(--text-muted)]"}`}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => setView("month")}
            className={`rounded-md px-3 py-1.5 text-sm ${view === "month" ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "text-[var(--text-muted)]"}`}
          >
            Month
          </button>
        </div>
        <button
          type="button"
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)] hover:bg-white/[0.04]"
          onClick={() => setAnchor(new Date())}
        >
          Today
        </button>
        <button
          type="button"
          className="rounded-lg border border-[var(--border)] p-2"
          onClick={() => setAnchor(addDays(anchor, view === "week" ? -7 : -30))}
          aria-label="Previous"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-medium text-[var(--text)]">
          {view === "week"
            ? `${formatDisplayDate(range.from, { day: "numeric", month: "short" })} – ${formatDisplayDate(addDays(range.from, 6), { day: "numeric", month: "short", year: "numeric" })}`
            : formatDisplayDate(anchor, { month: "long", year: "numeric" })}
        </span>
        <button
          type="button"
          className="rounded-lg border border-[var(--border)] p-2"
          onClick={() => setAnchor(addDays(anchor, view === "week" ? 7 : 30))}
          aria-label="Next"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <select
          value={tzSelection}
          onChange={(e) => setTzSelection(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm"
          aria-label="Timezone"
        >
          {tzOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={jobFilter}
          onChange={(e) => setJobFilter(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm"
        >
          <option value="">All jobs</option>
          {jobOptions.map(([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </select>
        <select
          value={interviewerFilter}
          onChange={(e) => setInterviewerFilter(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm"
          aria-label="Filter by interviewer"
        >
          <option value="">All interviewers</option>
          {interviewerOptions.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
        <CalendarKindLegend />
      </div>
      {eventCounts.interview + eventCounts.assessment_deadline + eventCounts.offer_expiry > 0 ? (
        <p className="text-xs text-white/65">
          In range: {eventCounts.interview > 0 ? `${eventCounts.interview} interview` : null}
          {eventCounts.interview > 0 && eventCounts.assessment_deadline > 0 ? " · " : null}
          {eventCounts.assessment_deadline > 0
            ? `${eventCounts.assessment_deadline} assessment`
            : null}
          {(eventCounts.interview > 0 || eventCounts.assessment_deadline > 0) &&
          eventCounts.offer_expiry > 0
            ? " · "
            : null}
          {eventCounts.offer_expiry > 0 ? `${eventCounts.offer_expiry} offer` : null}
        </p>
      ) : null}
    </div>
  );
}

function CalendarEmptyState({ userRole }: { userRole: string | undefined }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <CalendarDays className="text-white/40" size={28} />
      <p className="text-sm text-white/60">No interviews or deadlines in this range.</p>
      <p className="text-xs text-white/65">
        Use Scheduling gaps above to add open times, or open a job from{" "}
        <Link href={jobsHref(userRole)} className="text-[var(--accent)] hover:underline">
          Jobs
        </Link>
        .
      </p>
    </div>
  );
}

function CalendarAgendaList({
  events,
  timeZone,
}: {
  events: OrgCalendarEvent[];
  timeZone: string;
}) {
  return (
    <ul className="space-y-2">
      {events.map((ev) => (
        <li key={ev.id}>
          <Link
            href={ev.href}
            className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4 transition hover:border-[var(--accent)]/35 hover:bg-white/[0.03]"
          >
            <div className="min-w-0">
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-label font-semibold uppercase tracking-wide ${CALENDAR_KIND_CHIP_CLASS[ev.kind]}`}
              >
                {CALENDAR_KIND_LABEL[ev.kind]}
              </span>
              <p className="heading-card mt-2 text-sm text-[var(--text)]">
                {ev.kind === "offer_expiry"
                  ? ev.jobTitle
                  : `${ev.candidateName ?? "—"} · ${ev.jobTitle}`}
              </p>
              <p className="text-body mt-0.5 text-xs text-white/65">
                {formatDisplayDateTimeInZone(ev.startAt, timeZone)}
                {ev.interviewerLabel ? ` · ${ev.interviewerLabel}` : ""}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--accent)]">
              {CALENDAR_EVENT_ACTION_LABEL[ev.kind]}
              <ArrowRight size={14} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
