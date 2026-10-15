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

  const [arrived, setArrived] = useState(false);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const here: StageKey | null = journey ? (isStageKey(asked) ? asked : journey.currentKey) : null;

  const go = useCallback(
    (key: StageKey | null, opts: { hop?: boolean } = {}) => {
      const qs = key ? `?at=${key}` : "";
      router.replace(`/work/jobs/${id}${qs}`, { scroll: false });
      if (opts.hop) {
        setArrived(true);
        setTimeout(() => setArrived(false), 700);
      }
    },
    [id, router, setArrived],
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
      go(handoff.to, { hop: true });
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
      <p role="status" className="wd-muted">
        Opening the job…
      </p>
    );
  }
  if (error || !job || !journey || !facts || !here) {
    return (
      <div className="wd-stack" style={{ maxWidth: 560 }}>
        <h1 className="wd-h2">This job could not be opened</h1>
        <p className="wd-muted" style={{ margin: 0 }}>
          It may have been removed, or you may not have access. Reload to try again.
        </p>
        <Link href="/work" className="wd-btn">
          Back to your work
        </Link>
      </div>
    );
  }

  const stage = journey.stages.find((s) => s.key === here)!;
  const Panel = PANELS[here];
  const nextJob = queue.needsYou.find((e) => e.id !== id);
  const tone = stage.status === "blocked" ? "blocked" : stage.status === "needs_you" ? "you" : "";
  const jobClear = journey.needsYouCount === 0;
  const holder =
    stage.status === "needs_you" || stage.status === "blocked" ? ["you" as Actor] : stage.actors;

  return (
    <div className="wd-stack" style={{ gap: 20, maxWidth: 1180 }}>
      <header className="wd-stack" style={{ gap: 4 }}>
        <p className="wd-small wd-muted" style={{ margin: 0 }}>
          {job.location ? `${job.location} · ` : ""}
          {jobClear
            ? "Nothing here needs you right now"
            : `${journey.needsYouCount} ${journey.needsYouCount === 1 ? "step needs" : "steps need"} you`}
        </p>
        <h1 className="wd-h1">{job.title}</h1>
      </header>

      <Trail journey={journey} here={here} arrived={arrived} onSelect={(k) => go(k)} />

      <div className={`wd-now ${tone}`} role="status">
        <span className="wd-row" style={{ gap: 6 }}>
          {holder.map((a) => (
            <span key={a} className={`wd-who ${a}`}>
              {ACTOR_WORD[a]}
            </span>
          ))}
        </span>
        <strong>{stage.headline}</strong>
        {here !== journey.currentKey && (
          <button
            type="button"
            className="wd-btn quiet"
            style={{ marginLeft: "auto", minHeight: 36, color: "inherit" }}
            onClick={() => go(null, { hop: true })}
          >
            Take me to what needs me
          </button>
        )}
      </div>

      {jobClear && here === journey.currentKey && stage.status !== "needs_you" && nextJob ? (
        <div className="wd-panel">
          <AllClear
            title="This job is in good hands."
            detail={`${stage.headline}. The agent and automation will bring it back to you when it needs a decision.`}
            action={
              <Link href={`/work/jobs/${nextJob.id}`} className="wd-btn go" autoFocus>
                Next: {nextJob.title}
              </Link>
            }
          />
        </div>
      ) : (
        <section className="wd-panel" aria-label={stage.label}>
          <Panel
            key={here}
            jobId={id}
            job={job}
            facts={facts}
            onDone={(what) => void onDone(what)}
            onLog={onLog}
            goTo={(k) => go(k, { hop: true })}
          />
        </section>
      )}

      {log.length > 0 && (
        <section aria-label="What just happened" className="wd-stack" style={{ gap: 8 }}>
          <h2 className="wd-small" style={{ margin: 0, fontWeight: 700 }}>
            What just happened
          </h2>
          <ul className="wd-log">
            {log.map((l, i) => (
              <li key={i}>
                <time>{l.at}</time>
                <span className={`wd-who ${l.actor}`}>{ACTOR_WORD[l.actor]}</span>
                <span>{l.what}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {handoff && (
        <div className="wd-handoff" role="status" aria-live="polite">
          <span>
            <b>{handoff.done}.</b>{" "}
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
    </div>
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
