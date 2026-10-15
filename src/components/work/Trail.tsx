"use client";

import { useEffect, useRef } from "react";
import {
  PHASES,
  STAGE_ORDER,
  landingIn,
  phaseOf,
  phaseStatus,
  type Journey,
  type StageKey,
  type StageStatus,
} from "@/lib/work/journey";

const STATUS_WORDS: Record<StageStatus, string> = {
  done: "done",
  working: "in progress",
  needs_you: "needs you",
  waiting: "later",
  blocked: "stuck",
  skipped: "not needed",
};

/**
 * The job's stages, grouped into Prepare, Progress and Decide. Only the phase
 * you're in shows its steps; the others fold to one word with a dot for what
 * needs you (amber), what is stuck (red) or what the agent is on (blue).
 * Opening a folded phase lands on the step that needs you there.
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
  const current = phaseOf(here);
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
        {PHASES.map((p) => {
          const open = p.key === current;
          const st = phaseStatus(journey, p.key);
          const stages = journey.stages.filter((s) => p.stages.includes(s.key));
          return (
            <li key={p.key} className={`wd-phase ${open ? "open" : ""}`}>
              <button
                type="button"
                className={`wd-phase-name ${st}`}
                aria-expanded={open}
                onClick={() => !open && onSelect(landingIn(journey, p.key))}
              >
                <i aria-hidden="true" />
                {p.label}
              </button>
              {open && (
                <ol className="wd-phase-steps">
                  {stages.map((s) => {
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
              )}
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
