"use client";

import { useEffect, useRef } from "react";
import { STAGE_ORDER, type Journey, type StageKey, type StageStatus } from "@/lib/work/journey";

const STATUS_WORDS: Record<StageStatus, string> = {
  done: "done",
  working: "in progress",
  needs_you: "needs you",
  waiting: "later",
  blocked: "stuck",
  skipped: "not needed",
};

/**
 * The job's stages as a quiet line of words with an amber progress rule under
 * it. A dot marks what needs you (amber), what is stuck (red) and what the
 * agent is working on (blue). Stages nobody has reached yet stay closed.
 */
export function Trail({
  journey,
  here,
  onSelect,
}: {
  journey: Journey;
  here: StageKey;
  onSelect: (key: StageKey) => void;
}) {
  const hereRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = hereRef.current;
    const list = el?.closest("ol");
    if (!el || !list || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo({ left: el.offsetLeft - list.clientWidth / 2, behavior: "smooth" });
  }, [here]);

  const doneCount = journey.stages.filter(
    (s) => s.status === "done" || s.status === "skipped",
  ).length;
  const progress = Math.round((doneCount / STAGE_ORDER.length) * 100);

  return (
    <nav className="wd-steps" aria-label="Where this job is">
      <ol>
        {journey.stages.map((s) => {
          const isHere = s.key === here;
          const reachable = s.status !== "waiting" || isHere;
          return (
            <li key={s.key}>
              <button
                ref={isHere ? hereRef : undefined}
                type="button"
                className={`wd-step ${s.status} ${isHere ? "here" : ""}`}
                aria-current={isHere ? "step" : undefined}
                aria-label={`${s.label}, ${STATUS_WORDS[s.status]}. ${s.headline}`}
                disabled={!reachable}
                onClick={() => onSelect(s.key)}
              >
                <i aria-hidden="true" />
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="wd-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
    </nav>
  );
}
