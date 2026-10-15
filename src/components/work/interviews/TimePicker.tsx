"use client";

import { useMemo, useState } from "react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { OpenSlot } from "@/lib/work/interviews";
import {
  WINDOW_DAYS,
  byDay,
  choiceKey,
  dayGrid,
  dayKey,
  firstUsefulDay,
  longLabel,
  mergeChoices,
  nextDays,
  timeLabel,
  type Choice,
} from "@/lib/work/time-picker";
import { postJson } from "./post-json";
import s from "./timepicker.module.css";

interface PanelInfo {
  user_id: string;
  name: string;
  source: "calendar" | "declared_hours" | "working_hours";
  calendar: "connected" | "not_connected" | "reconnect" | "error";
  calendar_provider: "google_calendar" | "outlook" | null;
  message: string | null;
}
interface SlotsResponse {
  panel: PanelInfo[];
  unchecked: string[];
  busy: { start_at: string; end_at: string }[];
  slots: { start_at: string; end_at: string }[];
}
interface MyCalendar {
  connection: { provider: string; status: string; email: string | null } | null;
  available: { google: boolean; microsoft: boolean };
}
interface Person {
  id: string;
  full_name: string | null;
  email: string;
}

const LENGTHS = [30, 45, 60, 90];

/**
 * Pick interview times from the next two weeks. Days across the top, times
 * below; times the whole panel is free come first, read from their calendars.
 * Any other time on the day can still be chosen. Times are opened only when
 * the person confirms.
 */
export function TimePicker({
  jobId,
  defaultPanel,
  openSlots,
  multiple,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  jobId: string;
  defaultPanel: string[];
  openSlots: OpenSlot[];
  /** Offer several times (the candidate picks) or book exactly one. */
  multiple: boolean;
  confirmLabel: (picked: Choice[]) => string;
  onConfirm: (slotIds: string[], picked: Choice[]) => Promise<boolean>;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const [panel, setPanel] = useState<string[]>(() => {
    const p = defaultPanel.filter(Boolean);
    return p.length ? p : user?.id ? [user.id] : [];
  });
  const [length, setLength] = useState(45);
  const [now] = useState(() => Date.now());
  const days = useMemo(() => nextDays(now, WINDOW_DAYS), [now]);
  const [day, setDay] = useState<string | null>(null);
  const [picked, setPicked] = useState<Choice[]>([]);
  const [anyTime, setAnyTime] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = useApiQuery<SlotsResponse>(
    panel.length ? `/api/jobs/${jobId}/calendar-slots` : null,
    panel.length
      ? { panel: panel.join(","), duration: length, days: WINDOW_DAYS, perDay: 6 }
      : undefined,
  );
  const me = useApiQuery<MyCalendar>("/api/me/calendar");
  const people = useApiQuery<{ profiles: Person[] }>(
    adding ? `/api/jobs/${jobId}/interviewer-profile-options` : null,
  );

  const busy = useMemo(
    () =>
      (q.data?.busy ?? []).map((b) => ({
        start: Date.parse(b.start_at),
        end: Date.parse(b.end_at),
      })),
    [q.data],
  );
  const unchecked = (q.data?.unchecked ?? []).length > 0;
  const choices = useMemo(() => {
    const open: Choice[] = openSlots.map((o) => ({
      kind: "open",
      slotId: o.id,
      start: Date.parse(o.start),
      end: Date.parse(o.end),
      owner: o.owner,
    }));
    const suggested: Choice[] = (q.data?.slots ?? []).map((x) => ({
      kind: "new",
      start: Date.parse(x.start_at),
      end: Date.parse(x.end_at),
      free: unchecked ? "unchecked" : "everyone",
    }));
    return mergeChoices(
      open.filter((o) => o.start > now && o.start < now + WINDOW_DAYS * 86_400_000),
      suggested,
    );
  }, [openSlots, q.data, unchecked, now]);
  const grouped = useMemo(() => byDay(choices), [choices]);
  const shownDay = day ?? firstUsefulDay(days, grouped);
  const dayChoices = grouped.get(shownDay) ?? [];
  const grid = useMemo(() => dayGrid(shownDay, length, busy, now), [shownDay, length, busy, now]);

  const isPicked = (c: Choice) => picked.some((p) => choiceKey(p) === choiceKey(c));
  function toggle(c: Choice) {
    setError(null);
    if (!multiple) return setPicked(isPicked(c) ? [] : [c]);
    setPicked((list) =>
      isPicked(c)
        ? list.filter((p) => choiceKey(p) !== choiceKey(c))
        : list.length >= 6
          ? list
          : [...list, c],
    );
  }

  async function confirm() {
    setBusyAction(true);
    setError(null);
    try {
      const fresh = picked.filter((p) => p.kind === "new");
      let ids = picked
        .filter((p) => p.kind === "open")
        .map((p) => (p as { slotId: string }).slotId);
      if (fresh.length) {
        const res = await postJson<{ slots: { id: string }[]; skipped: number }>(
          `/api/jobs/${jobId}/calendar-slots`,
          {
            panel,
            duration: length,
            slots: fresh.map((f) => ({
              start_at: new Date(f.start).toISOString(),
              end_at: new Date(f.end).toISOString(),
            })),
          },
        );
        if (!res.ok) {
          setError(res.error);
          void q.refetch({ silent: true });
          return;
        }
        ids = [...ids, ...res.data.slots.map((x) => x.id)];
        if (res.data.skipped) {
          setError(
            `${res.data.skipped} of those times just filled up on someone's calendar and were left out.`,
          );
        }
      }
      if (!ids.length) return;
      const ok = await onConfirm(ids, picked);
      if (ok) setPicked([]);
    } finally {
      setBusyAction(false);
    }
  }

  const myConn = me.data?.connection;
  const iAmOnPanel = user?.id ? panel.includes(user.id) : false;
  const here =
    typeof window !== "undefined" ? window.location.pathname + window.location.search : "/work";
  const connectHref = (p: string) =>
    `/api/settings/me/integrations/oauth/${p}?next=${encodeURIComponent(here)}`;

  return (
    <div className={s.root}>
      {/* Who, and how long */}
      <div className={s.bar}>
        <div className={s.panel}>
          <span className={s.label}>With</span>
          {(q.data?.panel ?? panel.map((id) => ({ user_id: id, name: "…" }) as PanelInfo)).map(
            (m) => (
              <span key={m.user_id} className={s.person}>
                <span className={s.dot} data-state={m.calendar ?? "loading"} aria-hidden="true" />
                {m.name}
                <small>
                  {m.calendar === "connected"
                    ? m.calendar_provider === "outlook"
                      ? "Outlook"
                      : "Google"
                    : m.calendar === "reconnect"
                      ? "Reconnect calendar"
                      : m.calendar === "error"
                        ? "Calendar unreadable"
                        : m.source === "declared_hours"
                          ? "Their set hours"
                          : m.calendar
                            ? "No calendar"
                            : ""}
                </small>
                {panel.length > 1 && (
                  <button
                    type="button"
                    className={s.remove}
                    aria-label={`Remove ${m.name}`}
                    onClick={() => setPanel((p) => p.filter((x) => x !== m.user_id))}
                  >
                    ×
                  </button>
                )}
              </span>
            ),
          )}
          {panel.length < 6 &&
            (adding ? (
              <select
                className={s.addSelect}
                autoFocus
                defaultValue=""
                aria-label="Add an interviewer"
                onChange={(e) => {
                  if (e.target.value) setPanel((p) => [...new Set([...p, e.target.value])]);
                  setAdding(false);
                }}
                onBlur={() => setAdding(false)}
              >
                <option value="" disabled>
                  {people.loading ? "Loading…" : "Add an interviewer"}
                </option>
                {(people.data?.profiles ?? [])
                  .filter((p) => !panel.includes(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </option>
                  ))}
              </select>
            ) : (
              <button type="button" className={s.add} onClick={() => setAdding(true)}>
                + Add
              </button>
            ))}
        </div>
        <div className={s.lengths} role="radiogroup" aria-label="Interview length">
          {LENGTHS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={length === m}
              className={s.len}
              onClick={() => {
                setLength(m);
                setPicked((p) => p.filter((c) => c.kind === "open"));
              }}
            >
              {m < 60 ? `${m}m` : `${m / 60}h`}
            </button>
          ))}
        </div>
      </div>

      {iAmOnPanel &&
        me.data &&
        (me.data.available.google || me.data.available.microsoft) &&
        (!myConn || myConn.status !== "connected") && (
          <div className={s.connect}>
            <span>
              {myConn?.status === "error"
                ? "Your calendar needs reconnecting, so your busy times aren't being checked."
                : "Connect your calendar so only your free times are offered:"}
            </span>
            {me.data.available.google && (
              <a href={connectHref("google_calendar")}>Google Calendar</a>
            )}
            {me.data.available.microsoft && <a href={connectHref("outlook")}>Outlook</a>}
          </div>
        )}

      {/* Two weeks of days */}
      <div className={s.days} role="tablist" aria-label="Day">
        {days.map((d) => {
          const n = grouped.get(d.key)?.length ?? 0;
          const chosen = picked.filter((p) => dayKey(p.start) === d.key).length;
          return (
            <button
              key={d.key}
              type="button"
              role="tab"
              aria-selected={d.key === shownDay}
              className={s.day}
              data-weekend={d.weekend}
              onClick={() => {
                setDay(d.key);
                setAnyTime(false);
              }}
            >
              <span className={s.dow}>{d.today ? "Today" : d.weekday}</span>
              <b>{d.date}</b>
              <span
                className={s.dayCount}
                data-has={n > 0}
                data-chosen={chosen > 0}
                aria-label={chosen ? `${chosen} picked` : n ? `${n} free` : undefined}
              />
            </button>
          );
        })}
      </div>

      {/* Times on that day */}
      <div className={s.times}>
        {q.loading && !q.data ? (
          <p className={s.hint}>Checking calendars…</p>
        ) : q.error ? (
          <p className="wd-problem">Couldn&apos;t check calendars: {q.error}</p>
        ) : null}

        {!anyTime && (
          <>
            {dayChoices.length > 0 ? (
              <div className={s.chips}>
                {dayChoices.map((c) => (
                  <button
                    key={choiceKey(c)}
                    type="button"
                    aria-pressed={isPicked(c)}
                    className={s.chip}
                    data-kind={c.kind === "open" ? "open" : c.free}
                    onClick={() => toggle(c)}
                    title={
                      c.kind === "open"
                        ? `Already open${c.owner ? ` with ${c.owner}` : ""}`
                        : c.free === "everyone"
                          ? "Free on everyone's calendar"
                          : "Within working hours; not checked against every calendar"
                    }
                  >
                    {timeLabel(c.start)}
                    {c.kind === "open" && <small>open</small>}
                  </button>
                ))}
              </div>
            ) : (
              q.data && (
                <p className={s.hint}>
                  {days.find((d) => d.key === shownDay)?.weekend
                    ? "Weekend. Nothing suggested."
                    : "Nobody's free for the whole slot this day."}
                </p>
              )
            )}
            <button type="button" className={s.more} onClick={() => setAnyTime(true)}>
              Choose another time this day
            </button>
          </>
        )}

        {anyTime && (
          <>
            <div className={s.grid}>
              {grid.map((g) => {
                const c: Choice = { kind: "new", start: g.start, end: g.end, free: "unchecked" };
                return (
                  <button
                    key={g.start}
                    type="button"
                    aria-pressed={isPicked(c)}
                    className={s.cell}
                    data-busy={g.busy}
                    disabled={g.busy}
                    title={g.busy ? "Someone on the panel is busy" : undefined}
                    onClick={() => toggle(c)}
                  >
                    {timeLabel(g.start)}
                  </button>
                );
              })}
              {grid.length === 0 && <p className={s.hint}>No times left on this day.</p>}
            </div>
            <button type="button" className={s.more} onClick={() => setAnyTime(false)}>
              Back to suggested times
            </button>
          </>
        )}
      </div>

      {unchecked && q.data && (
        <p className={s.hint}>Calendars not connected; times assume 10am to 6pm on weekdays.</p>
      )}

      {error && (
        <p role="alert" className="wd-problem">
          {error}
        </p>
      )}

      <div className={s.footer}>
        <span className={s.summary}>
          {picked.length === 0
            ? multiple
              ? "Pick up to 6 times for them to choose from."
              : "Pick a time."
            : picked.map((p) => longLabel(p.start)).join(" · ")}
        </span>
        <div className="wd-row-actions">
          <button type="button" className="wd-btn quiet" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="wd-btn go"
            disabled={!picked.length || busyAction}
            onClick={() => void confirm()}
          >
            {busyAction ? "Working…" : confirmLabel(picked)}
          </button>
        </div>
      </div>
    </div>
  );
}
