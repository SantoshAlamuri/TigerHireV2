"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { resolvePeriod } from "@/lib/v2/period";
import { periodParams } from "@/lib/v2/analytics-fusion";
import type { AnalyticsRollup } from "@/lib/v2/analytics-rollup";
import {
  REPORT_PERIODS,
  barWidth,
  buildReport,
  byMonth,
  sourceName,
  type ReportPeriodKey,
} from "@/lib/work/reports";

const fmt = (n: number) => n.toLocaleString();

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="wd-group" aria-labelledby={`r-${id}`}>
      <header className="wd-group-head">
        <h2 id={`r-${id}`} className="wd-h2">
          {title}
        </h2>
        {note && <span className="wd-small wd-muted">{note}</span>}
      </header>
      {children}
    </section>
  );
}

/**
 * Reports: how hiring is going, in one calm page. The same figures as the full
 * analytics, read from every application in the period — the funnel, where
 * hires come from, each job, scores and why people were turned down.
 */
export default function ReportsPage() {
  const [periodKey, setPeriodKey] = useState<ReportPeriodKey>("this_fy");
  const period = useMemo(() => resolvePeriod(periodKey, Date.now()), [periodKey]);
  const params = periodParams(period);
  const { data, loading, error } = useApiQuery<AnalyticsRollup>("/api/analytics/rollup", params);
  const report = useMemo(() => (data ? buildReport(data.rows, data.jobs ?? {}) : null), [data]);

  const months = useMemo(() => (data ? byMonth(data.rows) : []), [data]);
  const maxMonth = Math.max(0, ...months.map((m) => m.applied));

  const exportHref = (metric: string) => {
    const q = new URLSearchParams({ metric, ...params });
    return `/api/analytics/export?${q.toString()}`;
  };

  const f = report?.funnel;
  const steps = f
    ? [
        { name: "Applied", value: f.applied },
        { name: "Reviewed", value: f.reviewed },
        { name: "Shortlisted", value: f.shortlisted },
        { name: "Hired", value: f.hired },
      ]
    : [];
  const maxSource = Math.max(0, ...(report?.sources ?? []).map((s) => s.applicants));
  const maxBand = Math.max(0, ...(report?.scores.bands ?? []).map((b) => b.count));
  const maxReject = Math.max(0, ...(report?.rejects ?? []).map((r) => r.count));

  return (
    <div className="wd-page wd-home">
      <header className="wd-stack" style={{ gap: 16 }}>
        <span className="wd-sig auto">Reports · {period.label}</span>
        <h1 className="wd-h1">How hiring is going.</h1>
        <p className="wd-lede">
          Every figure comes from the applications themselves, so it matches what you see in each
          job.
        </p>
        <div className="wd-row-actions" role="group" aria-label="Period" style={{ gap: 6 }}>
          {REPORT_PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`wd-chip ${p.key === periodKey ? "on" : ""}`}
              aria-pressed={p.key === periodKey}
              onClick={() => setPeriodKey(p.key)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </header>

      {loading && !data ? (
        <p role="status" className="wd-muted">
          Reading every application in {period.label}…
        </p>
      ) : error || !report ? (
        <p role="alert" className="wd-problem">
          Couldn&apos;t load the reports. Reload to try again.
        </p>
      ) : report.applications === 0 ? (
        <p className="wd-lede">No applications in {period.label}. Try a longer period.</p>
      ) : (
        <>
          {!data?.complete && (
            <p role="note" className="wd-panel you wd-small" style={{ margin: 0 }}>
              This period has more applications than one report reads at once, so these figures are
              a floor, not a total. Pick a shorter period for exact numbers.
            </p>
          )}

          <dl className="wd-numbers wd-home-numbers">
            <div className="wd-number">
              <dt>Applications</dt>
              <dd>{fmt(report.applications)}</dd>
            </div>
            <div className="wd-number">
              <dt>Shortlisted</dt>
              <dd>
                {fmt(f!.shortlisted)}
                <small> {f!.conversion.appliedToShortlist}%</small>
              </dd>
            </div>
            <div className="wd-number">
              <dt>Hired</dt>
              <dd>
                {fmt(f!.hired)}
                <small> {f!.conversion.appliedToHire}%</small>
              </dd>
            </div>
            <div className="wd-number">
              <dt>Days to a decision</dt>
              <dd>{report.timing.medianDaysToDecision ?? "—"}</dd>
            </div>
            <div className="wd-number">
              <dt>Open jobs</dt>
              <dd>{data?.openJobCount ?? "—"}</dd>
            </div>
          </dl>

          <div className="wd-home-pair">
            <Section id="funnel" title="From applying to hired" note={`${f!.rejected} turned down`}>
              <ul className="wd-bars">
                {steps.map((s, i) => (
                  <li key={s.name}>
                    <span className="wd-bar-name">{s.name}</span>
                    <span className="wd-bar-track">
                      <span
                        className={`wd-bar-fill ${i === steps.length - 1 ? "go" : ""}`}
                        style={{ width: barWidth(s.value, f!.applied) }}
                      />
                    </span>
                    <span className="wd-bar-value">{fmt(s.value)}</span>
                  </li>
                ))}
              </ul>
              <p className="wd-small wd-muted" style={{ margin: "8px 0 0" }}>
                {f!.conversion.shortlistToHire}% of the shortlist were hired.{" "}
                {report.timing.waitingOverAWeek > 0 &&
                  `${fmt(report.timing.waitingOverAWeek)} have waited over a week for a decision.`}
              </p>
            </Section>

            <Section
              id="sources"
              title="Where people come from"
              note={`${report.sources.length} sources`}
            >
              <ul className="wd-bars">
                {report.sources.slice(0, 6).map((s) => (
                  <li key={s.source}>
                    <span className="wd-bar-name">{sourceName(s.source)}</span>
                    <span className="wd-bar-track">
                      <span
                        className="wd-bar-fill"
                        style={{ width: barWidth(s.applicants, maxSource) }}
                      />
                    </span>
                    <span className="wd-bar-value">
                      {fmt(s.applicants)}
                      <small> · {s.hires} hired</small>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          {months.length > 1 && (
            <Section id="trend" title="Month by month" note="Applications, shortlisted and hired">
              <div
                className="wd-months"
                role="img"
                aria-label={months
                  .map(
                    (m) =>
                      `${m.label}: ${m.applied} applied, ${m.shortlisted} shortlisted, ${m.hired} hired`,
                  )
                  .join("; ")}
              >
                {months.map((m) => (
                  <div key={m.key} className="wd-month">
                    <span className="wd-month-n">{fmt(m.applied)}</span>
                    <span className="wd-month-bars">
                      <span
                        className="wd-month-bar"
                        style={{ height: barWidth(m.applied, maxMonth) }}
                      />
                      <span
                        className="wd-month-bar go"
                        style={{ height: barWidth(m.shortlisted, maxMonth) }}
                      />
                      <span
                        className="wd-month-bar good"
                        style={{ height: barWidth(m.hired, maxMonth) }}
                      />
                    </span>
                    <span className="wd-month-label">{m.label}</span>
                  </div>
                ))}
              </div>
              <p className="wd-small wd-muted wd-month-key" style={{ margin: 0 }}>
                <span className="k" /> Applied <span className="k go" /> Shortlisted{" "}
                <span className="k good" /> Hired
              </p>
            </Section>
          )}

          <Section id="jobs" title="Each job" note={`${report.jobs.length} jobs with applications`}>
            <div className="wd-table-wrap">
              <table className="wd-table">
                <thead>
                  <tr>
                    <th scope="col">Job</th>
                    <th scope="col">Applied</th>
                    <th scope="col">Waiting</th>
                    <th scope="col">Shortlisted</th>
                    <th scope="col">Hired</th>
                    <th scope="col">Turned down</th>
                  </tr>
                </thead>
                <tbody>
                  {report.jobs.map((j) => (
                    <tr key={j.jobId}>
                      <th scope="row">
                        <Link href={`/work/jobs/${j.jobId}`}>{j.jobTitle}</Link>
                        {j.allUnscored && <span className="wd-flag">Not scored yet</span>}
                      </th>
                      <td>{fmt(j.applicants)}</td>
                      <td className={j.waiting ? "you" : ""}>{fmt(j.waiting)}</td>
                      <td>{fmt(j.shortlisted)}</td>
                      <td>{fmt(j.hired)}</td>
                      <td>{fmt(j.rejected)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <div className="wd-home-pair">
            <Section
              id="scores"
              title="How candidates scored"
              note={`${fmt(report.scores.unscored)} not scored`}
            >
              <ul className="wd-bars">
                {report.scores.bands.map((b) => (
                  <li key={b.label}>
                    <span className="wd-bar-name">{b.label}</span>
                    <span className="wd-bar-track">
                      <span
                        className="wd-bar-fill agent"
                        style={{ width: barWidth(b.count, maxBand) }}
                      />
                    </span>
                    <span className="wd-bar-value">{fmt(b.count)}</span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section
              id="rejects"
              title="Why people were turned down"
              note={
                report.rejectsTotal
                  ? `${report.rejectCoverage}% have a reason`
                  : "Nobody turned down yet"
              }
            >
              {report.rejects.length ? (
                <ul className="wd-bars">
                  {report.rejects.slice(0, 6).map((r) => (
                    <li key={r.reason}>
                      <span className="wd-bar-name">{r.label}</span>
                      <span className="wd-bar-track">
                        <span
                          className="wd-bar-fill bad"
                          style={{ width: barWidth(r.count, maxReject) }}
                        />
                      </span>
                      <span className="wd-bar-value">
                        {fmt(r.count)}
                        <small> {r.percent}%</small>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="wd-muted" style={{ margin: 0 }}>
                  Reasons appear here once candidates are turned down.
                </p>
              )}
            </Section>
          </div>

          <Section id="download" title="Download">
            <div className="wd-row-actions" style={{ gap: 8 }}>
              {[
                ["overview", "Overview"],
                ["pipeline", "Pipeline"],
                ["sources", "Sources"],
                ["time_to_hire", "Time to hire"],
                ["offer_outcomes", "Offers"],
                ["recruiter_productivity", "Recruiters"],
              ].map(([metric, name]) => (
                <a key={metric} className="wd-chip" href={exportHref(metric)}>
                  {name} · CSV
                </a>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
