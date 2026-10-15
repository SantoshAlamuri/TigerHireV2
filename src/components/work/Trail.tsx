"use client";

import {
  CalendarDays,
  Check,
  ClipboardList,
  FileText,
  Handshake,
  Inbox,
  ListChecks,
  Megaphone,
  Sparkles,
  TriangleAlert,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type { Journey, StageKey, StageStatus } from "@/lib/work/journey";

const ICONS: Record<StageKey, LucideIcon> = {
  request: ClipboardList,
  description: FileText,
  rubric: ListChecks,
  publish: Megaphone,
  applications: Inbox,
  scoring: Sparkles,
  review: UserCheck,
  interviews: CalendarDays,
  offer: Handshake,
};

const STATUS_WORDS: Record<StageStatus, string> = {
  done: "Done",
  working: "On it",
  needs_you: "Needs you",
  waiting: "Later",
  blocked: "Stuck",
  skipped: "Not needed",
};

/**
 * The stepping-stone trail. Every stage of the job, who holds it, and the
 * stone you are standing on. Done stones can be revisited; stones ahead that
 * nobody has reached yet stay closed.
 */
export function Trail({
  journey,
  here,
  arrived,
  onSelect,
}: {
  journey: Journey;
  here: StageKey;
  /** True right after the job moved you, so the marker hops. */
  arrived: boolean;
  onSelect: (key: StageKey) => void;
}) {
  const hereRef = useRef<HTMLButtonElement>(null);
  // Keep the stone you are on in view when the trail is wider than the screen.
  useEffect(() => {
    const el = hereRef.current;
    const nav = el?.closest(".wd-trail");
    if (!el || !nav || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({ left: el.offsetLeft - nav.clientWidth / 2 + 40, behavior: "smooth" });
  }, [here]);
  return (
    <nav className="wd-trail" aria-label="Where this job is">
      <ol>
        {journey.stages.map((s) => {
          const Icon =
            s.status === "done" ? Check : s.status === "blocked" ? TriangleAlert : ICONS[s.key];
          const isHere = s.key === here;
          const reachable = s.status !== "waiting" || isHere;
          const auto = s.actors.length === 1 && s.actors[0] === "auto";
          return (
            <li key={s.key}>
              <button
                ref={isHere ? hereRef : undefined}
                type="button"
                className={`wd-stone ${s.status} ${auto ? "auto" : ""} ${isHere ? "here" : ""} ${isHere && arrived ? "arrived" : ""}`}
                aria-current={isHere ? "step" : undefined}
                aria-label={`${s.label}: ${STATUS_WORDS[s.status]}. ${s.headline}`}
                disabled={!reachable}
                onClick={() => onSelect(s.key)}
              >
                <span className="wd-pebble" aria-hidden="true">
                  <Icon strokeWidth={2.4} />
                </span>
                <span className="wd-stone-label">{s.label}</span>
                <span className="wd-stone-sub">{STATUS_WORDS[s.status]}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
