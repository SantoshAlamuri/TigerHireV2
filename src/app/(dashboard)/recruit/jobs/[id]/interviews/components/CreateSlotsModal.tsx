"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Loader2, Plus, X } from "lucide-react";
import { DISPLAY_TIMEZONE_LABEL, getBrowserTimezoneLabel } from "@/lib/locale/display";

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function CreateSlotsModal({
  onClose,
  onCreate,
  loading,
  jobTitle,
  signedInAsLabel,
  interviewerPicker,
  interviewerPickerEnabled = true,
  preferInterviewerMode = false,
}: {
  onClose: () => void;
  onCreate: (
    slots: Array<{
      start_at: string;
      end_at: string;
      timezone?: string;
      source?: "recruiter_manual" | "interviewer_declared";
    }>,
  ) => Promise<void>;
  loading: boolean;
  jobTitle: string;
  /** Current session (from your login — slots are always saved under this account). */
  signedInAsLabel: string;
  interviewerPicker?: React.ReactNode;
  interviewerPickerEnabled?: boolean;
  preferInterviewerMode?: boolean;
}) {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  const defaultEnd = new Date(now);
  defaultEnd.setHours(defaultEnd.getHours() + 1);

  const [mode, setMode] = useState<"single" | "batch" | "from_interviewer">(() => {
    if (preferInterviewerMode && interviewerPickerEnabled && interviewerPicker) {
      return "from_interviewer";
    }
    return "single";
  });
  const [startAt, setStartAt] = useState(toLocalDatetimeValue(now));
  const [endAt, setEndAt] = useState(toLocalDatetimeValue(defaultEnd));
  const [batchDate, setBatchDate] = useState(now.toISOString().split("T")[0]);
  const [batchStartHour, setBatchStartHour] = useState("09:00");
  const [batchEndHour, setBatchEndHour] = useState("17:00");
  const [slotDuration, setSlotDuration] = useState(60);
  const [weekdaysOnly, setWeekdaysOnly] = useState(true);
  const [numDays, setNumDays] = useState(5);
  const browserTz = getBrowserTimezoneLabel();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "single") {
      await onCreate([
        {
          start_at: new Date(startAt).toISOString(),
          end_at: new Date(endAt).toISOString(),
        },
      ]);
      return;
    }

    const slots: Array<{ start_at: string; end_at: string }> = [];
    const baseDate = new Date(batchDate);
    const [startH, startM] = batchStartHour.split(":").map(Number);
    const [endH, endM] = batchEndHour.split(":").map(Number);
    const dayStartMinutes = startH * 60 + startM;
    const dayEndMinutes = endH * 60 + endM;

    let daysAdded = 0;
    let dayOffset = 0;
    while (daysAdded < numDays && dayOffset < 30) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + dayOffset);
      dayOffset++;
      const dow = d.getDay();
      if (weekdaysOnly && (dow === 0 || dow === 6)) continue;
      daysAdded++;

      let currentMinute = dayStartMinutes;
      while (currentMinute + slotDuration <= dayEndMinutes) {
        const slotStart = new Date(d);
        slotStart.setHours(Math.floor(currentMinute / 60), currentMinute % 60, 0, 0);
        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + slotDuration);
        slots.push({
          start_at: slotStart.toISOString(),
          end_at: slotEnd.toISOString(),
        });
        currentMinute += slotDuration;
      }
    }

    if (slots.length === 0) return;
    await onCreate(slots);
  };

  const overlay = (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/60 px-3 pb-8 pt-[max(1rem,env(safe-area-inset-top))] sm:px-4 sm:pb-10 sm:pt-8"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="mt-4 w-full max-w-lg overflow-y-auto overscroll-contain rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-2xl sm:mt-6 sm:max-h-[min(90dvh,44rem)] sm:p-6 md:p-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-slots-modal-title"
        aria-describedby="create-slots-modal-context"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3
            id="create-slots-modal-title"
            className="heading-card min-w-0 flex-1 text-lg text-[var(--text)]"
          >
            Create interview slots
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-white/60 transition hover:bg-white/[0.04] hover:text-[var(--text)] touch-manipulation"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        <div
          id="create-slots-modal-context"
          className="mb-4 rounded-lg border border-[var(--accent)]/25 bg-[var(--accent)]/[0.07] px-3 py-2.5 text-sm text-white/80"
        >
          <p className="font-medium text-[var(--text)]">Job</p>
          <p className="mt-0.5 text-white/70">{jobTitle}</p>
          <p className="mt-2 font-medium text-[var(--text)]">Signed in as</p>
          <p className="mt-0.5 text-white/70">{signedInAsLabel}</p>
          <p className="mt-2 text-xs text-white/55">
            This is your current session, not a choice from a list. New slots are saved under this
            login; switch accounts only if someone else should own the availability.
          </p>
          <p className="mt-2 text-xs text-white/55">
            Slot times use your browser clock{browserTz ? ` (${browserTz})` : ""}. Listed slots and
            invites display in {DISPLAY_TIMEZONE_LABEL}.
          </p>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {interviewerPicker && (
            <button
              type="button"
              disabled={!interviewerPickerEnabled}
              title={
                interviewerPickerEnabled
                  ? undefined
                  : "No interviewer availability declared. Ask interviewers to add windows at /company/my-availability."
              }
              onClick={() => interviewerPickerEnabled && setMode("from_interviewer")}
              className={`min-h-10 flex-1 rounded-lg px-3 py-2 text-sm font-medium transition sm:flex-none sm:py-1.5 touch-manipulation disabled:cursor-not-allowed disabled:opacity-40 ${
                mode === "from_interviewer"
                  ? "bg-[var(--accent)] text-black"
                  : "bg-[var(--surface)] text-white/60 hover:text-[var(--text)]"
              }`}
            >
              From interviewer availability
            </button>
          )}
          <button
            type="button"
            onClick={() => setMode("single")}
            className={`min-h-10 flex-1 rounded-lg px-3 py-2 text-sm font-medium transition sm:flex-none sm:py-1.5 touch-manipulation ${
              mode === "single"
                ? "bg-[var(--accent)] text-black"
                : "bg-[var(--surface)] text-white/60 hover:text-[var(--text)]"
            }`}
          >
            Single Slot
          </button>
          <button
            type="button"
            onClick={() => setMode("batch")}
            className={`min-h-10 flex-1 rounded-lg px-3 py-2 text-sm font-medium transition sm:flex-none sm:py-1.5 touch-manipulation ${
              mode === "batch"
                ? "bg-[var(--accent)] text-black"
                : "bg-[var(--surface)] text-white/60 hover:text-[var(--text)]"
            }`}
          >
            Batch Generate
          </button>
        </div>

        {mode === "from_interviewer" ? (
          <div className="space-y-4">
            <p className="text-sm text-white/65">
              Click a declared window to create one interview slot with the same times (tagged as
              interviewer-declared).
            </p>
            {interviewerPicker}
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm font-medium text-white/60 transition hover:bg-white/[0.04] hover:text-[var(--text)] sm:flex-1 sm:py-2 touch-manipulation"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "single" ? (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                    Start Time
                  </label>
                  <input
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    aria-label="Start time"
                    className="th-datetime-input min-h-11 w-full min-w-0 max-w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] focus:border-white/20 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                    End Time
                  </label>
                  <input
                    type="datetime-local"
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                    aria-label="End time"
                    className="th-datetime-input min-h-11 w-full min-w-0 max-w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] focus:border-white/20 focus:outline-none"
                    required
                  />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                      Starting Date
                    </label>
                    <input
                      type="date"
                      value={batchDate}
                      onChange={(e) => setBatchDate(e.target.value)}
                      aria-label="Starting date"
                      className="th-datetime-input min-h-11 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] focus:border-white/20 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                      Number of Days
                    </label>
                    <input
                      type="number"
                      value={numDays}
                      onChange={(e) => setNumDays(Number(e.target.value))}
                      min={1}
                      max={30}
                      aria-label="Number of days"
                      className="th-datetime-input min-h-11 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] focus:border-white/20 focus:outline-none"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                      Day Start
                    </label>
                    <input
                      type="time"
                      value={batchStartHour}
                      onChange={(e) => setBatchStartHour(e.target.value)}
                      aria-label="Day start time"
                      className="th-datetime-input min-h-11 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] focus:border-white/20 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                      Day End
                    </label>
                    <input
                      type="time"
                      value={batchEndHour}
                      onChange={(e) => setBatchEndHour(e.target.value)}
                      aria-label="Day end time"
                      className="th-datetime-input min-h-11 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] focus:border-white/20 focus:outline-none"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                      Slot Duration (min)
                    </label>
                    <select
                      value={slotDuration}
                      onChange={(e) => setSlotDuration(Number(e.target.value))}
                      aria-label="Slot duration"
                      className="th-datetime-input min-h-11 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] focus:border-white/20 focus:outline-none"
                    >
                      <option value={30}>30 minutes</option>
                      <option value={45}>45 minutes</option>
                      <option value={60}>60 minutes</option>
                      <option value={90}>90 minutes</option>
                    </select>
                  </div>
                  <div className="flex items-center pb-1 sm:items-end">
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-[var(--text)] touch-manipulation">
                      <input
                        type="checkbox"
                        checked={weekdaysOnly}
                        onChange={(e) => setWeekdaysOnly(e.target.checked)}
                        className="size-4 shrink-0 rounded border-[var(--border)] accent-[var(--accent)]"
                      />
                      Weekdays only
                    </label>
                  </div>
                </div>
              </>
            )}

            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm font-medium text-white/60 transition hover:bg-white/[0.04] hover:text-[var(--text)] sm:flex-1 sm:py-2 touch-manipulation"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-1 sm:py-2 touch-manipulation"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    {mode === "single" ? "Create Slot" : "Generate Slots"}
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}
