"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useWorkQueue } from "@/components/work/WorkShell";
import { useOnboardingHints } from "@/components/work/use-onboarding";
import {
  ONBOARDING_HINTS,
  adminSteps,
  currentStep,
  onboardingKind,
  type OnboardingKind,
  type SetupStepKey,
} from "@/lib/work/onboarding";

/**
 * Onboarding. Admins get a checklist that ticks itself off from real data and
 * opens on the step that isn't done. Everyone else gets a short welcome.
 */
export default function WelcomePage() {
  return (
    <Suspense fallback={null}>
      <WelcomeRouter />
    </Suspense>
  );
}

const PREVIEWS: { kind: OnboardingKind; label: string }[] = [
  { kind: "admin", label: "Admin" },
  { kind: "user", label: "Recruiter" },
  { kind: "hm", label: "Hiring manager" },
];

function isKind(v: string | null): v is OnboardingKind {
  return v === "admin" || v === "user" || v === "hm";
}

/** `?preview=admin|user|hm` shows any flow from the start without saving anything. */
function WelcomeRouter() {
  const { user } = useAuth();
  const asked = useSearchParams().get("preview");
  if (!user) return null;
  const preview = isKind(asked) ? asked : null;
  const kind = preview ?? onboardingKind(user.role, Boolean(user.isOrgAdmin));
  return (
    <>
      {preview && <PreviewBar kind={preview} />}
      {kind === "admin" ? (
        <AdminSetup key="admin" preview={!!preview} />
      ) : (
        <Welcome key={kind} kind={kind} preview={!!preview} />
      )}
    </>
  );
}

function PreviewBar({ kind }: { kind: OnboardingKind }) {
  return (
    <div className="wd-preview" role="note">
      <span className="wd-sig auto">Preview — nothing is saved</span>
      <nav aria-label="Preview another flow" className="wd-row-actions" style={{ gap: 4 }}>
        {PREVIEWS.map((p) => (
          <Link
            key={p.kind}
            href={`/work/welcome?preview=${p.kind}`}
            className={`wd-btn quiet ${p.kind === kind ? "on" : ""}`}
            aria-current={p.kind === kind ? "page" : undefined}
          >
            {p.label}
          </Link>
        ))}
        <Link href="/work/setup" className="wd-btn quiet">
          Close
        </Link>
      </nav>
    </div>
  );
}

/* ---------------- admin: set up your team ---------------- */

function AdminSetup({ preview }: { preview: boolean }) {
  const router = useRouter();
  // In preview every step starts open; "Mark done" stands in for doing it.
  const [pretend, setPretend] = useState<Set<SetupStepKey>>(new Set());
  const { hints, dismiss } = useOnboardingHints();
  const { queue, waiting, loading: queueLoading } = useWorkQueue();
  const calendar = useApiQuery<{ integrations: { status: string }[] }>(
    "/api/settings/me/integrations",
  );
  const team = useApiQuery<{ members: { is_active?: boolean }[]; pendingInvites: unknown[] }>(
    "/api/organisations/members",
  );

  const loading =
    queueLoading || (calendar.loading && !calendar.data) || (team.loading && !team.data);
  const steps = adminSteps(
    preview
      ? {
          calendarConnected: pretend.has("calendar"),
          teamSize: 1,
          pendingInvites: pretend.has("team") ? 2 : 0,
          processReviewed: pretend.has("process"),
          hasJob: pretend.has("job"),
        }
      : {
          calendarConnected: (calendar.data?.integrations ?? []).some(
            (i) => i.status === "connected",
          ),
          teamSize: (team.data?.members ?? []).filter((m) => m.is_active !== false).length,
          pendingInvites: team.data?.pendingInvites?.length ?? 0,
          processReviewed: hints.includes(ONBOARDING_HINTS.processReviewed),
          hasJob: queue.needsYou.length + queue.moving.length + waiting.length > 0,
        },
  );
  const markDone = (key: SetupStepKey) => setPretend((p) => new Set(p).add(key));
  const here = currentStep(steps);
  const doneCount = steps.filter((s) => s.done).length;

  // Everything done: record it once so home stops sending people here.
  useEffect(() => {
    if (!preview && !loading && !here && !hints.includes(ONBOARDING_HINTS.adminSetup)) {
      void dismiss(ONBOARDING_HINTS.adminSetup);
    }
  }, [preview, loading, here, hints, dismiss]);

  if (loading && !preview) {
    return (
      <div className="wd-page">
        <p role="status" className="wd-muted">
          Checking your setup…
        </p>
      </div>
    );
  }

  const skip = async () => {
    if (!preview) await dismiss(ONBOARDING_HINTS.adminSetup);
    router.push(preview ? "/work/setup" : "/work");
  };

  return (
    <div className="wd-page">
      <header className="wd-stack" style={{ gap: 18 }}>
        <span className="wd-sig you">Set up your team</span>
        <h1 className="wd-h1" style={{ maxWidth: "18ch" }}>
          {here ? "Four things, then you're hiring." : "Your team is set up."}
        </h1>
        <p className="wd-lede">
          {here
            ? "Each one ticks itself off when it's done. Do them in any order; we'll keep you on the next one."
            : "Everything that isn't one job lives in Setup, if you ever need to change it."}
        </p>
        <div className="wd-progress" aria-hidden="true">
          <span style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
        <span className="wd-small wd-muted">
          {doneCount} of {steps.length} done
        </span>
      </header>

      <ol className="wd-onb" aria-label="Setup steps">
        {steps.map((s, i) => {
          const open = here?.key === s.key;
          return (
            <li key={s.key} className={`wd-onb-item ${s.done ? "done" : ""} ${open ? "open" : ""}`}>
              <span className="wd-onb-mark" aria-hidden="true">
                {s.done ? "✓" : i + 1}
              </span>
              <div className="wd-stack" style={{ gap: 10, minWidth: 0 }}>
                <h2 className="wd-h2" style={{ margin: 0 }}>
                  {s.title}
                  <span className="sr-only">{s.done ? ", done" : open ? ", next" : ""}</span>
                </h2>
                {s.done && <span className="wd-small wd-muted">{s.doneLine}</span>}
                {open && (
                  <>
                    <p className="wd-muted" style={{ margin: 0 }}>
                      {s.why}
                    </p>
                    <div className="wd-row-actions">
                      {s.links.map((l, j) => (
                        <Link
                          key={l.href}
                          href={l.href}
                          className={`wd-btn ${j === 0 && s.key !== "process" ? "go" : ""}`}
                          autoFocus={j === 0}
                        >
                          {l.name}
                        </Link>
                      ))}
                      {s.key === "process" && (
                        <button
                          type="button"
                          className="wd-btn go"
                          onClick={() =>
                            preview
                              ? markDone("process")
                              : void dismiss(ONBOARDING_HINTS.processReviewed)
                          }
                        >
                          These look right
                        </button>
                      )}
                      {preview && s.key !== "process" && (
                        <button
                          type="button"
                          className="wd-btn quiet"
                          onClick={() => markDone(s.key)}
                        >
                          Mark done (preview)
                        </button>
                      )}
                    </div>
                  </>
                )}
                {!open && !s.done && (
                  <Link href={s.links[0].href} className="wd-small wd-muted">
                    Do this now
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="wd-row-actions">
        {here ? (
          <button type="button" className="wd-btn quiet" onClick={() => void skip()}>
            Skip for now — it stays under Needs you
          </button>
        ) : (
          <Link href={preview ? "/work/setup" : "/work"} className="wd-btn go">
            Go to your work
          </Link>
        )}
      </div>
    </div>
  );
}

/* ---------------- everyone else: a short welcome ---------------- */

interface Screen {
  sig: string;
  title: string;
  body: string;
}

const USER_SCREENS: Screen[] = [
  {
    sig: "How it works",
    title: "Work comes to you.",
    body: "Your jobs line up on the left, the most urgent first. Press Start and you land on the exact step that needs you. When you're done, the next job opens.",
  },
  {
    sig: "Who does what",
    title: "You only do the parts that need a person.",
    body: "Every step is marked, so you always know who's on it.",
  },
  {
    sig: "One thing to set",
    title: "Tell us when you can interview.",
    body: "Candidates book into your free time, so nobody chases calendars. It takes a minute, or do it later from Setup.",
  },
];

const HM_SCREENS: Screen[] = [
  {
    sig: "How it works",
    title: "You'll only see decisions.",
    body: "Your recruiter runs the job. When a shortlist, interview feedback or an offer needs your yes, it lands here.",
  },
  {
    sig: "Then it moves on",
    title: "Decide, and the job carries on.",
    body: "Approve or decline with a line of why. Nothing else to manage.",
  },
];

function Welcome({ kind, preview }: { kind: Exclude<OnboardingKind, "admin">; preview: boolean }) {
  const router = useRouter();
  const { dismiss } = useOnboardingHints();
  const screens = kind === "hm" ? HM_SCREENS : USER_SCREENS;
  const [i, setI] = useState(0);
  const s = screens[i];
  const last = i === screens.length - 1;
  const home = kind === "hm" ? "/work/hm" : "/work";

  const finish = async (to: string) => {
    if (preview) return router.push("/work/setup");
    await dismiss(ONBOARDING_HINTS.welcome);
    router.push(to);
  };

  return (
    <div className="wd-page" style={{ paddingTop: "10vh" }}>
      <section className="wd-stack" style={{ gap: 18 }} aria-live="polite" key={i}>
        <span className="wd-sig you">{s.sig}</span>
        <h1 className="wd-h1" style={{ maxWidth: "18ch" }}>
          {s.title}
        </h1>
        <p className="wd-lede">{s.body}</p>
        {kind === "user" && i === 1 && (
          <div className="wd-who-grid" style={{ marginTop: 8 }}>
            <div className="wd-panel">
              <span className="wd-sig auto">Automation</span>
              <p>Collects applications and applies your rules. No AI.</p>
            </div>
            <div className="wd-panel agent">
              <span className="wd-sig agent">Agent</span>
              <p>Drafts and scores, quoting the evidence so you can check it.</p>
            </div>
            <div className="wd-panel you">
              <span className="wd-sig you">You</span>
              <p>Approve, override and decide. Your call always wins.</p>
            </div>
          </div>
        )}
      </section>

      <div className="wd-row-actions">
        {last ? (
          kind === "user" ? (
            <>
              <button
                type="button"
                className="wd-btn go"
                autoFocus
                onClick={() => void finish("/work/setup/availability")}
              >
                Set my availability
              </button>
              <button type="button" className="wd-btn" onClick={() => void finish(home)}>
                Later — take me to my work
              </button>
            </>
          ) : (
            <button type="button" className="wd-btn go" autoFocus onClick={() => void finish(home)}>
              Show my decisions
            </button>
          )
        ) : (
          <button type="button" className="wd-btn go" autoFocus onClick={() => setI(i + 1)}>
            Next
          </button>
        )}
        {i > 0 && (
          <button type="button" className="wd-btn quiet" onClick={() => setI(i - 1)}>
            Back
          </button>
        )}
        {!last && (
          <button type="button" className="wd-btn quiet" onClick={() => void finish(home)}>
            Skip
          </button>
        )}
        <span className="wd-small wd-muted" style={{ marginLeft: "auto" }}>
          {i + 1} of {screens.length}
        </span>
      </div>
    </div>
  );
}
