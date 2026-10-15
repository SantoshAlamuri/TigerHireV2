"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useJobJourney } from "@/lib/work/use-job-journey";
import { isStageKey, nextStop, type Actor, type StageKey } from "@/lib/work/journey";
import { Trail } from "@/components/work/Trail";
import { AllClear } from "@/components/work/AllClear";
import { useWorkQueue } from "@/components/work/WorkShell";
import {
  ApplicationsPanel,
  DescriptionPanel,
  InterviewsPanel,
  OfferPanel,
  PublishPanel,
  RequestPanel,
  ReviewPanel,
  RubricPanel,
  ScoringPanel,
  type PanelProps,
} from "@/components/work/panels";

const PANELS: Record<StageKey, (p: PanelProps) => React.ReactNode> = {
  request: RequestPanel,
  description: DescriptionPanel,
  rubric: RubricPanel,
  publish: PublishPanel,
  applications: ApplicationsPanel,
  scoring: ScoringPanel,
  review: ReviewPanel,
  interviews: InterviewsPanel,
  offer: OfferPanel,
};

const ACTOR_WORD: Record<Actor, string> = { agent: "Agent", auto: "Automation", you: "You" };
const HANDOFF_MS = 2600;

interface LogLine {
  at: string;
  actor: Actor;
  what: string;
}

interface Handoff {
  done: string;
  to: StageKey | null;
}

function WorkJobBody() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const asked = search.get("at");
  const { job, facts, journey, loading, error, refresh } = useJobJourney(id);
  const { queue, refresh: refreshQueue } = useWorkQueue();

  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const here: StageKey | null = journey ? (isStageKey(asked) ? asked : journey.currentKey) : null;

  const go = useCallback(
    (key: StageKey | null) => {
      const qs = key ? `?at=${key}` : "";
      router.replace(`/work/jobs/${id}${qs}`, { scroll: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [id, router],
  );

  const onLog = useCallback(
    (actor: Actor, what: string) => {
      const at = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(
        new Date(),
      );
      setLog((l) => [{ at, actor, what }, ...l].slice(0, 30));
    },
    [setLog],
  );

  // Something finished: refresh, then hand the person to the next stop.
  const onDone = useCallback(
    async (what: string) => {
      await refresh();
      void refreshQueue();
      setHandoff({ done: what, to: null });
    },
    [refresh, refreshQueue, setHandoff],
  );

  // Work out the next stop from the refreshed journey, then move after a beat.
  useEffect(() => {
    if (!handoff || handoff.to !== null || !journey || !here) return;
    const to = nextStop(journey, here) ?? (journey.currentKey !== here ? journey.currentKey : null);
    setHandoff({ ...handoff, to: to ?? here });
  }, [handoff, journey, here]);

  useEffect(() => {
    if (!handoff?.to) return;
    if (handoff.to === here) {
      // Nowhere to move: let the note fade on its own.
      const t = setTimeout(() => setHandoff(null), 4000);
      return () => clearTimeout(t);
    }
    timer.current = setTimeout(() => {
      onLog(
        "auto",
        `Moved you to ${journey?.stages.find((s) => s.key === handoff.to)?.label ?? "the next step"}`,
      );
      go(handoff.to);
      setHandoff(null);
    }, HANDOFF_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [handoff, here, go, journey, onLog]);

  // Keyboard: Escape keeps you where you are during a handoff.
  useEffect(() => {
    if (!handoff) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHandoff(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handoff]);

  if (loading) {
    return (
      <div className="wd-page">
        <p role="status" className="wd-muted">
          Opening the job…
        </p>
      </div>
    );
  }
  if (error || !job || !journey || !facts || !here) {
    return (
      <div className="wd-page">
        <h1 className="wd-h2">This job could not be opened.</h1>
        <p className="wd-muted" style={{ margin: 0 }}>
          It may have been removed, or you may not have access. Reload to try again.
        </p>
        <div className="wd-row-actions">
          <Link href="/work" className="wd-btn">
            Back to your work
          </Link>
        </div>
      </div>
    );
  }

  const stage = journey.stages.find((s) => s.key === here)!;
  const Panel = PANELS[here];
  const nextJob = queue.needsYou.find((e) => e.id !== id);
  const jobClear = journey.needsYouCount === 0;
  const holder: Actor =
    stage.status === "needs_you" || stage.status === "blocked"
      ? "you"
      : stage.actors.includes("agent")
        ? "agent"
        : stage.actors[0];
  const holderWord =
    stage.status === "blocked"
      ? "Stuck, needs you"
      : stage.status === "done"
        ? "Done"
        : ACTOR_WORD[holder];

  return (
    <>
      <Trail journey={journey} here={here} onSelect={(k) => go(k)} />
      <div className="wd-page">
        <header className="wd-stack" style={{ gap: 18 }}>
          <div className="wd-row-actions" style={{ gap: 18 }}>
            <span className={`wd-sig ${stage.status === "blocked" ? "bad" : holder}`}>
              {holderWord}
            </span>
            <span className="wd-small wd-muted">
              {job.title}
              {job.location ? `, ${job.location}` : ""}
            </span>
            {here !== journey.currentKey && (
              <button type="button" className="wd-btn quiet" onClick={() => go(null)}>
                Take me to what needs me
              </button>
            )}
          </div>
          <h1 className="wd-h1" style={{ maxWidth: "20ch" }}>
            {stage.headline}.
          </h1>
        </header>

        {jobClear && here === journey.currentKey && stage.status !== "needs_you" && nextJob ? (
          <AllClear
            title="This job is in good hands."
            detail="The agent and automation will bring it back to you when it needs a decision."
            action={
              <Link href={`/work/jobs/${nextJob.id}`} className="wd-btn go" autoFocus>
                Next: {nextJob.title}
              </Link>
            }
          />
        ) : (
          <section aria-label={stage.label}>
            <Panel
              key={here}
              jobId={id}
              job={job}
              facts={facts}
              onDone={(what) => void onDone(what)}
              onLog={onLog}
              goTo={(k) => go(k)}
            />
          </section>
        )}

        {log.length > 0 && (
          <section aria-label="What just happened" className="wd-stack" style={{ gap: 8 }}>
            <span className="wd-small wd-muted">What just happened</span>
            <ul className="wd-log">
              {log.map((l, i) => (
                <li key={i}>
                  <time>{l.at}</time>
                  <span className={`wd-sig ${l.actor}`}>{ACTOR_WORD[l.actor]}</span>
                  <span>{l.what}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {handoff && (
        <div className="wd-handoff" role="status" aria-live="polite">
          <span className="wd-small">
            <b style={{ fontWeight: 600 }}>{handoff.done}.</b>{" "}
            {handoff.to && handoff.to !== here
              ? `Next: ${journey.stages.find((s) => s.key === handoff.to)?.label}`
              : jobClear && nextJob
                ? `This job is clear. Next up: ${nextJob.title}`
                : "Nice."}
          </span>
          {handoff.to && handoff.to !== here ? (
            <>
              <button type="button" className="wd-btn" onClick={() => setHandoff(null)}>
                Stay here
              </button>
              <span
                className="wd-handoff-bar"
                style={{ ["--wd-handoff-ms" as string]: `${HANDOFF_MS}ms` }}
                aria-hidden="true"
              />
            </>
          ) : jobClear && nextJob ? (
            <Link
              href={`/work/jobs/${nextJob.id}`}
              className="wd-btn"
              onClick={() => setHandoff(null)}
            >
              Go
            </Link>
          ) : (
            <button type="button" className="wd-btn" onClick={() => setHandoff(null)}>
              Close
            </button>
          )}
        </div>
      )}
    </>
  );
}

/**
 * A job, driven by its work. Opening it lands on the step that needs you;
 * finishing a step carries you to the next one, and finishing the job offers
 * the next job in your queue.
 */
export default function WorkJobPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="wd-muted">
          Opening the job…
        </p>
      }
    >
      <WorkJobBody />
    </Suspense>
  );
}
