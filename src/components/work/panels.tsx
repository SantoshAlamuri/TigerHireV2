"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import {
  AddCandidates,
  ApprovalTimeline,
  MustHavesEditor,
  ScreeningEditor,
  ShortlistBar,
} from "@/components/work/editors";
import type { IdealCandidateProfile } from "@/lib/work/icp";
import { ReviewBlock } from "@/components/work/review/ReviewBlock";
import { InterviewsBlock } from "@/components/work/interviews/InterviewsBlock";
import type { JourneyFacts } from "@/lib/work/journey";
import type { WorkJob } from "@/lib/work/use-job-journey";
import {
  fromDisplayWeights,
  rubricLabel,
  toDisplayWeights,
  weightTotal,
} from "@/lib/work/rubric-weights";

/** What every stage panel receives. `onDone` tells the job to move you on. */
export interface PanelProps {
  jobId: string;
  job: WorkJob;
  facts: JourneyFacts;
  onDone: (what: string) => void;
  onLog: (actor: "agent" | "auto" | "you", what: string) => void;
  goTo: (key: "rubric" | "review" | "publish") => void;
}

function Numbers({ items }: { items: [string, number | string][] }) {
  return (
    <div className="wd-numbers">
      {items.map(([label, value]) => (
        <div className="wd-number" key={label}>
          <b>{value}</b>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="wd-problem">
      {children}
    </p>
  );
}

export function RequestPanel({ facts }: PanelProps) {
  if (!facts.hiringRequestId)
    return <p className="wd-lede">This job was set up directly, without a hiring request.</p>;
  return <ApprovalTimeline requestId={facts.hiringRequestId} />;
}

/**
 * The description: the agent drafts, you edit, you save. The agent's redraft
 * never replaces unsaved edits without asking.
 */
export function DescriptionPanel({ jobId, job, onDone, onLog }: PanelProps) {
  const [text, setText] = useState(job.description ?? "");
  const [dirty, setDirty] = useState(false);
  const [confirmRedraft, setConfirmRedraft] = useState(false);
  const save = useApiMutation<{ description: string }, { job: WorkJob }>(
    `/api/jobs/${jobId}`,
    "PATCH",
  );
  const draft = useApiMutation<{ prompt: string }, { rawText?: string }>(
    "/api/jobs/generate-jd",
    "POST",
  );

  async function redraft() {
    setConfirmRedraft(false);
    const prompt =
      `${job.title ?? "Role"}${job.location ? `, ${job.location}` : ""}.\n\n${text}`.slice(
        0,
        15_000,
      );
    const res = await draft.mutate({ prompt: prompt.length >= 10 ? prompt : `${prompt} role` });
    if (res?.rawText) {
      setText(res.rawText);
      setDirty(true);
      onLog("agent", "Drafted a new job description");
    }
  }
  async function submit() {
    const res = await save.mutate({ description: text });
    if (res) {
      setDirty(false);
      onLog("you", "Saved the job description");
      onDone("Description saved");
    }
  }
  const short = text.trim().length < 50;

  return (
    <form
      className="wd-stack"
      style={{ gap: 24 }}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label htmlFor="wd-jd" className="wd-muted">
        Candidates read this, and the agent builds the rubric from it. Edit anything.
      </label>
      <textarea
        id="wd-jd"
        className="wd-textarea tall"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
      />
      {(save.error || draft.error) && <Problem>{save.error ?? draft.error}</Problem>}
      <div className="wd-row-actions">
        <button type="submit" className="wd-btn go" disabled={save.loading || short}>
          {save.loading ? "Saving…" : "Save description"}
        </button>
        {confirmRedraft ? (
          <>
            <span className="wd-small">Replace your unsaved edits with a new draft?</span>
            <button type="button" className="wd-btn" onClick={() => void redraft()}>
              Replace
            </button>
            <button type="button" className="wd-btn quiet" onClick={() => setConfirmRedraft(false)}>
              Keep mine
            </button>
          </>
        ) : (
          <button
            type="button"
            className="wd-btn"
            disabled={draft.loading}
            onClick={() => (dirty ? setConfirmRedraft(true) : void redraft())}
          >
            {draft.loading ? "The agent is drafting…" : "Ask the agent to redraft"}
          </button>
        )}
        <span className="wd-small wd-muted" role="status">
          {short ? "Write at least 50 characters" : dirty ? "Not saved yet" : "Saved"}
        </span>
      </div>
    </form>
  );
}

interface JdBasePayload {
  jdBase?: {
    weights?: Record<string, number> | null;
    approvedBy?: string | null;
    roleTitle?: string | null;
    scoreFloor?: number | null;
    idealCandidateProfile?: Partial<IdealCandidateProfile> | null;
  } | null;
}

/**
 * The rubric: the agent proposes what to score and how much each part
 * matters; you nudge the weights until they add up to 100, then approve.
 * Must-haves stay editable through the detailed setup underneath.
 */
export function RubricPanel({ jobId, job, onDone, onLog }: PanelProps) {
  const base = useApiQuery<JdBasePayload>("/api/fitscore/jd-base", { jobId });
  const build = useApiMutation<{ jobId: string }, unknown>("/api/fitscore/jd-base", "POST");
  const put = useApiMutation<{ jobId: string; weights: Record<string, number> }, unknown>(
    "/api/fitscore/jd-base",
    "PUT",
  );
  const approve = useApiMutation<{ jobId: string }, { message?: string }>(
    "/api/fitscore/jd-base/approve",
    "POST",
  );
  const [details, setDetails] = useState(false);

  const doc = base.data?.jdBase ?? null;
  const original = useMemo(() => toDisplayWeights(doc?.weights ?? {}), [doc?.weights]);
  // Edits belong to the version of the weights they were made against; a refetch resets them.
  const [edit, setEdit] = useState<{ from: unknown; values: Record<string, number> } | null>(null);
  const shown = edit && edit.from === doc?.weights ? edit.values : original.values;
  const setWeights = (values: Record<string, number>) => setEdit({ from: doc?.weights, values });
  const keys = Object.keys(shown);
  const total = weightTotal(shown);
  const dirty = keys.some((k) => shown[k] !== original.values[k]);
  const approved = Boolean(doc?.approvedBy);
  const mustHaves = (doc?.idealCandidateProfile?.must_haves ?? []).filter(Boolean);

  const nudge = (k: string, d: number) =>
    setWeights({ ...shown, [k]: Math.max(0, Math.min(60, (shown[k] ?? 0) + d)) });

  async function saveAndApprove() {
    if (dirty) {
      const ok = await put.mutate({ jobId, weights: fromDisplayWeights(shown, original.scale) });
      if (!ok) return;
      onLog("you", "Changed the rubric weights");
    }
    if (!approved) {
      const ok = await approve.mutate({ jobId });
      if (!ok) return;
      onLog("you", "Approved the rubric");
      onLog("auto", "Queued rescoring of existing applicants");
    }
    await base.refetch({ silent: true });
    onDone(approved ? "Rubric updated" : "Rubric approved");
  }

  if (base.loading && !base.data) return <p className="wd-muted">Loading the rubric…</p>;

  if (!doc) {
    return (
      <div className="wd-stack" style={{ gap: 24 }}>
        <p className="wd-lede">
          The agent reads the job description and proposes what to score and how much each part
          matters. You check it before anyone is scored.
        </p>
        {build.error && <Problem>{build.error}</Problem>}
        <div className="wd-row-actions">
          <button
            type="button"
            className="wd-btn go"
            disabled={build.loading}
            onClick={async () => {
              const ok = await build.mutate({ jobId });
              if (ok) {
                onLog("agent", "Built a rubric from the job description");
                await base.refetch({ silent: true });
              }
            }}
          >
            {build.loading ? "The agent is building it…" : "Build the rubric"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wd-stack" style={{ gap: 32 }}>
      <div className="wd-split">
        <div className="wd-stack" style={{ gap: 0 }}>
          <p className="wd-muted" style={{ margin: "0 0 14px" }}>
            Every CV is scored on each line. The weights decide what matters most.
          </p>
          <div className="wd-lines">
            {keys.map((k) => (
              <div
                key={k}
                className="wd-line"
                style={{ gridTemplateColumns: "minmax(0,1fr) minmax(200px,240px)" }}
              >
                <div className="wd-line-value">{rubricLabel(k)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    type="button"
                    className="wd-circ"
                    aria-label={`Lower ${rubricLabel(k)}`}
                    onClick={() => nudge(k, -5)}
                    disabled={shown[k] <= 0}
                  >
                    −
                  </button>
                  <span className="wd-bar">
                    <span style={{ width: `${Math.min(100, (shown[k] / 60) * 100)}%` }} />
                  </span>
                  <button
                    type="button"
                    className="wd-circ"
                    aria-label={`Raise ${rubricLabel(k)}`}
                    onClick={() => nudge(k, 5)}
                    disabled={shown[k] >= 60}
                  >
                    +
                  </button>
                  <span
                    style={{
                      width: 30,
                      textAlign: "right",
                      fontSize: 15,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {shown[k]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="wd-panel">
          <span className="wd-sig agent">What the agent checks for</span>
          {mustHaves.length ? (
            <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none" }}>
              {mustHaves.map((m) => (
                <li
                  key={m}
                  style={{
                    padding: "10px 0",
                    borderTop: "1px solid var(--wd-hair)",
                    fontSize: 15,
                    lineHeight: 1.45,
                  }}
                >
                  {m}
                </li>
              ))}
            </ul>
          ) : (
            <p className="wd-small wd-muted">No must-haves yet. Add them to score fairly.</p>
          )}
          <button
            type="button"
            className="wd-btn quiet"
            style={{ marginTop: 10 }}
            onClick={() => setDetails((d) => !d)}
            aria-expanded={details}
          >
            {details ? "Close the editor" : "Edit the ideal candidate"}
          </button>
        </div>
      </div>

      {(put.error || approve.error) && <Problem>{put.error ?? approve.error}</Problem>}
      <div className="wd-row-actions">
        <button
          type="button"
          className="wd-btn go"
          disabled={total !== 100 || put.loading || approve.loading || (approved && !dirty)}
          onClick={() => void saveAndApprove()}
        >
          {put.loading || approve.loading
            ? "Saving…"
            : approved
              ? dirty
                ? "Save the new weights"
                : "Approved"
              : "Approve the rubric"}
        </button>
        {dirty && (
          <button
            type="button"
            className="wd-btn quiet"
            onClick={() => setWeights(original.values)}
          >
            Undo changes
          </button>
        )}
        <span
          className="wd-small"
          style={{ color: total === 100 ? "var(--wd-muted)" : "var(--wd-amber)" }}
        >
          {total === 100 ? "Weights add up to 100" : `Weights add up to ${total}. Make it 100.`}
        </span>
      </div>

      {details && (
        <div className="wd-panel">
          <MustHavesEditor
            jobId={jobId}
            profile={doc.idealCandidateProfile ?? null}
            roleTitle={doc.roleTitle ?? job.title ?? ""}
            onLog={onLog}
            onCancel={() => setDetails(false)}
            onSaved={() => {
              void base.refetch({ silent: true });
              setDetails(false);
            }}
          />
        </div>
      )}

      <ShortlistBar
        jobId={jobId}
        floor={doc.scoreFloor ?? 0}
        onLog={onLog}
        onSaved={() => void base.refetch({ silent: true })}
      />
    </div>
  );
}

/** Where the job goes, and the questions automation asks. One button to go live. */
export function PublishPanel({ jobId, job, facts, onDone, onLog }: PanelProps) {
  const [careers, setCareers] = useState(job.list_on_public_job_board ?? true);
  const [referrals, setReferrals] = useState(job.list_for_internal_referrals ?? true);
  const patch = useApiMutation<
    { status?: "open"; listOnPublicJobBoard?: boolean; listForInternalReferrals?: boolean },
    { job: WorkJob }
  >(`/api/jobs/${jobId}`, "PATCH");
  const live = facts.roleOpen;

  async function setChannel(which: "careers" | "referrals", on: boolean) {
    const next = { careers, referrals, [which]: on };
    if (!next.careers && !next.referrals) return; // the backend needs at least one
    if (which === "careers") setCareers(on);
    else setReferrals(on);
    if (live) {
      const ok = await patch.mutate({
        listOnPublicJobBoard: next.careers,
        listForInternalReferrals: next.referrals,
      });
      if (ok)
        onLog(
          "you",
          `${on ? "Turned on" : "Turned off"} ${which === "careers" ? "the careers page" : "employee referrals"}`,
        );
    }
  }

  const channels: { key: "careers" | "referrals"; name: string; note: string; on: boolean }[] = [
    { key: "careers", name: "Careers page", note: "Anyone can find and apply", on: careers },
    {
      key: "referrals",
      name: "Employee referrals",
      note: "Your team can refer people",
      on: referrals,
    },
  ];

  return (
    <div className="wd-stack" style={{ gap: 32 }}>
      <div className="wd-split" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <div className="wd-lines">
          {channels.map((c) => (
            <div
              key={c.key}
              className="wd-line"
              style={{ gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center" }}
            >
              <div>
                <div className="wd-line-value">{c.name}</div>
                <div className="wd-src">{c.note}</div>
              </div>
              <button
                type="button"
                className="wd-toggle"
                aria-pressed={c.on}
                aria-label={c.name}
                disabled={patch.loading || (c.on && channels.filter((x) => x.on).length === 1)}
                onClick={() => void setChannel(c.key, !c.on)}
              />
            </div>
          ))}
          <div
            className="wd-line"
            style={{ gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center" }}
          >
            <div>
              <div className="wd-line-value wd-muted">LinkedIn and job boards</div>
              <div className="wd-src">Connect them once in Setup</div>
            </div>
            <Link href="/work/setup#channels" className="wd-btn quiet">
              Setup
            </Link>
          </div>
        </div>
        <div className="wd-panel">
          <span className="wd-sig auto">Automation asks on WhatsApp</span>
          <div style={{ marginTop: 16 }}>
            <ScreeningEditor jobId={jobId} onLog={onLog} />
          </div>
        </div>
      </div>

      {patch.error && <Problem>{patch.error}</Problem>}
      {!live && (
        <div className="wd-row-actions">
          <button
            type="button"
            className="wd-btn go"
            disabled={patch.loading}
            onClick={async () => {
              const ok = await patch.mutate({
                status: "open",
                listOnPublicJobBoard: careers,
                listForInternalReferrals: referrals,
              });
              if (ok) {
                onLog("you", "Published the job");
                onLog("auto", "Started collecting applications");
                onDone("Job is live");
              }
            }}
          >
            {patch.loading ? "Going live…" : "Go live"}
          </button>
        </div>
      )}
      {live && facts.publicApplications && (
        <div className="wd-row-actions">
          <a className="wd-btn" href={`/j/${jobId}`} target="_blank" rel="noreferrer">
            View the public job page
          </a>
        </div>
      )}
    </div>
  );
}

export function ApplicationsPanel({ jobId, job, facts, onLog }: PanelProps) {
  return (
    <div className="wd-stack" style={{ gap: 24 }}>
      <Numbers
        items={[
          ["Applications", facts.applicants],
          ["Shortlisted", facts.shortlisted],
          ["Hired", facts.hired],
        ]}
      />
      <p className="wd-lede">
        {facts.applicants
          ? "Applications arrive from every channel and go straight to scoring. Nothing to do unless you want to add someone yourself."
          : "Live and collecting. When applications arrive, the agent scores them and the ones that need you come back here."}
      </p>
      <AddCandidates
        jobId={jobId}
        title={job.title ?? "This job"}
        status={job.status ?? undefined}
        onAdded={() => onLog("you", "Added candidates")}
      />
    </div>
  );
}

export function ScoringPanel({ facts, goTo }: PanelProps) {
  const blocked = !facts.rubricApproved && !facts.rubricNotRequired && facts.applicants > 0;
  return (
    <div className="wd-stack" style={{ gap: 24 }}>
      <Numbers
        items={[
          ["Scored", Math.max(0, facts.applicants - facts.unscored)],
          ["Being scored", facts.unscored],
          ["Waiting for you", facts.awaitingReview],
        ]}
      />
      {blocked ? (
        <div className="wd-panel bad">
          <span className="wd-sig bad">Stuck</span>
          <p className="wd-lede" style={{ marginTop: 10 }}>
            These applicants were scored without a role rubric, so their scores are generic. Approve
            the rubric and they are rescored automatically.
          </p>
        </div>
      ) : (
        <p className="wd-lede">
          The agent scores every application against your rubric and quotes the CV for each line.
          Automation checks each quote really appears in the CV before you see it.
        </p>
      )}
      <div className="wd-row-actions">
        {blocked ? (
          <button type="button" className="wd-btn go" onClick={() => goTo("rubric")}>
            Fix the rubric
          </button>
        ) : (
          facts.awaitingReview > 0 && (
            <button type="button" className="wd-btn go" onClick={() => goTo("review")}>
              Review {facts.awaitingReview} now
            </button>
          )
        )}
      </div>
    </div>
  );
}

export function ReviewPanel(props: PanelProps) {
  return <ReviewBlock {...props} />;
}
export function InterviewsPanel(props: PanelProps) {
  return <InterviewsBlock {...props} />;
}
/** Offers are parked for now: say so plainly instead of showing the old screen. */
export function OfferPanel() {
  return (
    <div className="wd-stack" style={{ gap: 12 }}>
      <p className="wd-lede">Offers aren&apos;t in the new view yet.</p>
      <p className="wd-muted" style={{ margin: 0 }}>
        Interviews and decisions above are where this job needs you for now.
      </p>
    </div>
  );
}
