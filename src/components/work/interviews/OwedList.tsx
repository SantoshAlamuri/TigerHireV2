"use client";

import { useState } from "react";
import { endedAgo, plural, type OwedScorecard } from "@/lib/work/interviews";
import { Scorecard } from "./Scorecard";
import s from "./interviews.module.css";

/** 1. Interviews that happened with no scorecard. Most overdue first. */
export function OwedList({
  jobId,
  items,
  now,
  templateFor,
  onFiled,
  onAgent,
}: {
  jobId: string;
  items: OwedScorecard[];
  now: number;
  templateFor: (pipelineCandidateId: string) => string | null;
  onFiled: (item: OwedScorecard) => void | Promise<void>;
  onAgent: (what: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (!items.length) return null;

  return (
    <section className={s.section} aria-labelledby="wd-iv-owed">
      <div className={s.sectionHead}>
        <h2 className="wd-h2" id="wd-iv-owed">
          Scorecards owed
        </h2>
        <span className={s.count}>{plural(items.length, "interview")} without feedback</span>
      </div>
      <div className={s.list}>
        {items.map((o) => (
          <div key={o.slotId} className={s.row}>
            <div>
              <div className={s.who}>{o.candidateName}</div>
              <div className={s.meta}>
                <span>{endedAgo(o.endedAt, now)}</span>
                <span>{o.stageName}</span>
                <span>
                  Interviewer: <b>{o.interviewer ?? "not set"}</b>
                </span>
              </div>
              <div className={s.meta}>
                <span className="wd-sig auto">
                  {o.reminded
                    ? `Automation has reminded ${o.interviewer ?? "the interviewer"}`
                    : `Automation reminds ${o.interviewer ?? "the interviewer"} 24 hours after`}
                </span>
              </div>
            </div>
            <div className={s.actions}>
              <button
                type="button"
                className={open === o.slotId ? "wd-btn" : "wd-btn go"}
                aria-expanded={open === o.slotId}
                onClick={() => setOpen((x) => (x === o.slotId ? null : o.slotId))}
              >
                {open === o.slotId ? "Close scorecard" : "Write the scorecard"}
              </button>
            </div>
            {open === o.slotId && (
              <Scorecard
                jobId={jobId}
                pipelineCandidateId={o.pipelineCandidateId}
                candidateName={o.candidateName}
                stageTemplateId={templateFor(o.pipelineCandidateId)}
                onAgent={onAgent}
                onFiled={async () => {
                  setOpen(null);
                  await onFiled(o);
                }}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
