"use client";

import Link from "next/link";
import { ApprovalTimeline } from "@/components/work/editors";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { invalidateQueries, useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import {
  missingForRequest,
  requestBody,
  understoodFromDraft,
  type DraftMetadata,
  type DraftSection,
  type Understood,
} from "@/lib/work/new-job";

type Step = "note" | "understood";

const STEPS: { key: Step | "sent"; label: string }[] = [
  { key: "note", label: "The note" },
  { key: "understood", label: "Understood" },
  { key: "sent", label: "Approval" },
];

function Steps({ at }: { at: Step | "sent" }) {
  const i = STEPS.findIndex((s) => s.key === at);
  return (
    <nav className="wd-steps" aria-label="New job steps">
      <ol>
        {STEPS.map((s, n) => (
          <li key={s.key}>
            <span
              className={`wd-step ${n < i ? "done" : ""} ${n === i ? "here" : ""}`}
              aria-current={n === i ? "step" : undefined}
            >
              {s.label}
            </span>
          </li>
        ))}
        <li>
          <span className="wd-step">Rubric and channels, once approved</span>
        </li>
      </ol>
      <div className="wd-progress" aria-hidden="true">
        <span style={{ width: `${Math.round(((i + 1) / 5) * 100)}%` }} />
      </div>
    </nav>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  multiline,
  hint,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  hint?: string;
  inputMode?: "decimal";
}) {
  return (
    <div className="wd-line" style={{ gridTemplateColumns: "160px minmax(0,1fr)" }}>
      <label htmlFor={id} className="wd-line-label">
        {label}
      </label>
      <div style={{ minWidth: 0 }}>
        {multiline ? (
          <textarea
            id={id}
            className="wd-textarea"
            style={{ minHeight: 120, fontSize: 15, fontWeight: 400 }}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            id={id}
            className="wd-input"
            style={{ fontSize: 19, fontWeight: 400 }}
            value={value}
            inputMode={inputMode}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        {hint && <div className="wd-src">{hint}</div>}
      </div>
    </div>
  );
}

/** What happens after the request is sent: wait for approval, then open the job. */
function Waiting({ requestId }: { requestId: string }) {
  const q = useApiQuery<{
    request: { id: string; title: string; status: string; assigned_job_id?: string | null };
  }>(`/api/hiring-requests/${requestId}`);
  const r = q.data?.request;
  const approved = r && ["approved", "converted"].includes(r.status);
  const jobId = r?.assigned_job_id;

  return (
    <>
      <Steps at="sent" />
      <div className="wd-page">
        <header className="wd-stack" style={{ gap: 18 }}>
          <span className={`wd-sig ${jobId ? "you" : approved ? "agent" : "auto"}`}>
            {jobId ? "Ready for you" : approved ? "Agent" : "Waiting on the approver"}
          </span>
          <h1 className="wd-h1" style={{ maxWidth: "18ch" }}>
            {!r
              ? "Checking the request…"
              : jobId
                ? `${r.title} is ready to set up.`
                : approved
                  ? `${r.title} is approved. The job is being created.`
                  : `${r.title} is with the approver.`}
          </h1>
          <p className="wd-lede">
            {jobId
              ? "Next: check the rubric the agent proposes, choose where the job goes, and go live."
              : approved
                ? "This usually takes under a minute. It appears in your queue the moment it's ready."
                : "They get it by email and WhatsApp. When they approve, the job is created and comes back to you here."}
          </p>
        </header>
        <ApprovalTimeline requestId={requestId} />
        <div className="wd-row-actions">
          {jobId ? (
            <Link href={`/work/jobs/${jobId}`} className="wd-btn go" autoFocus>
              Set up the job
            </Link>
          ) : (
            <button
              type="button"
              className="wd-btn"
              onClick={() => void q.refetch({ silent: true })}
            >
              Check again
            </button>
          )}
          <Link href="/work" className="wd-btn quiet">
            Back to your work
          </Link>
        </div>
      </div>
    </>
  );
}

function NewJobBody() {
  const search = useSearchParams();
  const router = useRouter();
  const requestId = search.get("request");
  const [step, setStep] = useState<Step>("note");
  const [note, setNote] = useState("");
  const [u, setU] = useState<Understood | null>(null);
  const [showFull, setShowFull] = useState(false);
  const draft = useApiMutation<
    { prompt: string },
    { rawText?: string; metadata?: DraftMetadata; sections?: DraftSection[] }
  >("/api/jobs/generate-jd", "POST");
  const send = useApiMutation<ReturnType<typeof requestBody>, { request?: { id: string } }>(
    "/api/hiring-requests",
    "POST",
  );

  if (requestId) return <Waiting requestId={requestId} />;

  async function understand() {
    const res = await draft.mutate({ prompt: note.trim().slice(0, 15_000) });
    if (!res) return;
    setU(understoodFromDraft(res.rawText ?? "", res.metadata ?? {}, res.sections ?? []));
    setStep("understood");
    window.scrollTo({ top: 0 });
  }

  async function submit() {
    if (!u) return;
    const res = await send.mutate(requestBody(u, note));
    const id = res?.request?.id;
    if (!id) return;
    invalidateQueries("/api/hiring-requests");
    router.replace(`/work/new?request=${id}`);
  }

  if (step === "note" || !u) {
    const tooShort = note.trim().length < 10;
    return (
      <>
        <Steps at="note" />
        <div className="wd-page">
          <header className="wd-stack" style={{ gap: 18 }}>
            <span className="wd-sig you">You</span>
            <h1 className="wd-h1">Tell us about the role.</h1>
          </header>
          <form
            className="wd-stack"
            style={{ gap: 24 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!tooShort) void understand();
            }}
          >
            <label htmlFor="wd-note" className="wd-lede">
              Paste the hiring manager&apos;s message, an old job description, or a few lines of
              your own. No form to fill.
            </label>
            <textarea
              id="wd-note"
              className="wd-textarea"
              style={{ minHeight: 220 }}
              value={note}
              autoFocus
              placeholder="Need a backend engineer, Go mostly, payments experience is a must. 5 to 8 years. Bengaluru, three days in office. Budget around 40 to 45 lakhs."
              onChange={(e) => setNote(e.target.value)}
            />
            {draft.error && (
              <p role="alert" className="wd-problem">
                {draft.error}
              </p>
            )}
            <div className="wd-row-actions">
              <button type="submit" className="wd-btn go" disabled={tooShort || draft.loading}>
                {draft.loading ? "The agent is reading it…" : "Draft it"}
              </button>
              <span className="wd-small wd-muted">
                {draft.loading ? "About 20 seconds" : "The agent drafts. You check everything."}
              </span>
            </div>
          </form>
        </div>
      </>
    );
  }

  const set = (k: keyof Understood) => (v: string) => setU({ ...u, [k]: v });
  const missing = missingForRequest(u);

  return (
    <>
      <Steps at="understood" />
      <div className="wd-page">
        <header className="wd-stack" style={{ gap: 18 }}>
          <span className="wd-sig agent">The agent&apos;s reading. Check it.</span>
          <h1 className="wd-h1">Here is what I understood.</h1>
        </header>

        <div className="wd-split">
          <div className="wd-lines">
            <Field id="t" label="Title" value={u.title} onChange={set("title")} />
            <Field
              id="x"
              label="Experience"
              value={u.experience}
              onChange={set("experience")}
              hint="For example: 5 to 8 years"
            />
            <Field id="l" label="Where" value={u.location} onChange={set("location")} />
            <div className="wd-line" style={{ gridTemplateColumns: "160px minmax(0,1fr)" }}>
              <span className="wd-line-label">Pay, in lakhs a year</span>
              <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
                <input
                  aria-label="Lowest pay in lakhs"
                  className="wd-input"
                  style={{ fontSize: 19, fontWeight: 400, maxWidth: 120 }}
                  inputMode="decimal"
                  value={u.payMinLpa}
                  onChange={(e) => setU({ ...u, payMinLpa: e.target.value })}
                />
                <span className="wd-muted">to</span>
                <input
                  aria-label="Highest pay in lakhs"
                  className="wd-input"
                  style={{ fontSize: 19, fontWeight: 400, maxWidth: 120 }}
                  inputMode="decimal"
                  value={u.payMaxLpa}
                  onChange={(e) => setU({ ...u, payMaxLpa: e.target.value })}
                />
              </div>
            </div>
            <Field
              id="m"
              label="Must-haves"
              value={u.mustHaves}
              onChange={set("mustHaves")}
              multiline
              hint="One per line. The rubric is built from these."
            />
            <Field
              id="n"
              label="Nice to have"
              value={u.niceToHaves}
              onChange={set("niceToHaves")}
              multiline
            />
          </div>

          <aside className="wd-panel agent" aria-label="The agent's job description draft">
            <span className="wd-sig agent">Job description draft</span>
            {showFull ? (
              <textarea
                aria-label="Job description"
                className="wd-textarea"
                style={{ minHeight: 360, fontSize: 14.5, fontWeight: 400, marginTop: 14 }}
                value={u.description}
                onChange={(e) => setU({ ...u, description: e.target.value })}
              />
            ) : (
              <p
                style={{
                  margin: "14px 0 0",
                  fontSize: 14.5,
                  lineHeight: 1.65,
                  color: "var(--wd-soft)",
                  whiteSpace: "pre-line",
                  maxHeight: 360,
                  overflow: "hidden",
                }}
              >
                {u.description || "No description came back. You can write one later."}
              </p>
            )}
            <button
              type="button"
              className="wd-btn quiet"
              style={{ marginTop: 8 }}
              onClick={() => setShowFull((v) => !v)}
            >
              {showFull ? "Done editing" : "Read and edit all of it"}
            </button>
          </aside>
        </div>

        {send.error && (
          <p role="alert" className="wd-problem">
            {send.error}
          </p>
        )}
        <div className="wd-row-actions">
          <button
            type="button"
            className="wd-btn go"
            disabled={missing.length > 0 || send.loading}
            onClick={() => void submit()}
          >
            {send.loading ? "Sending…" : "Send for approval"}
          </button>
          <button type="button" className="wd-btn" onClick={() => setStep("note")}>
            Back to the note
          </button>
          <span
            className="wd-small"
            style={{ color: missing.length ? "var(--wd-amber)" : "var(--wd-muted)" }}
          >
            {missing.length
              ? `Add ${missing.join(" and ")} first.`
              : "Your approval workflow decides who signs off."}
          </span>
        </div>
      </div>
    </>
  );
}

/**
 * A new job starts as a few lines in anyone's words. The agent reads them,
 * you check its reading, and the request goes to your approver. Once
 * approved, the job opens in your queue for the rubric and channels.
 */
export default function NewJobPage() {
  return (
    <Suspense fallback={null}>
      <NewJobBody />
    </Suspense>
  );
}
