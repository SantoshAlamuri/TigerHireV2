"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Loader2, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import TigerHireLogo from "@/components/TigerHireLogo";
import {
  isSlotEligibleForCandidateSelfServe,
  selfServeCandidateWindowLabel,
} from "@/lib/interviews/self-serve-slot-window";

interface Slot {
  id: string;
  start_at: string;
  end_at: string;
  timezone: string;
}

export default function PublicSelfSchedulePage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === "string" ? params.token : "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [openScheduleLink, setOpenScheduleLink] = useState(false);
  const [pipelineCandidateOptions, setPipelineCandidateOptions] = useState<
    { id: string; label: string }[]
  >([]);
  const [selectedPipelineCandidateId, setSelectedPipelineCandidateId] = useState("");
  const [state, setState] = useState<{
    hasBooked: boolean;
    canReschedule: boolean;
    bookedStartAt: string | null;
    bookedSlotId: string | null;
  } | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [bookedAtPreview, setBookedAtPreview] = useState<string | null>(null);
  const [activeDayKey, setActiveDayKey] = useState<string | null>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!token) return;
      if (!options?.silent) setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/schedule/self-serve/${encodeURIComponent(token)}`, {
          credentials: "omit",
        });
        const data = (await res.json().catch(() => ({}))) as {
          jobTitle?: string;
          companyName?: string | null;
          openScheduleLink?: boolean;
          pipelineCandidateOptions?: { id: string; label: string }[];
          slots?: Slot[];
          state?: {
            hasBooked: boolean;
            canReschedule: boolean;
            bookedStartAt: string | null;
            bookedSlotId: string | null;
          };
          error?: string;
        };
        if (!res.ok) {
          setError(data.error ?? "Could not load this link.");
          return;
        }
        setJobTitle(data.jobTitle ?? "Interview");
        setCompanyName(data.companyName ?? null);
        setOpenScheduleLink(Boolean(data.openScheduleLink));
        const opts = data.pipelineCandidateOptions ?? [];
        setPipelineCandidateOptions(opts);
        setSelectedPipelineCandidateId(opts.length === 1 ? opts[0]!.id : "");
        const loaded = (data.slots ?? []).filter((s) =>
          isSlotEligibleForCandidateSelfServe(s.start_at),
        );
        setSlots(loaded);
        setState(data.state ?? null);
        const confirmedBookingAt = data.state?.bookedStartAt ?? null;
        setBookedAtPreview(confirmedBookingAt);
        setDone(Boolean(data.state?.hasBooked && confirmedBookingAt));
      } catch {
        setError("Connection issue - try again in a moment.");
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function book(slotId: string) {
    if (openScheduleLink && pipelineCandidateOptions.length > 0 && !selectedPipelineCandidateId) {
      setError("Choose who is booking below, then pick a time.");
      return;
    }
    setPicking(slotId);
    setError(null);
    try {
      const payload: { slot_id: string; pipeline_candidate_id?: string } = { slot_id: slotId };
      if (openScheduleLink && selectedPipelineCandidateId) {
        payload.pipeline_candidate_id = selectedPipelineCandidateId;
      }
      const res = await fetch(`/api/schedule/self-serve/${encodeURIComponent(token)}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "omit",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? "Booking failed");
        return;
      }
      const pickedSlot = slots.find((slot) => slot.id === slotId);
      if (pickedSlot) setBookedAtPreview(pickedSlot.start_at);
      setDone(true);
      void load({ silent: true });
    } finally {
      setPicking(null);
    }
  }

  async function reschedule(newId: string) {
    if (!state?.bookedSlotId) return;
    setPicking(newId);
    setError(null);
    try {
      const res = await fetch(`/api/schedule/self-serve/${encodeURIComponent(token)}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_slot_id: newId }),
        credentials: "omit",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? "Reschedule failed");
        return;
      }
      const pickedSlot = slots.find((slot) => slot.id === newId);
      if (pickedSlot) setBookedAtPreview(pickedSlot.start_at);
      setDone(true);
      void load({ silent: true });
    } finally {
      setPicking(null);
    }
  }

  function getDayKey(startAt: string) {
    const date = new Date(startAt);
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, "0");
    const d = `${date.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function formatDayLabel(startAt: string) {
    return new Date(startAt).toLocaleDateString("en-GB", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function formatTimeRange(slot: Slot) {
    const start = new Date(slot.start_at).toLocaleTimeString(undefined, { timeStyle: "short" });
    const end = new Date(slot.end_at).toLocaleTimeString(undefined, { timeStyle: "short" });
    return `${start} - ${end}`;
  }

  const groupedSlots = useMemo(() => {
    const map = new Map<string, { label: string; slots: Slot[] }>();
    for (const slot of slots) {
      const key = getDayKey(slot.start_at);
      const existing = map.get(key);
      if (existing) {
        existing.slots.push(slot);
      } else {
        map.set(key, { label: formatDayLabel(slot.start_at), slots: [slot] });
      }
    }
    return Array.from(map.entries());
  }, [slots]);

  useEffect(() => {
    if (!groupedSlots.length) {
      setActiveDayKey(null);
      return;
    }

    if (!activeDayKey || !groupedSlots.some(([dayKey]) => dayKey === activeDayKey)) {
      setActiveDayKey(groupedSlots[0][0]);
    }
  }, [activeDayKey, groupedSlots]);

  useEffect(() => {
    if (done && successRef.current) {
      successRef.current.focus();
    }
  }, [done]);

  if (!token) {
    return <p className="p-8 text-center text-[var(--text-muted)]">Invalid link.</p>;
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 py-10 text-[var(--text)]">
      <div className="mx-auto max-w-lg">
        <Link href="/" className="mb-8 inline-flex">
          <TigerHireLogo size="sm" />
        </Link>

        {loading ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-6">
            <div className="mb-6 flex items-center gap-3">
              <Calendar aria-hidden className="h-6 w-6 text-[var(--text-muted)]" />
              <div>
                <h1 className="text-2xl font-semibold">Finding open times...</h1>
                <p className="text-sm text-[var(--text-muted)]">This will just take a moment.</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-11 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/60" />
              <div className="h-11 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/60" />
              <div className="h-11 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/60" />
            </div>
          </div>
        ) : error ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-200"
          >
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 inline-flex rounded-md border border-red-300/30 px-3 py-1.5 text-xs font-medium text-red-100 transition hover:border-red-200/60"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-6">
            <div className="mb-6 flex items-start gap-3">
              <Calendar aria-hidden className="mt-0.5 h-6 w-6 text-[var(--text-muted)]" />
              <div>
                <h1 className="text-2xl font-semibold">
                  Pick a time for your {jobTitle} interview
                </h1>
                <p className="text-sm text-[var(--text-muted)]">
                  {companyName
                    ? `Interview with ${companyName}`
                    : "Interview booking powered by TigerHire"}
                </p>
              </div>
            </div>

            <p className="mb-4 text-xs text-[var(--text-muted)]">
              Times shown in your timezone ({localTimezone}). You can book a slot in{" "}
              {selfServeCandidateWindowLabel()} only.
            </p>

            {openScheduleLink && pipelineCandidateOptions.length > 0 && !state?.hasBooked ? (
              <div className="mb-4">
                <label
                  htmlFor="self-schedule-who"
                  className="mb-1.5 block text-sm font-medium text-[var(--text)]"
                >
                  Who is booking?
                </label>
                <select
                  id="self-schedule-who"
                  value={selectedPipelineCandidateId}
                  onChange={(e) => setSelectedPipelineCandidateId(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm text-[var(--text)]"
                >
                  <option value="">Select your name…</option>
                  {pipelineCandidateOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                  This link is shared with multiple applicants — only the first successful booking
                  keeps the slot; everyone else will see that this link is already used.
                </p>
              </div>
            ) : null}

            {openScheduleLink && pipelineCandidateOptions.length === 0 && !state?.hasBooked ? (
              <p className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-100/95">
                No applicants are on this job&apos;s pipeline yet, so scheduling isn&apos;t ready.
                Ask the hiring team to add you to the job first, then use a new link.
              </p>
            ) : null}

            <p className="mb-4 text-xs text-amber-200/90">
              You can change your interview time once after booking.
            </p>

            {done && (state?.bookedStartAt ?? bookedAtPreview) && (
              <div
                ref={successRef}
                tabIndex={-1}
                role="status"
                aria-live="polite"
                className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-100 outline-none"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">You&apos;re booked</p>
                  <p className="text-emerald-200/90">
                    {new Date(state?.bookedStartAt ?? bookedAtPreview ?? "").toLocaleString(
                      undefined,
                      {
                        dateStyle: "full",
                        timeStyle: "short",
                      },
                    )}
                  </p>
                  <p className="mt-1 text-xs text-emerald-100/90">
                    We&apos;ll send your interview invite and details shortly.
                  </p>
                </div>
              </div>
            )}

            {slots.length === 0 && !state?.canReschedule ? (
              <p className="text-sm text-[var(--text-muted)]">
                No open times in {selfServeCandidateWindowLabel()} right now. The hiring team will
                add more slots or reach out shortly.
              </p>
            ) : state?.hasBooked && !state?.canReschedule ? (
              <p className="text-sm text-[var(--text-muted)]">
                Your interview is confirmed. If you need help, please reply on WhatsApp and our team
                will assist.
              </p>
            ) : openScheduleLink &&
              pipelineCandidateOptions.length === 0 &&
              !state?.hasBooked ? null : (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
                  {groupedSlots.map(([dayKey, dayGroup]) => (
                    <button
                      type="button"
                      key={dayKey}
                      onClick={() => setActiveDayKey(dayKey)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        activeDayKey === dayKey
                          ? "border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--text)]"
                          : "border-[var(--border-interactive)] bg-[var(--bg-elevated)]/60 text-[var(--text-muted)] hover:border-[var(--accent)]"
                      }`}
                    >
                      {dayGroup.label}
                    </button>
                  ))}
                </div>

                <ul className="space-y-2">
                  {(
                    groupedSlots.find(([dayKey]) => dayKey === activeDayKey)?.[1].slots ?? slots
                  ).map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        disabled={
                          Boolean(picking) ||
                          (openScheduleLink &&
                            pipelineCandidateOptions.length > 0 &&
                            !selectedPipelineCandidateId)
                        }
                        aria-disabled={
                          Boolean(picking) ||
                          (openScheduleLink &&
                            pipelineCandidateOptions.length > 0 &&
                            !selectedPipelineCandidateId)
                        }
                        aria-label={`Book interview on ${new Date(s.start_at).toLocaleDateString("en-GB", { dateStyle: "full" })} at ${new Date(s.start_at).toLocaleTimeString(undefined, { timeStyle: "short" })}`}
                        onClick={() =>
                          state?.hasBooked && state?.canReschedule ? reschedule(s.id) : book(s.id)
                        }
                        className="flex w-full items-center justify-between rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-elevated)]/80 px-4 py-3 text-left text-sm transition hover:border-[var(--accent)] disabled:cursor-wait"
                      >
                        <span>{formatTimeRange(s)}</span>
                        {picking === s.id ? (
                          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                        ) : (
                          <span className="text-xs font-medium text-[var(--accent)]">
                            {state?.hasBooked && state?.canReschedule ? "Reschedule" : "Book"}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          Powered by TigerHire ·{" "}
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
        </p>
      </div>
    </div>
  );
}
