"use client";

import { Suspense, useMemo, useState } from "react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";
import { SetupFrame } from "@/components/work/setup/SetupFrame";
import {
  DAY_NAMES,
  DAY_ORDER,
  DEFAULT_WEEK,
  WEEK_PATTERN,
  groupByDay,
  planWeek,
  weekProblem,
  type UsualWeek,
} from "@/lib/work/availability";

interface WindowRow {
  id: string;
  starts_at: string;
  ends_at: string;
}

const TIMES = Array.from({ length: 29 }, (_, i) => {
  const m = 7 * 60 + i * 30; // 07:00 … 21:00
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});

function timeLabel(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d);
}

export default function AvailabilitySetupPage() {
  return (
    <Suspense fallback={null}>
      <AvailabilitySetup />
    </Suspense>
  );
}

/**
 * When you can interview: say your usual week once, and we lay it out for the
 * next four weeks. Below, the times candidates can book, one line per day.
 */
function AvailabilitySetup() {
  const range = useMemo(() => {
    const to = new Date();
    to.setDate(to.getDate() + 56);
    return { from: new Date().toISOString(), to: to.toISOString() };
  }, []);
  const { data, loading, error, refetch } = useApiQuery<{ windows: WindowRow[] }>(
    "/api/me/availability",
    range,
  );
  const [week, setWeek] = useState<UsualWeek>(DEFAULT_WEEK);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const windows = data?.windows ?? [];
  const days = groupByDay(windows);
  const plan = planWeek(week, windows);
  const invalid = weekProblem(week);

  const toggleDay = (d: number) =>
    setWeek((w) => ({
      ...w,
      days: w.days.includes(d) ? w.days.filter((x) => x !== d) : [...w.days, d],
    }));

  const save = async () => {
    setSaving(true);
    setProblem(null);
    const csrf = await buildCsrfHeaders().catch(() => ({}));
    let made = 0;
    for (const span of plan) {
      const res = await fetch("/api/me/availability", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...csrf },
        body: JSON.stringify({ ...span, recurring_pattern: WEEK_PATTERN }),
      }).catch(() => null);
      if (res?.ok) made += 1;
    }
    setSaving(false);
    setSavedCount(made);
    if (made < plan.length)
      setProblem(`${plan.length - made} of the times couldn't be saved. Try again.`);
    await refetch({ silent: true });
  };

  const remove = async (id: string) => {
    setRemoving(id);
    setProblem(null);
    const csrf = await buildCsrfHeaders().catch(() => ({}));
    const res = await fetch(`/api/me/availability/${id}`, {
      method: "DELETE",
      credentials: "include",
      headers: csrf,
    }).catch(() => null);
    setRemoving(null);
    if (!res?.ok) setProblem("Couldn't remove that time. Try again.");
    await refetch({ silent: true });
  };

  return (
    <SetupFrame
      sig="When you can interview"
      title={days.length ? "Candidates can book you." : "When can you interview?"}
      lede="Set your usual week once. Candidates pick from these times, and nothing lands outside them."
      done={days.length > 0}
    >
      <section className="wd-panel you wd-stack" style={{ gap: 20 }} aria-label="Your usual week">
        <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="wd-small wd-muted" style={{ marginBottom: 10 }}>
            Days
          </legend>
          <div className="wd-row-actions" style={{ gap: 8 }}>
            {DAY_ORDER.map((d) => (
              <button
                key={d}
                type="button"
                className={`wd-day ${week.days.includes(d) ? "on" : ""}`}
                aria-pressed={week.days.includes(d)}
                onClick={() => toggleDay(d)}
              >
                {DAY_NAMES[d]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="wd-row-actions" style={{ gap: 14 }}>
          <label className="wd-stack" style={{ gap: 4 }}>
            <span className="wd-small wd-muted">From</span>
            <select
              className="wd-input"
              value={week.from}
              onChange={(e) => setWeek((w) => ({ ...w, from: e.target.value }))}
            >
              {TIMES.map((t) => (
                <option key={t} value={t}>
                  {timeLabel(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="wd-stack" style={{ gap: 4 }}>
            <span className="wd-small wd-muted">To</span>
            <select
              className="wd-input"
              value={week.to}
              onChange={(e) => setWeek((w) => ({ ...w, to: e.target.value }))}
            >
              {TIMES.map((t) => (
                <option key={t} value={t}>
                  {timeLabel(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="wd-stack" style={{ gap: 4 }}>
            <span className="wd-small wd-muted">For the next</span>
            <select
              className="wd-input"
              value={week.weeks}
              onChange={(e) => setWeek((w) => ({ ...w, weeks: Number(e.target.value) }))}
            >
              {[1, 2, 4, 8].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "week" : "weeks"}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="wd-row-actions">
          <button
            type="button"
            className="wd-btn go"
            disabled={saving || !!invalid || plan.length === 0}
            onClick={() => void save()}
          >
            {saving
              ? "Saving…"
              : plan.length
                ? `Add ${plan.length} ${plan.length === 1 ? "time" : "times"}`
                : "Already covered"}
          </button>
          {invalid ? (
            <span className="wd-problem">{invalid}</span>
          ) : savedCount !== null && !saving ? (
            <span role="status" className="wd-small" style={{ color: "var(--wd-good)" }}>
              {savedCount} {savedCount === 1 ? "time" : "times"} added.
            </span>
          ) : null}
        </div>
      </section>

      {problem && (
        <p role="alert" className="wd-problem">
          {problem}
        </p>
      )}

      {loading && !data ? (
        <p role="status" className="wd-muted">
          Loading your times…
        </p>
      ) : error ? (
        <p role="alert" className="wd-problem">
          Couldn&apos;t load your times. Reload to try again.
        </p>
      ) : days.length > 0 ? (
        <section className="wd-stack" style={{ gap: 8 }} aria-labelledby="avail-list">
          <h2 id="avail-list" className="wd-h2">
            Times candidates can book
          </h2>
          <ul className="wd-lines" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {days.map((d) => (
              <li
                key={d.key}
                className="wd-line"
                style={{ gridTemplateColumns: "140px minmax(0,1fr)" }}
              >
                <span className="wd-line-label">{d.label}</span>
                <span className="wd-row-actions" style={{ gap: 8 }}>
                  {d.windows.map((w) => (
                    <span key={w.id} className="wd-slot">
                      {w.time}
                      <button
                        type="button"
                        aria-label={`Remove ${d.label} ${w.time}`}
                        disabled={removing === w.id}
                        onClick={() => void remove(w.id)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </SetupFrame>
  );
}
