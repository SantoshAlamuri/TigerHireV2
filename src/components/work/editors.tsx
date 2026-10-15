"use client";

import { useState } from "react";
import { useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import { nudgeFloor, questionsFromText } from "@/lib/work/icp";
import { DEFAULT_FIT_THRESHOLDS } from "@/lib/fitscore/hybrid/constants";
import { detectJdBaseMismatches } from "@/lib/fitscore/jd-base-approval/mismatch-detection";
import type { IdealCandidateProfile } from "@/lib/fitscore/hybrid/ideal-profile";
import { CompanyBulkUploadModal } from "@/app/(dashboard)/recruit/candidates/components/CompanyBulkUploadModal";

type Log = (actor: "agent" | "auto" | "you", what: string) => void;

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="wd-stack" style={{ gap: 6 }}>
      <span className="wd-small" style={{ color: "var(--wd-soft)" }}>
        {label}
      </span>
      {children}
      {hint && <span className="wd-src">{hint}</span>}
    </label>
  );
}

/** The score a candidate needs before they come to you for review. */
export function ShortlistBar({
  jobId,
  floor,
  onSaved,
  onLog,
}: {
  jobId: string;
  floor: number;
  onSaved: () => void;
  onLog: Log;
}) {
  const [edit, setEdit] = useState<{ from: number; value: number } | null>(null);
  const value = edit && edit.from === floor ? edit.value : floor;
  const put = useApiMutation<{ jobId: string; scoreFloor: number }, unknown>(
    "/api/fitscore/jd-base",
    "PUT",
  );
  const changed = value !== floor;

  return (
    <div className="wd-stack" style={{ gap: 12 }}>
      <div
        className="wd-line"
        style={{ gridTemplateColumns: "minmax(0,1fr) minmax(200px,240px)", alignItems: "center" }}
      >
        <div>
          <div className="wd-line-value">Shortlist bar</div>
          <div className="wd-src">
            Below this score, the agent holds people back from your review
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            className="wd-circ"
            aria-label="Lower the shortlist bar"
            disabled={value <= 0}
            onClick={() => setEdit({ from: floor, value: nudgeFloor(value, -5) })}
          >
            −
          </button>
          <span className="wd-bar">
            <span style={{ width: `${value}%` }} />
          </span>
          <button
            type="button"
            className="wd-circ"
            aria-label="Raise the shortlist bar"
            disabled={value >= 95}
            onClick={() => setEdit({ from: floor, value: nudgeFloor(value, 5) })}
          >
            +
          </button>
          <span style={{ width: 30, textAlign: "right", fontSize: 15 }}>{value}</span>
        </div>
      </div>
      {put.error && (
        <p role="alert" className="wd-problem">
          {put.error}
        </p>
      )}
      {changed && (
        <div className="wd-row-actions">
          <button
            type="button"
            className="wd-btn"
            disabled={put.loading}
            onClick={async () => {
              const ok = await put.mutate({ jobId, scoreFloor: value });
              if (ok) {
                onLog("you", `Set the shortlist bar to ${value}`);
                setEdit(null);
                onSaved();
              }
            }}
          >
            {put.loading ? "Saving…" : `Save bar at ${value}`}
          </button>
          <button type="button" className="wd-btn quiet" onClick={() => setEdit(null)}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

interface ScreeningSetup {
  whatsappEnabled: boolean;
  jdBaseReady: boolean;
  mustHaves: string[];
  applyQuestions: { id: string; questionText: string }[];
  postShortlistQuestions: { id: string; questionText: string }[];
}

const STAGES = {
  apply: {
    title: "When someone applies",
    note: "Yes or no questions. A wrong answer can rule someone out.",
    max: 5,
  },
  post_shortlist: {
    title: "After you shortlist",
    note: "For context only. Answers never rule anyone out.",
    max: 10,
  },
} as const;

/** The questions automation asks, edited in place, both stages. */
export function ScreeningEditor({ jobId, onLog }: { jobId: string; onLog: Log }) {
  const q = useApiQuery<ScreeningSetup>(`/api/jobs/${jobId}/whatsapp-screening`);
  const put = useApiMutation<
    { stage: "apply" | "post_shortlist"; questions: string[] },
    ScreeningSetup
  >(`/api/jobs/${jobId}/whatsapp-screening`, "PUT");
  const [editing, setEditing] = useState<{ stage: keyof typeof STAGES; text: string } | null>(null);

  if (q.loading && !q.data) return <p className="wd-muted">Loading questions…</p>;
  if (q.error) return <p className="wd-problem">Questions could not be loaded: {q.error}</p>;
  const data = q.data;
  if (!data) return null;

  const list = (stage: keyof typeof STAGES) =>
    stage === "apply" ? data.applyQuestions : data.postShortlistQuestions;

  if (!data.whatsappEnabled) {
    return (
      <p className="wd-small wd-muted" style={{ margin: 0 }}>
        Screening questions are sent on WhatsApp, which is off for your team. Turn it on in Setup,
        under Scoring and screening.
      </p>
    );
  }

  return (
    <div className="wd-stack" style={{ gap: 28 }}>
      {(Object.keys(STAGES) as (keyof typeof STAGES)[]).map((stage) => {
        const meta = STAGES[stage];
        const items = list(stage);
        const isEditing = editing?.stage === stage;
        const parsed = isEditing ? questionsFromText(editing.text, meta.max) : null;
        return (
          <div key={stage} className="wd-stack" style={{ gap: 8 }}>
            <div className="wd-line-value">{meta.title}</div>
            <div className="wd-src">{meta.note}</div>
            {isEditing ? (
              <>
                <textarea
                  className="wd-textarea"
                  rows={Math.max(3, items.length + 1)}
                  value={editing.text}
                  aria-label={`${meta.title}: one question per line`}
                  onChange={(e) => setEditing({ stage, text: e.target.value })}
                />
                {!items.length && data.mustHaves.length > 0 && !editing.text && (
                  <button
                    type="button"
                    className="wd-btn quiet"
                    onClick={() =>
                      setEditing({
                        stage,
                        text: data.mustHaves
                          .slice(0, meta.max)
                          .map((m) => `Do you have ${m.replace(/\.$/, "").toLowerCase()}?`)
                          .join("\n"),
                      })
                    }
                  >
                    Start from the must-haves
                  </button>
                )}
                {(parsed?.problem || put.error) && (
                  <p role="alert" className="wd-problem">
                    {parsed?.problem ?? put.error}
                  </p>
                )}
                <div className="wd-row-actions">
                  <button
                    type="button"
                    className="wd-btn go"
                    disabled={
                      put.loading || !parsed || Boolean(parsed.problem) || !parsed.list.length
                    }
                    onClick={async () => {
                      if (!parsed) return;
                      const ok = await put.mutate({ stage, questions: parsed.list });
                      if (ok) {
                        onLog("you", `Saved ${parsed.list.length} screening questions`);
                        setEditing(null);
                        await q.refetch({ silent: true });
                      }
                    }}
                  >
                    {put.loading ? "Saving…" : "Save questions"}
                  </button>
                  <button type="button" className="wd-btn quiet" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                {items.length ? (
                  <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {items.map((it) => (
                      <li
                        key={it.id}
                        style={{
                          padding: "7px 0",
                          borderTop: "1px solid var(--wd-hair)",
                          fontSize: 14.5,
                          fontWeight: 300,
                          lineHeight: 1.45,
                        }}
                      >
                        {it.questionText}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="wd-small wd-muted" style={{ margin: 0 }}>
                    None yet.
                  </p>
                )}
                <div>
                  <button
                    type="button"
                    className="wd-btn quiet"
                    disabled={!data.jdBaseReady}
                    title={data.jdBaseReady ? undefined : "Set the ideal candidate first"}
                    onClick={() =>
                      setEditing({ stage, text: items.map((i) => i.questionText).join("\n") })
                    }
                  >
                    {items.length ? "Edit questions" : "Add questions"}
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface HiringRequest {
  title?: string | null;
  status?: string | null;
  department?: string | null;
  headcount?: number | null;
  urgency?: string | null;
  must_haves?: string | null;
  ideal_experience?: string | null;
  location_city?: string | null;
  budget_ctc_min?: number | null;
  budget_ctc_max?: number | null;
  target_joining_date?: string | null;
  business_justification?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
  on_hold_reason?: string | null;
}

interface ApprovalSnapshot {
  instanceStatus: string | null;
  awaitingRoles: string[];
  issue: string | null;
}

const ROLE_NAMES: Record<string, string> = {
  hiring_manager: "the hiring manager",
  leadership: "leadership",
  finance: "finance",
  recruiter: "a recruiter",
  super_admin: "an admin",
};

const lpa = (n?: number | null) => (n && n > 0 ? `${Math.round(n / 10_000) / 10} LPA` : null);
const day = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

/** Where the request is, and who has it. Used by the job and by the waiting screen. */
export function ApprovalTimeline({ requestId }: { requestId: string }) {
  const q = useApiQuery<{ request: HiringRequest; approvalWorkflow: ApprovalSnapshot | null }>(
    `/api/hiring-requests/${requestId}`,
  );
  if (q.loading && !q.data) return <p className="wd-muted">Loading the request…</p>;
  if (q.error) return <p className="wd-problem">The request could not be loaded: {q.error}</p>;
  const r = q.data?.request;
  if (!r) return null;
  const wf = q.data?.approvalWorkflow;
  const status = (r.status ?? "").toLowerCase();
  const approved = ["approved", "converted", "closed", "filled"].includes(status);
  const waitingOn = (wf?.awaitingRoles ?? []).map((x) => ROLE_NAMES[x] ?? x.replace(/_/g, " "));

  const steps: { label: string; when?: string | null; state: "done" | "now" | "next" }[] = [
    { label: "Written", when: day(r.created_at), state: "done" },
    {
      label: "Sent for approval",
      when: day(r.submitted_at),
      state: r.submitted_at || approved ? "done" : "now",
    },
    {
      label: approved
        ? "Approved"
        : status === "rejected"
          ? "Rejected"
          : waitingOn.length
            ? `With ${waitingOn.join(" and ")}`
            : "Being approved",
      state: approved || status === "rejected" ? "done" : r.submitted_at ? "now" : "next",
    },
    { label: "Job set up", state: status === "converted" ? "done" : approved ? "now" : "next" },
  ];

  const facts: [string, string | null][] = [
    ["Team", r.department ?? null],
    ["People", r.headcount ? String(r.headcount) : null],
    ["Where", r.location_city ?? null],
    ["Experience", r.ideal_experience ?? null],
    [
      "Budget",
      lpa(r.budget_ctc_min) && lpa(r.budget_ctc_max)
        ? `${lpa(r.budget_ctc_min)} to ${lpa(r.budget_ctc_max)}`
        : (lpa(r.budget_ctc_max) ?? lpa(r.budget_ctc_min)),
    ],
    ["Join by", day(r.target_joining_date)],
    ["Urgency", r.urgency ?? null],
  ];

  return (
    <div className="wd-split">
      <ol className="wd-stack" style={{ gap: 0, listStyle: "none", margin: 0, padding: 0 }}>
        {steps.map((s) => (
          <li
            key={s.label}
            className="wd-line"
            style={{ gridTemplateColumns: "14px minmax(0,1fr) auto", alignItems: "center" }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: 99,
                background:
                  s.state === "done"
                    ? "var(--wd-soft)"
                    : s.state === "now"
                      ? "var(--wd-amber)"
                      : "var(--wd-hair)",
              }}
            />
            <span
              className="wd-line-value"
              style={{ color: s.state === "next" ? "var(--wd-muted)" : undefined }}
            >
              {s.label}
            </span>
            <span className="wd-src">{s.when ?? ""}</span>
          </li>
        ))}
        {(wf?.issue || r.on_hold_reason) && (
          <li style={{ paddingTop: 14 }}>
            <p className="wd-problem" style={{ margin: 0 }}>
              {r.on_hold_reason ? `On hold: ${r.on_hold_reason}` : wf?.issue}
            </p>
          </li>
        )}
      </ol>
      <div className="wd-lines">
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="wd-line" style={{ gridTemplateColumns: "120px minmax(0,1fr)" }}>
              <span className="wd-line-label">{k}</span>
              <span className="wd-line-value">{v}</span>
            </div>
          ))}
        {r.must_haves && (
          <div className="wd-line" style={{ gridTemplateColumns: "120px minmax(0,1fr)" }}>
            <span className="wd-line-label">Must-haves</span>
            <span className="wd-line-value" style={{ whiteSpace: "pre-line" }}>
              {r.must_haves}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Add people yourself: upload CVs, or share the apply link. */
export function AddCandidates({
  jobId,
  title,
  status,
  onAdded,
}: {
  jobId: string;
  title: string;
  status?: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const job = useApiQuery<{ orgSlug?: string | null }>(`/api/jobs/${jobId}`);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const applyUrl = job.data?.orgSlug ? `${origin}/apply/${job.data.orgSlug}?job=${jobId}` : null;

  return (
    <>
      <CompanyBulkUploadModal
        open={open}
        onClose={() => {
          setOpen(false);
          onAdded();
        }}
        initialJobId={jobId}
        jobsLoading={false}
        jobs={[{ id: jobId, title, status }]}
      />
      <div className="wd-row-actions">
        <button type="button" className="wd-btn" onClick={() => setOpen(true)}>
          Upload CVs
        </button>
        {applyUrl && (
          <button
            type="button"
            className="wd-btn quiet"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(applyUrl);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Apply link copied" : "Copy the apply link"}
          </button>
        )}
      </div>
    </>
  );
}

type Thresholds = { strong: number; good: number; moderate: number; weak: number };
const BANDS: { key: keyof Thresholds; label: string; note: string }[] = [
  { key: "strong", label: "Strong fit", note: "The agent recommends an interview" },
  { key: "good", label: "Good fit", note: "Worth a look" },
  { key: "moderate", label: "Borderline", note: "Your call" },
];

/** Where each verdict starts. Kept in order: strong above good above borderline. */
export function ThresholdsEditor({
  jobId,
  thresholds,
  onSaved,
  onLog,
}: {
  jobId: string;
  thresholds: Thresholds | null;
  onSaved: () => void;
  onLog: Log;
}) {
  const current: Thresholds = thresholds ?? { ...DEFAULT_FIT_THRESHOLDS };
  const [edit, setEdit] = useState<{ from: Thresholds; value: Thresholds } | null>(null);
  const v = edit && edit.from === current ? edit.value : current;
  const changed = BANDS.some((b) => v[b.key] !== current[b.key]);
  const put = useApiMutation<{ jobId: string; fitThresholds: Thresholds }, unknown>(
    "/api/fitscore/jd-base",
    "PUT",
  );
  const ordered = v.strong > v.good && v.good > v.moderate && v.moderate > v.weak;
  const nudge = (k: keyof Thresholds, d: number) =>
    setEdit({ from: current, value: { ...v, [k]: Math.max(5, Math.min(95, v[k] + d)) } });

  return (
    <div className="wd-stack" style={{ gap: 6 }}>
      <div className="wd-small" style={{ color: "var(--wd-soft)" }}>
        Where each verdict starts
      </div>
      <div className="wd-lines">
        {BANDS.map((b) => (
          <div
            key={b.key}
            className="wd-line"
            style={{ gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center" }}
          >
            <div>
              <div className="wd-line-value">{b.label}</div>
              <div className="wd-src">{b.note}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                className="wd-circ"
                aria-label={`Lower ${b.label}`}
                onClick={() => nudge(b.key, -5)}
              >
                −
              </button>
              <span style={{ width: 54, textAlign: "center", fontSize: 15 }}>{v[b.key]}+</span>
              <button
                type="button"
                className="wd-circ"
                aria-label={`Raise ${b.label}`}
                onClick={() => nudge(b.key, 5)}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      {!ordered && (
        <p className="wd-problem" style={{ margin: 0 }}>
          Keep them in order: strong above good, good above borderline.
        </p>
      )}
      {put.error && <p className="wd-problem">{put.error}</p>}
      {changed && (
        <div className="wd-row-actions">
          <button
            type="button"
            className="wd-btn"
            disabled={!ordered || put.loading}
            onClick={async () => {
              const ok = await put.mutate({ jobId, fitThresholds: v });
              if (ok) {
                onLog("you", "Changed where verdicts start");
                setEdit(null);
                onSaved();
              }
            }}
          >
            {put.loading ? "Saving…" : "Save verdicts"}
          </button>
          <button type="button" className="wd-btn quiet" onClick={() => setEdit(null)}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

/** Where the scoring and the description disagree (shared with the old wizard's checks). */
export function rubricIssues(input: {
  jobDescriptionText: string;
  jobTitle?: string;
  icp: Partial<IdealCandidateProfile> | null;
  weights: Record<string, number>;
  templateId: string | null;
}) {
  const icp = input.icp;
  return detectJdBaseMismatches({
    jobDescriptionText: input.jobDescriptionText,
    jobTitle: input.jobTitle,
    idealProfile: icp
      ? ({
          summary: icp.summary ?? "",
          must_haves: icp.must_haves ?? [],
          nice_to_haves: icp.nice_to_haves ?? [],
          years_range: icp.years_range ?? "",
          benchmarks: icp.benchmarks ?? {},
        } as IdealCandidateProfile)
      : null,
    weights: input.weights,
    templateId: input.templateId,
  });
}

/** The list of disagreements, quietly. */
export function RubricChecks({ issues }: { issues: ReturnType<typeof rubricIssues> }) {
  if (!issues.length)
    return (
      <p className="wd-small wd-muted" style={{ margin: 0 }}>
        The scoring matches what the description asks for.
      </p>
    );
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {issues.map((m) => (
        <li
          key={m.id}
          style={{
            padding: "6px 0",
            fontSize: 13.5,
            lineHeight: 1.45,
            color: m.severity === "error" ? "var(--wd-bad)" : "var(--wd-soft)",
          }}
        >
          {m.message}
        </li>
      ))}
    </ul>
  );
}
