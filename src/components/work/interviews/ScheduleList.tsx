"use client";

import { useState } from "react";
import {
  formatWhen,
  linkOutcome,
  plural,
  type OpenSlot,
  type StageRow,
  type ToSchedule,
} from "@/lib/work/interviews";
import { AddInterviewer } from "./AddInterviewer";
import { SlotPicker } from "./SlotPicker";
import { postJson } from "./post-json";
import s from "./interviews.module.css";

interface LinkResponse {
  url?: string;
  expiresAt?: string;
  emailSent?: boolean;
  emailError?: string;
  emailNotice?: string;
}

interface BookResponse {
  interview_scheduled_at?: string;
  has_delivery_failure?: boolean;
  failed_channels?: string[];
}

type Note = { ok: boolean; text: string };

/** 2. Shortlisted, nothing booked: send a link (automation books) or pick a time. */
export function ScheduleList({
  jobId,
  items,
  openSlots,
  stageById,
  linkSent,
  onLinkSent,
  onBooked,
  onInterviewerSaved,
  onSlotsChanged,
  onLog,
}: {
  jobId: string;
  items: ToSchedule[];
  openSlots: OpenSlot[];
  stageById: Map<string, StageRow>;
  linkSent: ReadonlySet<string>;
  onLinkSent: (pipelineCandidateId: string) => void;
  onBooked: () => void | Promise<void>;
  onInterviewerSaved: () => void | Promise<void>;
  onSlotsChanged: () => void | Promise<void>;
  onLog: (actor: "agent" | "auto" | "you", what: string) => void;
}) {
  const [open, setOpen] = useState<{ id: string; what: "pick" | "interviewer" } | null>(null);
  const [slotChoice, setSlotChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);

  if (!items.length) return null;

  const pending = items.filter((t) => !linkSent.has(t.pipelineCandidateId));
  const noTimes = openSlots.length === 0;
  const note = (id: string, n: Note) => setNotes((m) => ({ ...m, [id]: n }));

  async function sendLink(t: ToSchedule): Promise<boolean> {
    const res = await postJson<LinkResponse>(`/api/jobs/${jobId}/interviews/self-schedule-link`, {
      pipeline_candidate_id: t.pipelineCandidateId,
      sendEmail: true,
    });
    if (!res.ok) {
      note(t.pipelineCandidateId, { ok: false, text: res.error });
      return false;
    }
    const out = linkOutcome(res.data);
    note(t.pipelineCandidateId, out);
    if (out.ok) {
      onLinkSent(t.pipelineCandidateId);
      onLog("auto", `Emailed ${t.candidateName} a link to pick an interview time`);
    } else if (res.data.url) {
      // The link exists; the person can still pass it on themselves.
      note(t.pipelineCandidateId, { ok: false, text: `${out.text}. Link: ${res.data.url}` });
    }
    return out.ok;
  }

  async function sendOne(t: ToSchedule) {
    setBusy(t.pipelineCandidateId);
    await sendLink(t);
    setBusy(null);
  }

  async function sendAll() {
    setBatch({ done: 0, total: pending.length });
    let sent = 0;
    for (const [i, t] of pending.entries()) {
      if (await sendLink(t)) sent += 1;
      setBatch({ done: i + 1, total: pending.length });
    }
    setBatch(null);
    onLog("you", `Sent interview links to ${plural(sent, "candidate")}`);
  }

  async function book(t: ToSchedule) {
    if (!slotChoice) return;
    setBusy(t.pipelineCandidateId);
    const slot = openSlots.find((x) => x.id === slotChoice);
    const res = await postJson<BookResponse>(`/api/jobs/${jobId}/interviews/book`, {
      slot_id: slotChoice,
      pipeline_candidate_id: t.pipelineCandidateId,
    });
    setBusy(null);
    if (!res.ok) {
      note(t.pipelineCandidateId, { ok: false, text: res.error });
      return;
    }
    const when = formatWhen(res.data.interview_scheduled_at ?? slot?.start);
    onLog("you", `Booked ${t.candidateName} for ${when}`);
    if (res.data.has_delivery_failure) {
      onLog(
        "auto",
        `Invites failed for ${t.candidateName} (${(res.data.failed_channels ?? []).join(", ")})`,
      );
    } else {
      onLog("auto", `Sent calendar invites to ${t.candidateName} and the interviewer`);
    }
    setOpen(null);
    setSlotChoice(null);
    await onBooked();
  }

  return (
    <section className={s.section} aria-labelledby="wd-iv-schedule">
      <div className={s.sectionHead}>
        <h2 className="wd-h2" id="wd-iv-schedule">
          Shortlisted, not yet scheduled
        </h2>
        <span className={s.count}>{plural(items.length, "candidate")}</span>
      </div>
      {noTimes ? (
        <p className={s.notice}>
          There are no open interview times, so a link would have nothing to offer. Open a time
          under &ldquo;Pick a slot&rdquo; first.
        </p>
      ) : (
        <p className={s.notice}>
          A link lets the candidate pick from {plural(openSlots.length, "open time")};{" "}
          <span className="wd-sig auto">automation</span> books it and sends the invites.
        </p>
      )}
      {pending.length > 1 && (
        <div className="wd-row-actions">
          <button
            type="button"
            className="wd-btn go"
            disabled={noTimes || batch !== null}
            onClick={() => void sendAll()}
          >
            {batch
              ? `Sending ${batch.done} of ${batch.total}…`
              : `Send links to all ${pending.length}`}
          </button>
        </div>
      )}
      <div className={s.list}>
        {items.map((t) => {
          const id = t.pipelineCandidateId;
          const sent = linkSent.has(id);
          const stage = t.stageId ? stageById.get(t.stageId) : undefined;
          const n = notes[id];
          const isOpen = open?.id === id;
          return (
            <div key={id} className={s.row}>
              <div>
                <div className={s.who}>{t.candidateName}</div>
                <div className={s.meta}>
                  <span>{t.stageName}</span>
                  <span>
                    Interviewer: <b>{t.interviewer ?? "not set"}</b>
                  </span>
                </div>
                {sent && (
                  <div className={s.meta}>
                    <span className="wd-sig auto">Link sent, waiting for them to pick a time</span>
                  </div>
                )}
              </div>
              <div className={s.actions}>
                {t.needsInterviewer && stage && (
                  <button
                    type="button"
                    className="wd-btn go"
                    aria-expanded={isOpen && open?.what === "interviewer"}
                    onClick={() =>
                      setOpen(
                        isOpen && open?.what === "interviewer" ? null : { id, what: "interviewer" },
                      )
                    }
                  >
                    Add an interviewer for {stage.stage_name}
                  </button>
                )}
                <button
                  type="button"
                  className={t.needsInterviewer || sent ? "wd-btn" : "wd-btn go"}
                  disabled={noTimes || busy === id || batch !== null}
                  onClick={() => void sendOne(t)}
                >
                  {busy === id && !isOpen
                    ? "Sending…"
                    : sent
                      ? "Send the link again"
                      : "Send a self-schedule link"}
                </button>
                <button
                  type="button"
                  className="wd-btn"
                  aria-expanded={isOpen && open?.what === "pick"}
                  onClick={() => {
                    setSlotChoice(null);
                    setOpen(isOpen && open?.what === "pick" ? null : { id, what: "pick" });
                  }}
                >
                  Pick a slot
                </button>
              </div>
              {n && (
                <p
                  role={n.ok ? "status" : "alert"}
                  className={n.ok ? s.ok : "wd-problem"}
                  style={{ gridColumn: "1 / -1", overflowWrap: "anywhere" }}
                >
                  {n.text}
                </p>
              )}
              {isOpen && open?.what === "interviewer" && stage && (
                <AddInterviewer
                  jobId={jobId}
                  stage={stage}
                  onSaved={async (who) => {
                    onLog("you", `Made ${who} the interviewer for ${stage.stage_name}`);
                    setOpen(null);
                    await onInterviewerSaved();
                  }}
                />
              )}
              {isOpen && open?.what === "pick" && (
                <div className={s.drawer}>
                  <SlotPicker
                    jobId={jobId}
                    slots={openSlots}
                    value={slotChoice}
                    onChange={setSlotChoice}
                    label={`Choose a time for ${t.candidateName}`}
                    onSlotsChanged={async (createdId) => {
                      onLog("you", "Opened a new interview time");
                      await onSlotsChanged();
                      if (createdId) setSlotChoice(createdId);
                    }}
                  />
                  <div className="wd-row-actions">
                    <button
                      type="button"
                      className="wd-btn go"
                      disabled={!slotChoice || busy === id}
                      onClick={() => void book(t)}
                    >
                      {busy === id
                        ? "Booking…"
                        : slotChoice
                          ? `Book ${formatWhen(openSlots.find((x) => x.id === slotChoice)?.start)}`
                          : "Choose a time to book"}
                    </button>
                    <span className="wd-sig auto">Automation sends the invites</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
