"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery } from "@/lib/hooks/use-api";
import { Scorecard } from "@/components/work/interviews/Scorecard";
import {
  fromAggregate,
  fromAssigned,
  weekView,
  type AggregateRow,
  type AssignedRow,
  type Interview,
} from "@/lib/work/my-interviews";

const time = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const when = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

function Prep({ i }: { i: Interview }) {
  if (!i.jdSummary && !i.answers.length && !i.resumeUrl) return null;
  return (
    <div className="wd-prep">
      {i.resumeUrl && (
        <a className="wd-chip" href={i.resumeUrl} target="_blank" rel="noreferrer">
          Open CV
        </a>
      )}
      {i.jdSummary && (
        <div className="wd-stack" style={{ gap: 4 }}>
          <span className="wd-small wd-muted">The role</span>
          <p style={{ margin: 0, lineHeight: 1.55 }}>{i.jdSummary}</p>
        </div>
      )}
      {i.answers.length > 0 && (
        <div className="wd-stack" style={{ gap: 4 }}>
          <span className="wd-small wd-muted">Their screening answers</span>
          <dl className="wd-lines" style={{ margin: 0 }}>
            {i.answers.map((a) => (
              <div
                key={a.question}
                className="wd-line"
                style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr)" }}
              >
                <dt className="wd-line-label">{a.question}</dt>
                <dd className="wd-line-value" style={{ margin: 0 }}>
                  {a.answer}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

/**
 * Your interviews: scorecards you still owe first, then the days ahead.
 * Interviewers see their own; recruiters and hiring managers see every booked
 * interview on the jobs they can see.
 */
export default function InterviewsPage() {
  const { user } = useAuth();
  const isInterviewer = user?.role === "interviewer";
  const range = useMemo(() => {
    const from = new Date();
    from.setDate(from.getDate() - 14);
    const to = new Date();
    to.setDate(to.getDate() + 14);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);
  const mine = useApiQuery<{ interviews: AssignedRow[] }>(
    isInterviewer ? "/api/interviewer/interviews" : null,
  );
  const all = useApiQuery<{ interviews: AggregateRow[] }>(
    user && !isInterviewer ? "/api/interviews/aggregate" : null,
    range,
  );
  const q = isInterviewer ? mine : all;
  const list = useMemo(
    () =>
      isInterviewer
        ? fromAssigned(mine.data?.interviews ?? [])
        : fromAggregate(all.data?.interviews ?? [], user?.id),
    [isInterviewer, mine.data, all.data, user?.id],
  );
  const view = useMemo(() => weekView(list), [list]);
  const [open, setOpen] = useState<string | null>(null);
  const [filing, setFiling] = useState<string | null>(null);

  const myOwed = view.owed.filter((i) => i.mine);
  const othersOwed = view.owed.filter((i) => !i.mine);
  const first = user?.name?.split(" ")[0];

  if (q.loading && !q.data)
    return (
      <div className="wd-page">
        <p role="status" className="wd-muted">
          Finding your interviews…
        </p>
      </div>
    );

  return (
    <div className="wd-page wd-home">
      <header className="wd-stack" style={{ gap: 16 }}>
        <span className={`wd-sig ${myOwed.length ? "you" : "auto"}`}>
          {isInterviewer ? `Your interviews${first ? `, ${first}` : ""}` : "Interviews"}
        </span>
        <h1 className="wd-h1">
          {myOwed.length
            ? `${myOwed.length} ${myOwed.length === 1 ? "scorecard" : "scorecards"} to file.`
            : view.upcoming
              ? `${view.upcoming} ${view.upcoming === 1 ? "interview" : "interviews"} coming up.`
              : "No interviews coming up."}
        </h1>
        <p className="wd-lede">
          {isInterviewer
            ? "Each one has the CV, the role and their screening answers, so you walk in prepared. File the scorecard straight after."
            : "Every booked interview on your jobs for the next two weeks, and any scorecard still missing."}
        </p>
      </header>

      {q.error && (
        <p role="alert" className="wd-problem">
          Couldn&apos;t load interviews. Reload to try again.
        </p>
      )}

      {myOwed.length > 0 && (
        <section className="wd-group" aria-labelledby="owed-h">
          <header className="wd-group-head">
            <h2 id="owed-h" className="wd-h2">
              Scorecards you owe
            </h2>
            <span className="wd-small wd-muted">{myOwed.length}</span>
          </header>
          <ul className="wd-rows">
            {myOwed.map((i) => (
              <li key={i.key} className="wd-iv">
                <div className="wd-iv-row">
                  <span className="wd-qdot you" aria-hidden="true" />
                  <span className="wd-row-title">{i.candidate}</span>
                  <span className="wd-row-line">
                    {i.job} · {i.stage} · {when(i.start)}
                  </span>
                  <button
                    type="button"
                    className="wd-btn go"
                    aria-expanded={filing === i.key}
                    onClick={() => setFiling(filing === i.key ? null : i.key)}
                  >
                    {filing === i.key ? "Close" : "Fill scorecard"}
                  </button>
                </div>
                {filing === i.key && (
                  <div className="wd-iv-body">
                    <Scorecard
                      jobId={i.jobId}
                      pipelineCandidateId={i.pipelineCandidateId}
                      candidateName={i.candidate}
                      stageTemplateId={null}
                      onAgent={() => undefined}
                      onFiled={async () => {
                        setFiling(null);
                        await q.refetch({ silent: true });
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {view.days.map((d) => (
        <section key={d.key} className="wd-group" aria-label={d.label}>
          <header className="wd-group-head">
            <h2 className="wd-h2">{d.label}</h2>
            <span className="wd-small wd-muted">{d.items.length}</span>
          </header>
          <ul className="wd-rows">
            {d.items.map((i) => {
              const canPrep = !!(i.jdSummary || i.answers.length || i.resumeUrl);
              return (
                <li key={i.key} className="wd-iv">
                  <div className="wd-iv-row">
                    <span className="wd-iv-time">{time(i.start)}</span>
                    <span className="wd-row-title">{i.candidate}</span>
                    <span className="wd-row-line">
                      {i.job} · {i.stage}
                      {i.interviewer && !i.mine ? ` · with ${i.interviewer}` : ""}
                    </span>
                    {canPrep ? (
                      <button
                        type="button"
                        className="wd-btn quiet"
                        aria-expanded={open === i.key}
                        onClick={() => setOpen(open === i.key ? null : i.key)}
                      >
                        {open === i.key ? "Hide" : "Prepare"}
                      </button>
                    ) : !isInterviewer ? (
                      <Link className="wd-btn quiet" href={`/work/jobs/${i.jobId}?at=interviews`}>
                        Open job
                      </Link>
                    ) : (
                      <span />
                    )}
                  </div>
                  {open === i.key && (
                    <div className="wd-iv-body">
                      <Prep i={i} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {!isInterviewer && othersOwed.length > 0 && (
        <section className="wd-group" aria-labelledby="others-h">
          <header className="wd-group-head">
            <h2 id="others-h" className="wd-h2">
              Scorecards still missing
            </h2>
            <span className="wd-small wd-muted">{othersOwed.length}</span>
          </header>
          <ul className="wd-rows">
            {othersOwed.map((i) => (
              <li key={i.key}>
                <Link href={`/work/jobs/${i.jobId}?at=interviews`} className="wd-row">
                  <span className="wd-qdot bad" aria-hidden="true" />
                  <span className="wd-row-title">{i.candidate}</span>
                  <span className="wd-row-line">
                    {i.interviewer ?? "Interviewer"} · {when(i.start)}
                  </span>
                  <span className="wd-row-go" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
