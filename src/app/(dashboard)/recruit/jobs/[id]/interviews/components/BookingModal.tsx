"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Calendar, Clock, Loader2, X } from "lucide-react";
import type { InterviewBooking, PipelineStage } from "@/types";
import { type PipelineCandidate, type SlotWithStatus } from "./interviewSchedulingTypes";
import { formatDisplayDate, formatDisplayTime } from "@/lib/locale/display";

function formatTime(iso: string): string {
  return formatDisplayTime(iso);
}

function formatDate(iso: string): string {
  return formatDisplayDate(iso, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function BookingModal({
  slot,
  pipelineCandidates,
  stages,
  onClose,
  onBook,
  loading,
  errorMessage,
}: {
  slot: SlotWithStatus;
  pipelineCandidates: PipelineCandidate[];
  stages: PipelineStage[];
  onClose: () => void;
  onBook: (booking: InterviewBooking, slot: SlotWithStatus) => Promise<void>;
  loading: boolean;
  errorMessage?: string | null;
}) {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [interviewerEmail, setInterviewerEmail] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const stageInterviewerEmail = useMemo(
    () =>
      new Map(
        stages.map((stage) => [stage.id, (stage.interviewer_email ?? "").trim().toLowerCase()]),
      ),
    [stages],
  );

  useEffect(() => {
    if (!selectedCandidateId) return;
    const candidate = pipelineCandidates.find(
      (pc) => pc.id === selectedCandidateId || pc.candidate_id === selectedCandidateId,
    );
    if (!candidate?.stage_id) return;
    const defaultEmail = stageInterviewerEmail.get(candidate.stage_id) ?? "";
    if (defaultEmail && !interviewerEmail) {
      setInterviewerEmail(defaultEmail);
    }
  }, [selectedCandidateId, pipelineCandidates, stageInterviewerEmail, interviewerEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidateId) return;

    const candidate = pipelineCandidates.find(
      (pc) => pc.id === selectedCandidateId || pc.candidate_id === selectedCandidateId,
    );
    if (!candidate) return;

    await onBook(
      {
        slot_id: slot.slot_id || "",
        pipeline_candidate_id: candidate.id,
        interviewer_email: interviewerEmail.trim() || undefined,
        notes: notes.trim() || undefined,
      },
      slot,
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6">
      <div className="max-h-[min(90vh,40rem)] w-full max-w-md overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl sm:p-8">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="heading-card text-lg text-[var(--text)]">Book Interview Slot</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-white/60 transition hover:bg-white/[0.04] hover:text-[var(--text)]"
            aria-label="Close modal"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
          <div className="flex items-center gap-2 text-sm text-[var(--text)]">
            <Calendar size={16} className="text-[var(--accent)]" />
            <span>{formatDate(slot.start)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm text-white/60">
            <Clock size={16} className="text-[var(--accent)]" />
            <span>
              {formatTime(slot.start)} - {formatTime(slot.end)}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
              Select Candidate
            </label>
            <select
              value={selectedCandidateId}
              onChange={(e) => setSelectedCandidateId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-white/20 focus:outline-none"
              aria-label="Select candidate"
              required
            >
              <option value="">Choose a candidate...</option>
              {pipelineCandidates.map((pc) => (
                <option key={pc.id} value={pc.id}>
                  {pc.candidates?.name || `Candidate ${pc.candidate_id.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
              Interviewer email (optional)
            </label>
            <input
              type="email"
              value={interviewerEmail}
              onChange={(e) => setInterviewerEmail(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-white/20 focus:outline-none"
              placeholder="name@company.com"
            />
            <p className="mt-1 text-xs text-white/60">
              If provided, a calendar invite email is sent to this interviewer.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-white/20 focus:outline-none"
              placeholder="Add any notes about this interview..."
            />
          </div>

          {/* Surface the real booking error (e.g. the 409 "candidate already
              has a booked slot") inside the modal — it used to render in a top
              banner hidden behind this overlay (Scheduling #12). */}
          {errorMessage ? (
            <p
              role="alert"
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
            >
              {errorMessage}
            </p>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-white/60 transition hover:bg-white/[0.04] hover:text-[var(--text)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedCandidateId}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Booking...
                </>
              ) : (
                <>
                  <BookOpen size={16} />
                  Book Slot
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
