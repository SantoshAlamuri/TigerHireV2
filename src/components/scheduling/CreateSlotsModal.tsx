"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Loader2, Plus, X } from "lucide-react";
import { SLOT_BOOKABLE_BY_LABELS, type SlotBookableBy } from "@/lib/interviews/slot-bookable-by";
import {
  SELF_SERVE_CANDIDATE_WINDOW_DAYS,
  toDateInputMin,
  toDatetimeLocalMin,
} from "@/lib/interviews/self-serve-slot-window";
import type { CreateSlotsPayload, MeetingProvider } from "./create-slots-types";

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
  signedInUserId,
  ownerOptions,
  jobOptions,
  jobId,
  onJobIdChange,
  jobsLoading = false,
  errorMessage,
  interviewerPicker,
  interviewerPickerEnabled = true,
  preferInterviewerMode = false,
  onBulkFromWindows,
}: {
  onClose: () => void;
  onCreate: (payload: CreateSlotsPayload) => Promise<void>;
  loading: boolean;
  jobTitle: string;
  signedInAsLabel: string;
  signedInUserId: string;
  ownerOptions?: Array<{ id: string; label: string }>;
  /** When set, user picks a job inside the modal (e.g. org Calendar). */
  jobOptions?: Array<{ id: string; title: string }>;
  jobId?: string;
  onJobIdChange?: (id: string) => void;
  jobsLoading?: boolean;
  errorMessage?: string | null;
  interviewerPicker?: React.ReactNode;
  interviewerPickerEnabled?: boolean;
  preferInterviewerMode?: boolean;
  onBulkFromWindows?: () => Promise<void>;
}) {
  const needsJobPick = jobOptions !== undefined;
  const jobSelected = !needsJobPick || Boolean(jobId);
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
  const [bookableBy, setBookableBy] = useState<SlotBookableBy>("both");
  const [ownerUserId, setOwnerUserId] = useState(signedInUserId);
  const [startAt, setStartAt] = useState(toLocalDatetimeValue(now));
  const [endAt, setEndAt] = useState(toLocalDatetimeValue(defaultEnd));
  const minDatetimeLocal = toDatetimeLocalMin(now);
  const minDateInput = toDateInputMin(now);
  const [batchDate, setBatchDate] = useState(minDateInput);
  const [batchStartHour, setBatchStartHour] = useState("09:00");
  const [batchEndHour, setBatchEndHour] = useState("17:00");
  const [slotDuration, setSlotDuration] = useState(60);
  const [weekdaysOnly, setWeekdaysOnly] = useState(true);
  const [numDays, setNumDays] = useState(5);
  const [bulkWindowsLoading, setBulkWindowsLoading] = useState(false);
  const [meetingUrl, setMeetingUrl] = useState("");
  const [meetingProvider, setMeetingProvider] = useState<MeetingProvider | "">("");

  const meetingFields = (): Pick<
    CreateSlotsPayload["slots"][number],
    "meeting_url" | "meeting_provider"
  > => {
    const url = meetingUrl.trim();
    if (!url) return {};
    return { meeting_url: url, ...(meetingProvider ? { meeting_provider: meetingProvider } : {}) };
  };

  useEffect(() => {
    setOwnerUserId(signedInUserId);
  }, [signedInUserId]);

  useEffect(() => {
    if (preferInterviewerMode && interviewerPickerEnabled && interviewerPicker) {
      setMode("from_interviewer");
    }
  }, [preferInterviewerMode, interviewerPickerEnabled, interviewerPicker]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const buildPayload = (slots: CreateSlotsPayload["slots"]): CreateSlotsPayload => ({
    slots,
    bookable_by: bookableBy,
    owner_user_id: ownerUserId !== signedInUserId ? ownerUserId : undefined,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "single") {
      const start = new Date(startAt);
      const end = new Date(endAt);
      if (start.getTime() < Date.now()) {
        return;
      }
      await onCreate(
        buildPayload([
          {
            start_at: start.toISOString(),
            end_at: end.toISOString(),
            ...meetingFields(),
          },
        ]),
      );
      return;
    }

    const slots: CreateSlotsPayload["slots"] = [];
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
        if (slotStart.getTime() < Date.now()) {
          currentMinute += slotDuration;
          continue;
        }
        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + slotDuration);
        slots.push({
          start_at: slotStart.toISOString(),
          end_at: slotEnd.toISOString(),
          ...meetingFields(),
        });
        currentMinute += slotDuration;
      }
    }

    if (slots.length === 0) return;
    await onCreate(buildPayload(slots));
  };

  const bookingOptions = (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]/40 p-3">
      <div>
        <label
          className="mb-1.5 block text-sm font-medium text-[var(--text)]"
          htmlFor="bookable-by"
        >
          Who can book these slots?
        </label>
        <select
          id="bookable-by"
          value={bookableBy}
          onChange={(e) => setBookableBy(e.target.value as SlotBookableBy)}
          className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
        >
          {(Object.keys(SLOT_BOOKABLE_BY_LABELS) as SlotBookableBy[]).map((key) => (
            <option key={key} value={key}>
              {SLOT_BOOKABLE_BY_LABELS[key]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-white/55">
          {bookableBy === "candidate" &&
            "Shown on the self-schedule link and WhatsApp slot picker; your team can still book manually."}
          {bookableBy === "interviewer" &&
            "Hidden from candidates — only your team books these in TigerHire."}
          {bookableBy === "both" &&
            "Candidates can pick via self-schedule; recruiters can book pipeline candidates too."}
          {(bookableBy === "candidate" || bookableBy === "both") && (
            <span className="mt-1 block">
              On the self-schedule link, candidates only see open times in the next{" "}
              {SELF_SERVE_CANDIDATE_WINDOW_DAYS} days (today included).
            </span>
          )}
        </p>
      </div>
      {ownerOptions && ownerOptions.length > 1 && (
        <div>
          <label
            className="mb-1.5 block text-sm font-medium text-[var(--text)]"
            htmlFor="slot-owner"
          >
            Slot owner (interviewer on invite)
          </label>
          <select
            id="slot-owner"
            value={ownerUserId}
            onChange={(e) => setOwnerUserId(e.target.value)}
            className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
          >
            {ownerOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );

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

        {errorMessage ? (
          <p
            className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}

        <div className="mb-4 space-y-3 rounded-lg border border-[var(--accent)]/25 bg-[var(--accent)]/[0.07] px-3 py-2.5 text-sm text-white/80">
          {needsJobPick ? (
            <div>
              <label className="mb-1.5 block font-medium text-[var(--text)]" htmlFor="slot-job">
                Job
              </label>
              <select
                id="slot-job"
                value={jobId ?? ""}
                onChange={(e) => onJobIdChange?.(e.target.value)}
                disabled={jobsLoading}
                className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-60"
              >
                <option value="">{jobsLoading ? "Loading jobs…" : "Select a job…"}</option>
                {jobOptions?.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <p className="font-medium text-[var(--text)]">Job</p>
              <p className="mt-0.5 text-white/70">{jobTitle}</p>
            </div>
          )}
          {jobSelected ? (
            <div>
              <p className="font-medium text-[var(--text)]">Your session</p>
              <p className="mt-0.5 text-white/70">{signedInAsLabel}</p>
            </div>
          ) : null}
        </div>

        {!jobSelected ? (
          <p className="mb-4 text-sm text-white/55">
            Select a job to add times and choose who can book.
          </p>
        ) : (
          <>
            {bookingOptions}

            <div className="mb-4 mt-4 flex flex-wrap gap-2">
              {interviewerPicker && (
                <button
                  type="button"
                  disabled={!interviewerPickerEnabled}
                  title={
                    interviewerPickerEnabled
                      ? undefined
                      : "No interviewer availability declared. Ask interviewers to add windows at My availability."
                  }
                  onClick={() => interviewerPickerEnabled && setMode("from_interviewer")}
                  className={`min-h-10 flex-1 rounded-lg px-3 py-2 text-sm font-medium transition sm:flex-none touch-manipulation disabled:cursor-not-allowed disabled:opacity-40 ${
                    mode === "from_interviewer"
                      ? "bg-[var(--accent)] text-black"
                      : "bg-[var(--surface)] text-white/60 hover:text-[var(--text)]"
                  }`}
                >
                  From availability
                </button>
              )}
              <button
                type="button"
                onClick={() => setMode("single")}
                className={`min-h-10 flex-1 rounded-lg px-3 py-2 text-sm font-medium transition sm:flex-none touch-manipulation ${
                  mode === "single"
                    ? "bg-[var(--accent)] text-black"
                    : "bg-[var(--surface)] text-white/60 hover:text-[var(--text)]"
                }`}
              >
                Single
              </button>
              <button
                type="button"
                onClick={() => setMode("batch")}
                className={`min-h-10 flex-1 rounded-lg px-3 py-2 text-sm font-medium transition sm:flex-none touch-manipulation ${
                  mode === "batch"
                    ? "bg-[var(--accent)] text-black"
                    : "bg-[var(--surface)] text-white/60 hover:text-[var(--text)]"
                }`}
              >
                Bulk generate
              </button>
            </div>

            {mode === "from_interviewer" ? (
              <div className="space-y-4">
                <p className="text-sm text-white/65">
                  Pick one window for a single slot, or bulk-generate 60-minute slots from every
                  declared window below.
                </p>
                {onBulkFromWindows && (
                  <button
                    type="button"
                    disabled={bulkWindowsLoading || loading}
                    onClick={async () => {
                      setBulkWindowsLoading(true);
                      try {
                        await onBulkFromWindows();
                      } finally {
                        setBulkWindowsLoading(false);
                      }
                    }}
                    className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/15 disabled:opacity-50"
                  >
                    {bulkWindowsLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Plus size={16} />
                    )}
                    Bulk: 60-min slots from all windows
                  </button>
                )}
                {interviewerPicker}
                <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm font-medium text-white/60 sm:flex-1 touch-manipulation"
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
                        Start time
                      </label>
                      <input
                        type="datetime-local"
                        value={startAt}
                        min={minDatetimeLocal}
                        onChange={(e) => setStartAt(e.target.value)}
                        className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                        End time
                      </label>
                      <input
                        type="datetime-local"
                        value={endAt}
                        min={minDatetimeLocal}
                        onChange={(e) => setEndAt(e.target.value)}
                        className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                        required
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                          Starting date
                        </label>
                        <input
                          type="date"
                          value={batchDate}
                          min={minDateInput}
                          onChange={(e) => setBatchDate(e.target.value)}
                          className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                          Number of days
                        </label>
                        <input
                          type="number"
                          value={numDays}
                          onChange={(e) => setNumDays(Number(e.target.value))}
                          min={1}
                          max={30}
                          className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                          Day start
                        </label>
                        <input
                          type="time"
                          value={batchStartHour}
                          onChange={(e) => setBatchStartHour(e.target.value)}
                          className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                          Day end
                        </label>
                        <input
                          type="time"
                          value={batchEndHour}
                          onChange={(e) => setBatchEndHour(e.target.value)}
                          className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                          Slot duration
                        </label>
                        <select
                          value={slotDuration}
                          onChange={(e) => setSlotDuration(Number(e.target.value))}
                          className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                        >
                          <option value={30}>30 minutes</option>
                          <option value={45}>45 minutes</option>
                          <option value={60}>60 minutes</option>
                          <option value={90}>90 minutes</option>
                        </select>
                      </div>
                      <div className="flex items-end pb-1">
                        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                          <input
                            type="checkbox"
                            checked={weekdaysOnly}
                            onChange={(e) => setWeekdaysOnly(e.target.checked)}
                            className="size-4 accent-[var(--accent)]"
                          />
                          Weekdays only
                        </label>
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)]/40 p-3">
                  <label
                    className="block text-sm font-medium text-[var(--text)]"
                    htmlFor="meeting-url"
                  >
                    Meeting link <span className="font-normal text-white/45">(optional)</span>
                  </label>
                  <input
                    id="meeting-url"
                    type="url"
                    value={meetingUrl}
                    onChange={(e) => setMeetingUrl(e.target.value)}
                    placeholder="https://meet.google.com/abc-defg-hij"
                    className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                  />
                  {meetingUrl.trim() ? (
                    <select
                      aria-label="Meeting platform"
                      value={meetingProvider}
                      onChange={(e) => setMeetingProvider(e.target.value as MeetingProvider | "")}
                      className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                    >
                      <option value="">Platform: auto-detect</option>
                      <option value="meet">Google Meet</option>
                      <option value="zoom">Zoom</option>
                      <option value="teams">Microsoft Teams</option>
                      <option value="other">Other</option>
                    </select>
                  ) : null}
                  <p className="text-xs text-white/55">
                    Add a join link and the AI notetaker will join this interview to record and
                    summarise it. Leave blank for no notetaker.
                  </p>
                </div>

                <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm font-medium text-white/60 sm:flex-1 touch-manipulation"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50 sm:flex-1 touch-manipulation"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus size={16} />
                        {mode === "single" ? "Create slot" : "Generate slots"}
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}
