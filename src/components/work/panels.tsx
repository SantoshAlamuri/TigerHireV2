"use client";

import Link from "next/link";
import { useState } from "react";
import { useApiMutation } from "@/lib/hooks/use-api";
import { JdBaseSetupStep } from "@/app/(dashboard)/recruit/jobs/[id]/components/JdBaseSetupStep";
import RecruitV2ReviewPage from "@/app/(dashboard)/recruit/v2/jobs/[id]/review/page";
import RecruitV2InterviewsPage from "@/app/(dashboard)/recruit/v2/jobs/[id]/interviews/page";
import RecruitV2OffersPage from "@/app/(dashboard)/recruit/v2/jobs/[id]/offers/page";
import type { JourneyFacts } from "@/lib/work/journey";
import type { WorkJob } from "@/lib/work/use-job-journey";

/** What every stage panel receives. `onDone` tells the job to move you on. */
export interface PanelProps {
  jobId: string;
  job: WorkJob;
  facts: JourneyFacts;
  orgSlug?: string;
  onDone: (what: string) => void;
  onLog: (actor: "agent" | "auto" | "you", what: string) => void;
  goTo: (key: "rubric" | "review" | "publish") => void;
}

function Stats({ items }: { items: [string, number | string][] }) {
  return (
    <div className="wd-stats">
      {items.map(([label, value]) => (
        <div className="wd-stat" key={label}>
          <b>{value}</b>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="wd-now blocked" style={{ margin: 0 }}>
      {children}
    </p>
  );
}

export function RequestPanel({ facts }: PanelProps) {
  return (
    <div className="wd-stack">
      <p style={{ margin: 0 }}>
        This job came from a hiring request. Its status is{" "}
        <b>{facts.hiringRequestStatus ?? "unknown"}</b>.
      </p>
      {facts.hiringRequestId && (
        <div className="wd-row">
          <Link className="wd-btn go" href={`/recruit/hiring-requests/${facts.hiringRequestId}`}>
            Open the request
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * The description: the agent drafts, you edit, you save. Nothing is saved
 * until you say so, and the agent's redraft never overwrites unsaved edits
 * without asking.
 */
export function DescriptionPanel({ jobId, job, onDone, onLog }: PanelProps) {
  const [text, setText] = useState(job.description ?? "");
  const [dirty, setDirty] = useState(false);
  const [confirmRedraft, setConfirmRedraft] = useState(false);
  const save = useApiMutation<{ description: string }, { job: WorkJob }>(
    `/api/jobs/${jobId}`,
    "PATCH",
  );
  const draft = useApiMutation<{ prompt: string; mustInclude?: string[] }, { rawText?: string }>(
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
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="wd-field">
        <label htmlFor="wd-jd">Job description</label>
        <span className="wd-small wd-muted">
          Edit anything. Candidates see this, and the agent builds the rubric from it.
        </span>
        <textarea
          id="wd-jd"
          className="wd-textarea"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDirty(true);
          }}
        />
      </div>
      {(save.error || draft.error) && <Problem>{save.error ?? draft.error}</Problem>}
      <div className="wd-row">
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
            <span className="wd-who agent">Agent</span>
            {draft.loading ? "Drafting…" : "Redraft"}
          </button>
        )}
        <span className="wd-small wd-muted" role="status">
          {short ? "Write at least 50 characters" : dirty ? "Not saved yet" : "Saved"}
        </span>
      </div>
    </form>
  );
}

/** The rubric: the agent proposes must-haves and weights, you adjust and approve. */
export function RubricPanel({ jobId, facts, onDone, onLog }: PanelProps) {
  const [step, setStep] = useState<1 | 2>(facts.mustHaveCount > 0 ? 2 : 1);
  return (
    <div className="wd-stack wd-embed">
      <div className="wd-row wd-small wd-muted">
        <span className={`wd-who ${step === 1 ? "you" : "agent"}`}>
          {step === 1 ? "Step 1 of 2: must-haves" : "Step 2 of 2: approve scoring"}
        </span>
        {step === 2 && (
          <button type="button" className="wd-btn quiet" onClick={() => setStep(1)}>
            Back to must-haves
          </button>
        )}
      </div>
      <JdBaseSetupStep
        key={step}
        jobId={jobId}
        guidedStep={step}
        onRequirementsSaved={() => {
          onLog("you", "Saved the must-haves");
          setStep(2);
        }}
        onGuidedApproved={() => {
          onLog("you", "Approved the rubric");
          onDone("Rubric approved");
        }}
      />
    </div>
  );
}

/** Publish: automation posts it, you press the one button. */
export function PublishPanel({ jobId, job, facts, onDone, onLog }: PanelProps) {
  const [publicBoard, setPublicBoard] = useState(job.list_on_public_job_board ?? true);
  const publish = useApiMutation<
    { status: "open"; listOnPublicJobBoard: boolean },
    { job: WorkJob }
  >(`/api/jobs/${jobId}`, "PATCH");
  if (facts.roleOpen) {
    return (
      <div className="wd-stack">
        <p style={{ margin: 0 }}>
          This job is live
          {facts.publicApplications ? " on your careers page" : " for internal applications"}.
          Automation collects applications and asks {facts.screeningQuestionCount}{" "}
          {facts.screeningQuestionCount === 1 ? "screening question" : "screening questions"}.
        </p>
        <div className="wd-row">
          {facts.publicApplications && (
            <a className="wd-btn" href={`/j/${jobId}`} target="_blank" rel="noreferrer">
              View the public job page
            </a>
          )}
          <Link className="wd-btn quiet" href={`/recruit/jobs/${jobId}/screening`}>
            Edit screening questions
          </Link>
        </div>
      </div>
    );
  }
  return (
    <form
      className="wd-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await publish.mutate({ status: "open", listOnPublicJobBoard: publicBoard });
        if (res) {
          onLog("you", "Published the job");
          onLog(
            "auto",
            publicBoard ? "Posted to your careers page" : "Opened for internal applications",
          );
          onDone("Job published");
        }
      }}
    >
      <p style={{ margin: 0 }}>
        Description and rubric are ready. Once you publish, automation collects applications and the
        agent scores each one against your rubric.
      </p>
      <Stats
        items={[
          ["Must-haves the agent scores against", facts.mustHaveCount || "—"],
          ["Screening questions on the form", facts.screeningQuestionCount],
        ]}
      />
      <label className="wd-row" style={{ gap: 10, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={publicBoard}
          onChange={(e) => setPublicBoard(e.target.checked)}
          style={{ width: 20, height: 20, accentColor: "var(--wd-you)" }}
        />
        <span>List it on your public careers page</span>
      </label>
      {publish.error && <Problem>{publish.error}</Problem>}
      <div className="wd-row">
        <button type="submit" className="wd-btn go" disabled={publish.loading}>
          {publish.loading ? "Publishing…" : "Publish job"}
        </button>
        <Link className="wd-btn quiet" href={`/recruit/jobs/${jobId}/screening`}>
          Add screening questions first
        </Link>
      </div>
    </form>
  );
}

export function ApplicationsPanel({ jobId, facts }: PanelProps) {
  return (
    <div className="wd-stack">
      <p style={{ margin: 0 }}>
        {facts.applicants
          ? "Applications arrive here from every channel and go straight to scoring. Nothing to do unless you want to add candidates yourself."
          : "Live and collecting. When applications arrive, the agent scores them and we bring the ones that need you to your review."}
      </p>
      <Stats
        items={[
          ["Applications", facts.applicants],
          ["Shortlisted", facts.shortlisted],
          ["Hired", facts.hired],
        ]}
      />
      <div className="wd-row">
        <Link className="wd-btn" href={`/recruit/v2/jobs/${jobId}/add`}>
          Add candidates
        </Link>
      </div>
    </div>
  );
}

export function ScoringPanel({ facts, goTo }: PanelProps) {
  const blocked = !facts.rubricApproved && !facts.rubricNotRequired && facts.applicants > 0;
  return (
    <div className="wd-stack">
      {blocked ? (
        <>
          <Problem>
            {facts.applicants} {facts.applicants === 1 ? "applicant was" : "applicants were"} scored
            without a role rubric, so their scores are generic. Approve the rubric and they are
            rescored.
          </Problem>
          <div className="wd-row">
            <button type="button" className="wd-btn go" onClick={() => goTo("rubric")}>
              Fix the rubric
            </button>
          </div>
        </>
      ) : (
        <p style={{ margin: 0 }}>
          The agent scores every application against your rubric and quotes the CV for each
          criterion. Automation checks each quote really appears in the CV before you see it.
        </p>
      )}
      <Stats
        items={[
          ["Scored", Math.max(0, facts.applicants - facts.unscored)],
          ["Being scored", facts.unscored],
          ["Waiting for you", facts.awaitingReview],
        ]}
      />
      {facts.awaitingReview > 0 && !blocked && (
        <div className="wd-row">
          <button type="button" className="wd-btn go" onClick={() => goTo("review")}>
            Review {facts.awaitingReview} now
          </button>
        </div>
      )}
    </div>
  );
}

/** Review, interviews and offers reuse the classic screens inside the new frame for now. */
export function ReviewPanel() {
  return (
    <div className="wd-embed">
      <RecruitV2ReviewPage />
    </div>
  );
}
export function InterviewsPanel() {
  return (
    <div className="wd-embed">
      <RecruitV2InterviewsPage />
    </div>
  );
}
export function OfferPanel() {
  return (
    <div className="wd-embed">
      <RecruitV2OffersPage />
    </div>
  );
}
