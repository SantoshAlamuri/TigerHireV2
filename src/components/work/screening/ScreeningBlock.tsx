"use client";

import { useMemo, useState } from "react";
import { invalidateQueries, useApiQuery } from "@/lib/hooks/use-api";
import type { PanelProps } from "@/components/work/panels";
import { ScreeningEditor } from "@/components/work/editors";
import { postJson } from "@/components/work/interviews/post-json";
import { setScreeningSkipped } from "@/lib/work/use-job-journey";
import { Disclosure, DisclosureGroup } from "@/components/work/Disclosure";

interface SendPreview {
  shortlistedTotal: number;
  withPhone: number;
  withoutPhone: number;
  screeningComplete: number;
  awaitingConsent: number;
  inProgress: number;
  timedOut: number;
  knockedOut: number;
  eligibleToSend: number;
  postShortlistQuestionCount: number;
}
interface ReviewRow {
  applicationId: string;
  candidateName: string;
  gateStatus: "pending" | "passed" | "failed" | "unverified" | null;
  postShortlistAnswerCount: number;
  postShortlistQuestionCount: number;
  postShortlistFailed: boolean;
  fitScore: number | null;
  answers: Record<string, { value: string; passed: boolean | null }>;
}
interface ReviewPayload {
  jdApprovalPending: boolean;
  questions: { id: string; phase: string; text: string }[];
  rows: ReviewRow[];
}
interface SetupData {
  whatsappEnabled: boolean;
  jdBaseReady: boolean;
  applyQuestions: { id: string }[];
  postShortlistQuestions: { id: string }[];
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/**
 * WhatsApp screening, both moments: the yes/no questions sent when someone
 * applies (a wrong answer can rule them out), and the deeper questions sent
 * once you shortlist. Then who has answered, and what.
 */
export function ScreeningBlock({ jobId, facts, onDone, onLog, goTo }: PanelProps) {
  const setup = useApiQuery<SetupData>(`/api/jobs/${jobId}/whatsapp-screening`);
  const asks =
    (setup.data?.applyQuestions.length ?? 0) + (setup.data?.postShortlistQuestions.length ?? 0);

  if (setup.loading && !setup.data) return <p className="wd-muted">Loading screening…</p>;
  if (setup.data && !setup.data.whatsappEnabled) {
    return (
      <div className="wd-stack" style={{ gap: 14 }}>
        <p className="wd-lede">
          Screening runs on WhatsApp, and it&apos;s switched off for your organisation.
        </p>
        <p className="wd-small wd-muted" style={{ margin: 0 }}>
          An admin can turn it on in Setup, under Scoring and screening.
        </p>
      </div>
    );
  }
  if (setup.data && !setup.data.jdBaseReady) {
    return (
      <div className="wd-stack" style={{ gap: 14 }}>
        <p className="wd-lede">Questions are built from the ideal candidate, so set that first.</p>
        <div className="wd-row-actions">
          <button type="button" className="wd-btn go" onClick={() => goTo("profile")}>
            Set the ideal candidate
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wd-stack" style={{ gap: 28 }}>
      <p className="wd-muted" style={{ margin: 0 }}>
        Sent on WhatsApp. A &ldquo;no&rdquo; when they apply holds someone back from your review;
        answers after the shortlist are for context only.
      </p>
      <ScreeningEditor
        jobId={jobId}
        onLog={(a, w) => {
          onLog(a, w);
          invalidateQueries(`/api/jobs/${jobId}/whatsapp-screening`);
          void setup.refetch({ silent: true });
        }}
      />

      {(facts.shortlisted > 0 || facts.applicants > 0) && asks > 0 && (
        <DisclosureGroup title="Progress">
          {facts.shortlisted > 0 && (setup.data?.postShortlistQuestions.length ?? 0) > 0 && (
            <PostShortlistSend jobId={jobId} onLog={onLog} />
          )}
          {facts.applicants > 0 && <Answers jobId={jobId} />}
        </DisclosureGroup>
      )}

      <div className="wd-row-actions">
        {asks > 0 ? (
          <button type="button" className="wd-btn go" onClick={() => onDone("Screening set")}>
            {facts.roleOpen ? "Done" : "Next: go live"}
          </button>
        ) : (
          !facts.roleOpen && (
            <button
              type="button"
              className="wd-btn"
              onClick={() => {
                setScreeningSkipped(jobId, true);
                onLog("you", "Chose to go live without screening questions");
                onDone("Screening skipped");
              }}
            >
              Go live without screening
            </button>
          )
        )}
      </div>
    </div>
  );
}

function PostShortlistSend({ jobId, onLog }: { jobId: string; onLog: PanelProps["onLog"] }) {
  const q = useApiQuery<SendPreview>(`/api/jobs/${jobId}/post-shortlist-send`);
  const [busy, setBusy] = useState<"send" | "nudge" | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const p = q.data;

  async function send(nudge: boolean) {
    setBusy(nudge ? "nudge" : "send");
    setNote(null);
    const res = await postJson<{ sent: number; skipped: number; failed: number }>(
      `/api/jobs/${jobId}/post-shortlist-send`,
      nudge ? { forceResend: true, nonRespondersOnly: true } : {},
    );
    setBusy(null);
    if (!res.ok) return setNote({ ok: false, text: res.error });
    const { sent, failed } = res.data;
    setNote({
      ok: failed === 0,
      text: `Sent to ${plural(sent, "person")}${failed ? `, ${failed} failed` : ""}.`,
    });
    onLog(
      "auto",
      `${nudge ? "Reminded" : "Sent post-shortlist questions to"} ${plural(sent, "person")} on WhatsApp`,
    );
    invalidateQueries(`/api/jobs/${jobId}/post-shortlist-send`);
    await q.refetch({ silent: true });
  }

  if (q.loading && !p) return null;
  if (q.error || !p)
    return <p className="wd-problem">Couldn&apos;t check who to send to: {q.error}</p>;

  const waiting = p.awaitingConsent + p.inProgress;
  return (
    <Disclosure
      label="After the shortlist"
      summary={`${p.screeningComplete} of ${p.shortlistedTotal} answered${p.eligibleToSend ? `, ${p.eligibleToSend} not asked yet` : ""}`}
      warn={p.eligibleToSend > 0}
    >
      <div className="wd-stack" style={{ gap: 10 }}>
        <p className="wd-small wd-muted" style={{ margin: 0 }}>
          {[
            `${p.screeningComplete} answered`,
            waiting ? `${waiting} haven't finished` : null,
            p.knockedOut ? `${p.knockedOut} ruled out` : null,
            p.withoutPhone ? `${p.withoutPhone} without a phone number` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {note && (
          <p role={note.ok ? "status" : "alert"} className={note.ok ? "wd-small" : "wd-problem"}>
            {note.text}
          </p>
        )}
        <div className="wd-row-actions">
          {p.eligibleToSend > 0 && (
            <button
              type="button"
              className="wd-btn go"
              disabled={busy !== null}
              onClick={() => void send(false)}
            >
              {busy === "send" ? "Sending…" : `Ask ${plural(p.eligibleToSend, "person")}`}
            </button>
          )}
          {p.awaitingConsent > 0 && (
            <button
              type="button"
              className="wd-btn"
              disabled={busy !== null}
              onClick={() => void send(true)}
            >
              {busy === "nudge" ? "Reminding…" : `Remind ${p.awaitingConsent}`}
            </button>
          )}
        </div>
      </div>
    </Disclosure>
  );
}

const GATE: Record<string, { label: string; tone: string }> = {
  passed: { label: "Passed", tone: "var(--wd-agent)" },
  failed: { label: "Ruled out", tone: "var(--wd-bad)" },
  pending: { label: "Waiting", tone: "var(--wd-muted)" },
  unverified: { label: "Unverified", tone: "var(--wd-muted)" },
};

function Answers({ jobId }: { jobId: string }) {
  const q = useApiQuery<ReviewPayload>(`/api/jobs/${jobId}/screening-review`);
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const rows = useMemo(() => {
    const r = (q.data?.rows ?? []).filter(
      (x) => x.gateStatus || Object.keys(x.answers).length || x.postShortlistAnswerCount,
    );
    const rank = (x: ReviewRow) =>
      x.gateStatus === "failed" || x.postShortlistFailed ? 0 : x.gateStatus === "pending" ? 2 : 1;
    return r.sort((a, b) => rank(a) - rank(b) || (b.fitScore ?? -1) - (a.fitScore ?? -1));
  }, [q.data]);
  const questions = new Map((q.data?.questions ?? []).map((x) => [x.id, x]));

  if (q.loading && !q.data) return null;
  if (q.error) return <p className="wd-problem">Answers couldn&apos;t be loaded: {q.error}</p>;
  if (!rows.length)
    return (
      <Disclosure label="Answers" summary="No one has answered yet">
        <p className="wd-small wd-muted" style={{ margin: 0 }}>
          Answers appear here as people reply on WhatsApp.
        </p>
      </Disclosure>
    );

  const shown = all ? rows : rows.slice(0, 12);
  const ruledOut = rows.filter((r) => r.gateStatus === "failed" || r.postShortlistFailed).length;
  return (
    <Disclosure
      label="Answers"
      summary={`${rows.length} answered${ruledOut ? `, ${ruledOut} ruled out` : ""}`}
    >
      {q.data?.jdApprovalPending && (
        <p className="wd-small wd-muted" style={{ margin: 0 }}>
          The rubric is waiting for approval, so new questions aren&apos;t being asked yet.
        </p>
      )}
      <div className="wd-lines">
        {shown.map((r) => {
          const g = GATE[r.postShortlistFailed ? "failed" : (r.gateStatus ?? "pending")];
          const isOpen = open === r.applicationId;
          return (
            <div key={r.applicationId}>
              <button
                type="button"
                className="wd-line"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : r.applicationId)}
                style={{
                  width: "100%",
                  gridTemplateColumns: "minmax(0,1fr) auto auto",
                  border: 0,
                  borderTop: "1px solid var(--wd-hair)",
                  background: "none",
                  color: "inherit",
                  font: "inherit",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span className="wd-line-value">{r.candidateName}</span>
                <span className="wd-src">
                  {r.postShortlistQuestionCount
                    ? `${r.postShortlistAnswerCount}/${r.postShortlistQuestionCount} after shortlist`
                    : ""}
                </span>
                <span style={{ color: g.tone, fontSize: 13 }}>{g.label}</span>
              </button>
              {isOpen && (
                <ul style={{ listStyle: "none", margin: "0 0 12px", padding: 0 }}>
                  {Object.entries(r.answers).map(([qid, a]) => (
                    <li
                      key={qid}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0,1fr) auto",
                        gap: 12,
                        padding: "6px 0 6px 12px",
                        fontSize: 13.5,
                      }}
                    >
                      <span className="wd-muted">{questions.get(qid)?.text ?? "Question"}</span>
                      <span
                        style={{
                          color:
                            a.passed === false
                              ? "var(--wd-bad)"
                              : a.passed
                                ? "var(--wd-agent)"
                                : "var(--wd-ink)",
                        }}
                      >
                        {a.value || "—"}
                      </span>
                    </li>
                  ))}
                  {!Object.keys(r.answers).length && (
                    <li className="wd-small wd-muted" style={{ padding: "6px 12px" }}>
                      No answers recorded yet.
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {rows.length > 12 && (
        <button type="button" className="wd-btn quiet" onClick={() => setAll((a) => !a)}>
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </Disclosure>
  );
}
