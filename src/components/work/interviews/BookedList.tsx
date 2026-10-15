"use client";

import { useState } from "react";
import {
  formatWhen,
  plural,
  startsIn,
  type BookedInterview,
  type OpenSlot,
} from "@/lib/work/interviews";
import { TimePicker } from "./TimePicker";
import { postJson } from "./post-json";
import s from "./interviews.module.css";

type Mode = "reschedule" | "cancel";

/** 3. Upcoming interviews: move, cancel, resend failed invites, add to calendar. */
export function BookedList({
  jobId,
  items,
  openSlots,
  now,
  onChanged,
  onSlotsChanged,
  onLog,
}: {
  jobId: string;
  items: BookedInterview[];
  openSlots: OpenSlot[];
  now: number;
  onChanged: () => void | Promise<void>;
  onSlotsChanged: () => void | Promise<void>;
  onLog: (actor: "agent" | "auto" | "you", what: string) => void;
}) {
  const [open, setOpen] = useState<{ id: string; mode: Mode } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resent, setResent] = useState<Record<string, string>>({});

  if (!items.length) return null;

  const fail = (id: string, text: string) => setErrors((m) => ({ ...m, [id]: text }));
  const clearFail = (id: string) =>
    setErrors((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });

  async function reschedule(b: BookedInterview, newSlotId: string, startIso: string) {
    setBusy(b.slotId);
    clearFail(b.slotId);
    const res = await postJson(`/api/jobs/${jobId}/interviews/reschedule`, {
      slot_id: b.slotId,
      new_slot_id: newSlotId,
    });
    setBusy(null);
    if (!res.ok) {
      fail(b.slotId, res.error);
      return false;
    }
    onLog("you", `Moved ${b.candidateName} to ${formatWhen(startIso)}`);
    onLog("auto", `Sent ${b.candidateName} and the interviewer the new time`);
    setOpen(null);
    await onChanged();
    return true;
  }

  async function cancel(b: BookedInterview) {
    setBusy(b.slotId);
    clearFail(b.slotId);
    const res = await postJson(`/api/jobs/${jobId}/interviews/cancel`, { slot_id: b.slotId });
    setBusy(null);
    if (!res.ok) return fail(b.slotId, res.error);
    onLog("you", `Cancelled ${b.candidateName}'s interview`);
    onLog("auto", `Told ${b.candidateName} and the interviewer it is cancelled`);
    setOpen(null);
    await onChanged();
  }

  async function resend(b: BookedInterview) {
    setBusy(b.slotId);
    clearFail(b.slotId);
    const res = await postJson<{ has_delivery_failure?: boolean; failed_channels?: string[] }>(
      `/api/interview-slots/${encodeURIComponent(b.slotId)}/resend-invites`,
    );
    setBusy(null);
    if (!res.ok) return fail(b.slotId, res.error);
    if (res.data.has_delivery_failure) {
      fail(b.slotId, `Still failing: ${(res.data.failed_channels ?? []).join(", ")}.`);
    } else {
      setResent((m) => ({ ...m, [b.slotId]: "Invites sent again." }));
      onLog("auto", `Resent invites for ${b.candidateName}`);
    }
    await onChanged();
  }

  return (
    <section className={s.section} aria-labelledby="wd-iv-booked">
      <div className={s.sectionHead}>
        <h2 className="wd-h2" id="wd-iv-booked">
          Booked
        </h2>
        <span className={s.count}>{plural(items.length, "interview")} coming up</span>
      </div>
      <div className={s.list}>
        {items.map((b) => {
          const isOpen = open?.id === b.slotId;
          return (
            <div key={b.slotId} className={s.row}>
              <div>
                <div className={s.who}>{b.candidateName}</div>
                <div className={s.meta}>
                  <b>{formatWhen(b.start)}</b>
                  <span>{startsIn(b.start, now)}</span>
                  <span>{b.stageName}</span>
                  <span>
                    Interviewer: <b>{b.interviewer ?? "not set"}</b>
                  </span>
                </div>
                <div className={s.meta}>
                  {b.failedInvites.length && !resent[b.slotId] ? (
                    <span className="wd-sig bad">Invites failed: {b.failedInvites.join(", ")}</span>
                  ) : (
                    <span className="wd-sig auto">
                      {resent[b.slotId] ?? "Invites sent; automation sends the reminder"}
                    </span>
                  )}
                </div>
              </div>
              <div className={s.actions}>
                {b.failedInvites.length > 0 && !resent[b.slotId] && (
                  <button
                    type="button"
                    className="wd-btn go"
                    disabled={busy === b.slotId}
                    onClick={() => void resend(b)}
                  >
                    {busy === b.slotId && !isOpen ? "Resending…" : "Resend invites"}
                  </button>
                )}
                <a
                  className="wd-btn quiet"
                  href={`/api/jobs/${jobId}/interviews/ics?slot_id=${encodeURIComponent(b.slotId)}`}
                >
                  Add to my calendar
                </a>
                <button
                  type="button"
                  className="wd-btn"
                  aria-expanded={isOpen && open?.mode === "reschedule"}
                  onClick={() => {
                    setOpen(
                      isOpen && open?.mode === "reschedule"
                        ? null
                        : { id: b.slotId, mode: "reschedule" },
                    );
                  }}
                >
                  Reschedule
                </button>
                <button
                  type="button"
                  className="wd-btn quiet"
                  aria-expanded={isOpen && open?.mode === "cancel"}
                  onClick={() =>
                    setOpen(
                      isOpen && open?.mode === "cancel" ? null : { id: b.slotId, mode: "cancel" },
                    )
                  }
                >
                  Cancel
                </button>
              </div>
              {errors[b.slotId] && (
                <p role="alert" className="wd-problem" style={{ gridColumn: "1 / -1" }}>
                  {errors[b.slotId]}
                </p>
              )}
              {isOpen && open?.mode === "reschedule" && (
                <TimePicker
                  jobId={jobId}
                  defaultPanel={[]}
                  openSlots={openSlots}
                  multiple={false}
                  confirmLabel={(picked) =>
                    picked.length
                      ? `Move to ${formatWhen(new Date(picked[0].start).toISOString())}`
                      : "Pick the new time"
                  }
                  onCancel={() => setOpen(null)}
                  onConfirm={async (ids, picked) => {
                    if (picked.some((p) => p.kind === "new")) {
                      onLog("you", "Opened a new interview time");
                      await onSlotsChanged();
                    }
                    return reschedule(b, ids[0], new Date(picked[0].start).toISOString());
                  }}
                />
              )}
              {isOpen && open?.mode === "cancel" && (
                <div className={`${s.drawer} ${s.drawerYou}`}>
                  <p className={s.notice}>
                    Cancel {b.candidateName}&rsquo;s interview on {formatWhen(b.start)}? The time
                    opens up again and both sides are told.
                  </p>
                  <div className="wd-row-actions">
                    <button
                      type="button"
                      className="wd-btn go"
                      disabled={busy === b.slotId}
                      onClick={() => void cancel(b)}
                    >
                      {busy === b.slotId ? "Cancelling…" : "Cancel the interview"}
                    </button>
                    <button type="button" className="wd-btn quiet" onClick={() => setOpen(null)}>
                      Keep it
                    </button>
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
