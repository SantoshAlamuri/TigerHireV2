"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Calendar,
  CalendarPlus,
  CalendarClock,
  Clock,
  User,
  X,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Link2,
  XCircle,
  ChevronDown,
  Trash2,
  HelpCircle,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { invalidateQueries, useApiQuery, useOptimisticMutation } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getInterviewSlotTone } from "@/lib/status-tones";
import type { InterviewBooking, PipelineStage } from "@/types";
import { Skeleton } from "@/components/ui/Skeleton";
import { BookingModal } from "./components/BookingModal";
import { CreateSlotsModal } from "@/components/scheduling/CreateSlotsModal";
import type { CreateSlotsPayload } from "@/components/scheduling/create-slots-types";
import { SchedulingQuickGuide } from "@/components/scheduling/SchedulingQuickGuide";
import { InviteDeliveryBanner } from "./components/InviteDeliveryBanner";
import { deliveryFieldsFromRow } from "@/lib/interviews/delivery-status";
import {
  InterviewerAvailabilityPicker,
  type InterviewerDeclaredWindow,
} from "./components/InterviewerAvailabilityPicker";
import { type PipelineCandidate, type SlotWithStatus } from "./components/interviewSchedulingTypes";
import { hasInterviewerAssignment, isInterviewLikeStage } from "@/lib/pipeline/stage-interviewer";
import {
  DISPLAY_TIMEZONE_LABEL,
  formatDisplayDate,
  formatDisplayTime,
  getBrowserTimezoneLabel,
} from "@/lib/locale/display";
import { generateSlotsFromWindow } from "@/lib/interviews/generate-slots-from-window";

function formatTime(iso: string): string {
  return formatDisplayTime(iso);
}

function toICSUTC(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function googleCalendarUrl(
  title: string,
  start: string,
  end: string,
  description?: string,
): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toICSUTC(start)}/${toICSUTC(end)}`,
  });
  if (description) params.set("details", description);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function outlookCalendarUrl(title: string, start: string, end: string): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: title,
    startdt: new Date(start).toISOString(),
    enddt: new Date(end).toISOString(),
  });
  return `https://outlook.live.com/owa/0/action/compose?${params.toString()}`;
}

function formatDate(iso: string): string {
  return formatDisplayDate(iso, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function groupSlotsByDay(slots: SlotWithStatus[]): Map<string, SlotWithStatus[]> {
  const grouped = new Map<string, SlotWithStatus[]>();
  for (const slot of slots) {
    const dateKey = new Date(slot.start).toISOString().split("T")[0];
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
    }
    grouped.get(dateKey)!.push(slot);
  }
  return grouped;
}

/* ─── Main Page ─── */

interface BookedEventInfo {
  slotId: string;
  start: string;
  end: string;
  title: string;
}

export default function InterviewSchedulingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user: authUser } = useAuth();
  const [selectedSlot, setSelectedSlot] = useState<SlotWithStatus | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pickFromInterviewerAvailability, setPickFromInterviewerAvailability] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastBookedEvent, setLastBookedEvent] = useState<BookedEventInfo | null>(null);
  const [calendarDropdownOpen, setCalendarDropdownOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "available" | "booked">("all");
  const [showHelp, setShowHelp] = useState(false);
  const [rescheduleFromSlot, setRescheduleFromSlot] = useState<SlotWithStatus | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [copySelfScheduleLoading, setCopySelfScheduleLoading] = useState(false);
  const [resendSlotId, setResendSlotId] = useState<string | null>(null);

  const { data: jobData, loading: jobLoading } = useApiQuery<{
    job: { id: string; title: string };
  }>(id ? `/api/jobs/${id}` : null);

  // Fetch all slots (both available and booked)
  const availabilityQuery = useMemo(() => {
    if (!id) return null;
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString();
    return `/api/jobs/${id}/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  }, [id]);

  const {
    data: availabilityData,
    loading: slotsLoading,
    refetch: refetchSlots,
    mergeData: mergeSlotsData,
  } = useApiQuery<{
    slots: Array<{
      id: string;
      start_at: string;
      end_at: string;
      status?: string;
      pipeline_candidate_id?: string | null;
      user_id?: string | null;
      slot_owner?: { id: string; display_name: string | null } | null;
      candidate_email_status?: string | null;
      interviewer_email_status?: string | null;
      candidate_whatsapp_status?: string | null;
      last_delivery_attempt_at?: string | null;
    }>;
  }>(availabilityQuery, undefined, { cacheTtlMs: 15_000 });

  const { data: stagesData } = useApiQuery<{ stages: PipelineStage[] }>(
    id ? `/api/jobs/${id}/pipeline-stages` : null,
  );

  const { data: interviewerAvailabilityData, loading: interviewerAvailabilityLoading } =
    useApiQuery<{
      windows: InterviewerDeclaredWindow[];
      has_declared_availability: boolean;
      scope?: "job_assigned" | "organisation";
      assigned_interviewer_count?: number;
    }>(id ? `/api/jobs/${id}/interviewer-availability` : null);

  const myAvailabilityHref =
    authUser?.role === "recruiter" ? "/recruit/my-availability" : "/company/my-availability";

  const { data: pipelineData } = useApiQuery<{ pipeline: PipelineCandidate[] }>(
    id ? `/api/my-pipeline` : null,
  );

  const jobPipelineCandidates = useMemo(() => {
    if (!pipelineData?.pipeline || !id) return [];
    return pipelineData.pipeline.filter(
      (pc: PipelineCandidate & { job_id?: string }) => pc.job_id === id,
    );
  }, [pipelineData, id]);

  /** Interview-typed stages missing interviewer — suggest Hiring setup, not “add stage”. */
  const interviewRoundsMissingInterviewer = useMemo(() => {
    const stages = stagesData?.stages ?? [];
    return stages.filter(
      (s) =>
        isInterviewLikeStage(s.stage_type) &&
        !hasInterviewerAssignment({
          interviewer_user_id: s.interviewer_user_id,
          interviewer_email: s.interviewer_email,
          interviewer_name: s.interviewer_name,
        }),
    );
  }, [stagesData]);

  const enrichedSlots = useMemo(() => {
    if (!availabilityData?.slots) return [];
    return availabilityData.slots.map((slot) => {
      const ownerId = slot.user_id ?? slot.slot_owner?.id ?? null;
      const ownerName =
        slot.slot_owner?.display_name?.trim() ||
        (ownerId && ownerId === authUser?.id ? authUser?.name?.trim() || null : null) ||
        null;
      return {
        id: slot.id,
        slot_id: slot.id,
        start: slot.start_at,
        end: slot.end_at,
        status: (slot.status || "available") as "available" | "booked",
        pipeline_candidate_id: slot.pipeline_candidate_id,
        interviewer_email: null,
        slot_owner_id: ownerId,
        slot_owner_name: ownerName,
        ...deliveryFieldsFromRow(slot),
      } satisfies SlotWithStatus;
    });
  }, [availabilityData, authUser?.id, authUser?.name]);

  const filteredSlots = useMemo(() => {
    if (filterStatus === "all") return enrichedSlots;
    return enrichedSlots.filter((s) => s.status === filterStatus);
  }, [enrichedSlots, filterStatus]);

  const groupedSlots = useMemo(() => groupSlotsByDay(filteredSlots), [filteredSlots]);

  const slotCounts = useMemo(() => {
    const available = enrichedSlots.filter((s) => s.status === "available").length;
    const booked = enrichedSlots.filter((s) => s.status === "booked").length;
    return { available, booked, total: available + booked };
  }, [enrichedSlots]);

  // Mutations
  const {
    mutate: bookInterview,
    loading: bookingLoading,
    error: bookingError,
  } = useOptimisticMutation<
    {
      slot_id: string;
      pipeline_candidate_id: string;
      interview_scheduled_at: string;
      has_delivery_failure?: boolean;
      failed_channels?: string[];
    },
    InterviewBooking
  >(`/api/jobs/${id}/interviews/book`);

  const { mutate: cancelInterview, loading: cancelingLoading } = useOptimisticMutation<
    { success: boolean },
    { slot_id: string }
  >(`/api/jobs/${id}/interviews/cancel`);

  const { mutate: createSlots, loading: creatingLoading } = useOptimisticMutation<
    { slots: Array<{ id: string }> },
    CreateSlotsPayload
  >(`/api/jobs/${id}/availability`);

  const { data: slotOwnerProfilesData } = useApiQuery<{
    profiles: Array<{ id: string; full_name: string | null; email: string }>;
  }>(id ? `/api/jobs/${id}/interviewer-profile-options` : null);

  const { mutate: deleteSlot, loading: deletingLoading } = useOptimisticMutation<
    { success: boolean },
    { slot_id: string }
  >(`/api/jobs/${id}/availability`, { method: "DELETE" });

  const handleBook = useCallback(
    async (booking: InterviewBooking, slot: SlotWithStatus) => {
      setActionError(null);
      setSuccessMessage(null);
      setLastBookedEvent(null);
      const result = await bookInterview(booking);
      const payload = result as {
        slot_id?: string;
        pipeline_candidate_id?: string;
        has_delivery_failure?: boolean;
        failed_channels?: string[];
      } | null;
      const slotId = payload?.slot_id;
      const pipelineCandidateId = booking.pipeline_candidate_id ?? payload?.pipeline_candidate_id;
      if (slotId) {
        if (payload?.has_delivery_failure) {
          setSuccessMessage(
            `Interview booked, but invites failed (${(payload.failed_channels ?? []).join(", ")}). Use Resend invites on the slot.`,
          );
        } else {
          setSuccessMessage("Interview booked successfully!");
        }
        setFilterStatus("all");
        setLastBookedEvent({
          slotId,
          start: slot.start,
          end: slot.end,
          title: jobData?.job?.title ? `Interview - ${jobData.job.title}` : "Interview",
        });
        setSelectedSlot(null);
        mergeSlotsData((prev) => {
          if (!prev?.slots) return prev ?? { slots: [] };
          return {
            slots: prev.slots.map((s) =>
              s.id === slotId
                ? {
                    ...s,
                    status: "booked",
                    pipeline_candidate_id: pipelineCandidateId ?? s.pipeline_candidate_id,
                  }
                : s,
            ),
          };
        });
        if (id) invalidateQueries(`/api/jobs/${id}/availability`);
        await refetchSlots({ silent: true });
        setTimeout(() => {
          setSuccessMessage(null);
          setLastBookedEvent(null);
          setCalendarDropdownOpen(false);
        }, 12000);
      } else {
        setActionError("Failed to book interview. Please try again.");
      }
    },
    [bookInterview, refetchSlots, mergeSlotsData, jobData, id],
  );

  const handleResendInvites = useCallback(
    async (slotId: string) => {
      setActionError(null);
      setResendSlotId(slotId);
      try {
        const res = await fetch(
          `/api/interview-slots/${encodeURIComponent(slotId)}/resend-invites`,
          {
            method: "POST",
            credentials: "include",
          },
        );
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          has_delivery_failure?: boolean;
          failed_channels?: string[];
        };
        if (!res.ok) {
          setActionError(data.error ?? "Failed to resend invites");
          return;
        }
        if (data.has_delivery_failure) {
          setSuccessMessage(
            `Some invites still failed: ${(data.failed_channels ?? []).join(", ")}`,
          );
        } else {
          setSuccessMessage("Invites resent successfully.");
        }
        await refetchSlots();
        setTimeout(() => setSuccessMessage(null), 8000);
      } catch {
        setActionError("Failed to resend invites");
      } finally {
        setResendSlotId(null);
      }
    },
    [refetchSlots],
  );

  const handleCancel = useCallback(
    async (slotId: string) => {
      if (!confirm("Are you sure you want to cancel this interview?")) return;
      setActionError(null);
      setSuccessMessage(null);
      const result = await cancelInterview({ slot_id: slotId });
      if (result) {
        setSuccessMessage("Interview cancelled successfully!");
        await refetchSlots();
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setActionError("Failed to cancel interview. Please try again.");
      }
    },
    [cancelInterview, refetchSlots],
  );

  const handleCreateSlots = useCallback(
    async (payload: CreateSlotsPayload) => {
      setActionError(null);
      const defaultSource = payload.slots.some((s) => s.source === "interviewer_declared")
        ? "interviewer_declared"
        : "recruiter_manual";
      const result = await createSlots({
        ...payload,
        source: payload.source ?? defaultSource,
      });
      if (result) {
        setSuccessMessage(
          `Created ${result.slots?.length ?? payload.slots.length} slot${(result.slots?.length ?? payload.slots.length) > 1 ? "s" : ""} successfully!`,
        );
        setShowCreateModal(false);
        await refetchSlots();
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setActionError("Failed to create slots. Please try again.");
      }
    },
    [createSlots, refetchSlots],
  );

  const handleBulkFromInterviewerWindows = useCallback(async () => {
    const windows = interviewerAvailabilityData?.windows ?? [];
    const now = Date.now();
    const slots = windows.flatMap((w) => {
      if (new Date(w.ends_at).getTime() <= now) return [];
      return generateSlotsFromWindow(w.starts_at, w.ends_at).map((s) => ({
        ...s,
        source: "interviewer_declared" as const,
      }));
    });
    if (slots.length === 0) {
      setActionError("No future availability windows to convert into slots.");
      return;
    }
    await handleCreateSlots({
      slots,
      source: "interviewer_declared",
    });
  }, [interviewerAvailabilityData?.windows, handleCreateSlots]);

  const handleDeleteSlot = useCallback(
    async (slotId: string) => {
      if (!confirm("Delete this available slot?")) return;
      setActionError(null);
      const result = await deleteSlot({ slot_id: slotId });
      if (result) {
        await refetchSlots();
      } else {
        setActionError("Failed to delete slot.");
      }
    },
    [deleteSlot, refetchSlots],
  );

  const handleCopySelfScheduleLink = useCallback(async () => {
    if (!id) {
      setActionError("Job is not loaded yet.");
      return;
    }
    setActionError(null);
    setCopySelfScheduleLoading(true);
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(id)}/interviews/self-schedule-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        url?: string;
        expiresAt?: string;
        data?: { url: string; expiresAt: string };
      };
      if (!res.ok) {
        setActionError(data.error ?? "Could not create schedule link");
        return;
      }
      const linkUrl = data.data?.url ?? data.url;
      const expiresAt = data.data?.expiresAt ?? data.expiresAt;
      if (!linkUrl) {
        setActionError("Invalid response from server");
        return;
      }
      const hours =
        expiresAt && !Number.isNaN(new Date(String(expiresAt)).getTime())
          ? Math.max(
              1,
              Math.round((new Date(String(expiresAt)).getTime() - Date.now()) / 3_600_000),
            )
          : 168;
      try {
        await navigator.clipboard.writeText(linkUrl);
      } catch {
        setActionError("Could not copy to clipboard. Copy the link manually: " + linkUrl);
        return;
      }
      setSuccessMessage(`Link copied — expires in ${hours} hours`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch {
      setActionError("Could not create schedule link");
    } finally {
      setCopySelfScheduleLoading(false);
    }
  }, [id]);

  const handleReschedule = useCallback(
    async (slotId: string, newSlotId: string) => {
      if (!id || slotId === newSlotId) return;
      setActionError(null);
      setRescheduleLoading(true);
      try {
        const res = await fetch(`/api/jobs/${id}/interviews/reschedule`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slot_id: slotId, new_slot_id: newSlotId }),
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setSuccessMessage("Interview rescheduled successfully!");
          setRescheduleFromSlot(null);
          await refetchSlots();
          setTimeout(() => setSuccessMessage(null), 3000);
        } else {
          setActionError((data as { error?: string }).error ?? "Failed to reschedule.");
        }
      } catch {
        setActionError("Failed to reschedule. Please try again.");
      } finally {
        setRescheduleLoading(false);
      }
    },
    [id, refetchSlots],
  );

  const availableSlotsForReschedule = useMemo(
    () =>
      rescheduleFromSlot
        ? enrichedSlots.filter(
            (s) =>
              s.status === "available" &&
              (s.slot_id || s.id) !== (rescheduleFromSlot.slot_id || rescheduleFromSlot.id),
          )
        : [],
    [enrichedSlots, rescheduleFromSlot],
  );

  const job = jobData?.job;
  const loading = jobLoading || slotsLoading;
  const createSlotsSignedInAsLabel = useMemo(() => {
    if (!authUser) return "Loading session…";
    const name = authUser.name?.trim();
    const email = authUser.email?.trim();
    if (name && email && name.toLowerCase() !== email.toLowerCase()) {
      return `${name} · ${email}`;
    }
    return name || email || "Your account";
  }, [authUser]);

  const slotOwnerOptions = useMemo(() => {
    const self = authUser?.id
      ? [{ id: authUser.id, label: `${createSlotsSignedInAsLabel} (you)` }]
      : [];
    const fromApi = (slotOwnerProfilesData?.profiles ?? [])
      .filter((p) => p.id !== authUser?.id)
      .map((p) => ({
        id: p.id,
        label: p.full_name?.trim() || p.email || p.id,
      }));
    return [...self, ...fromApi];
  }, [authUser, createSlotsSignedInAsLabel, slotOwnerProfilesData?.profiles]);

  const browserTz = getBrowserTimezoneLabel();

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h2 className="heading-section text-lg text-[var(--text)]">Interview scheduling</h2>
          <p className="mt-1 max-w-2xl text-sm text-white/60">
            {job
              ? `Open time windows for ${job.title}, then book candidates or send a self-schedule link.`
              : "Loading job…"}
          </p>
          <p className="mt-1 text-xs text-white/50">
            Create slots in your browser timezone{browserTz ? ` (${browserTz})` : ""}. Confirmed
            times and invites show in {DISPLAY_TIMEZONE_LABEL}.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <label
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm ${
              interviewerAvailabilityData?.has_declared_availability
                ? "border-[var(--border)] text-white/80"
                : "cursor-not-allowed border-[var(--border)]/60 text-white/40"
            }`}
            title={
              interviewerAvailabilityData?.has_declared_availability
                ? interviewerAvailabilityData.scope === "organisation"
                  ? "Opens Create Slots on org-wide declared availability (no interviewers assigned on this job yet)"
                  : "Opens Create Slots on declared availability for interviewers on this job"
                : `No one has declared future availability. Add windows under My availability (${myAvailabilityHref}) or assign interviewers in Hiring setup.`
            }
          >
            <input
              type="checkbox"
              className="size-4 accent-[var(--accent)]"
              checked={pickFromInterviewerAvailability}
              disabled={!interviewerAvailabilityData?.has_declared_availability}
              onChange={(e) => setPickFromInterviewerAvailability(e.target.checked)}
            />
            Pick from interviewer availability
          </label>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] sm:w-auto sm:py-2 touch-manipulation"
          >
            <CalendarPlus size={16} />
            Create Slots
          </button>
        </div>
      </div>

      {id && interviewRoundsMissingInterviewer.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-sm text-white/80">
          <p className="font-medium text-amber-200/95">
            Optional: assign who runs each interview round
          </p>
          <p className="mt-1 text-white/65">
            {interviewRoundsMissingInterviewer.length} interview{" "}
            {interviewRoundsMissingInterviewer.length === 1 ? "round has" : "rounds have"} no
            interviewer yet. That does not block booking — it only improves calendar invites and
            routing. Set people on existing rounds in{" "}
            <Link
              href={`/recruit/jobs/${id}/pipeline-stages`}
              className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Hiring setup
            </Link>
            . You do <em>not</em> need to add new stages just to schedule.
          </p>
        </div>
      )}

      {id && (
        <SchedulingQuickGuide
          jobId={id}
          availableSlotCount={slotCounts.available}
          onCreateSlots={() => setShowCreateModal(true)}
          onCopyJobLink={() => void handleCopySelfScheduleLink()}
          copyJobLinkLoading={copySelfScheduleLoading}
        />
      )}
      {actionError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">
          <AlertCircle size={16} />
          {actionError}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-400">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{successMessage}</span>
          {lastBookedEvent && id && (
            <div className="relative ml-2 inline-block">
              <button
                type="button"
                onClick={() => setCalendarDropdownOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-300 transition hover:bg-emerald-500/20"
                aria-expanded={calendarDropdownOpen ? "true" : "false"}
                aria-haspopup="true"
              >
                <CalendarPlus size={14} />
                Add to Calendar
                <ChevronDown size={14} className={calendarDropdownOpen ? "rotate-180" : ""} />
              </button>
              {calendarDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    aria-hidden="true"
                    onClick={() => setCalendarDropdownOpen(false)}
                  />
                  <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg">
                    <a
                      href={`/api/jobs/${id}/interviews/ics?slot_id=${encodeURIComponent(lastBookedEvent.slotId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-white/[0.04]"
                      onClick={() => setCalendarDropdownOpen(false)}
                    >
                      Download .ics
                    </a>
                    <a
                      href={googleCalendarUrl(
                        lastBookedEvent.title,
                        lastBookedEvent.start,
                        lastBookedEvent.end,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-white/[0.04]"
                      onClick={() => setCalendarDropdownOpen(false)}
                    >
                      Google Calendar
                    </a>
                    <a
                      href={outlookCalendarUrl(
                        lastBookedEvent.title,
                        lastBookedEvent.start,
                        lastBookedEvent.end,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-white/[0.04]"
                      onClick={() => setCalendarDropdownOpen(false)}
                    >
                      Outlook
                    </a>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* How scheduling works */}
      {!loading && id && (
        <div className="mb-4 card-lifted">
          <button
            type="button"
            onClick={() => setShowHelp(!showHelp)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-[var(--text)] hover:bg-white/[0.04]"
            aria-expanded={showHelp ? "true" : "false"}
          >
            <span className="flex items-center gap-2">
              <HelpCircle size={18} className="text-[var(--accent)]" />
              Quick guide: slots, booking, and hiring setup
            </span>
            <ChevronDown
              size={18}
              className={`shrink-0 text-white/60 transition ${showHelp ? "rotate-180" : ""}`}
            />
          </button>
          {showHelp && (
            <div className="border-t border-[var(--border)] px-4 py-3 text-sm text-white/60">
              <ol className="list-decimal space-y-3 pl-4">
                <li>
                  <strong className="text-[var(--text)]">Create slots</strong> — Use{" "}
                  <strong className="text-[var(--text)]">Create Slots</strong> (this page). You are
                  not editing pipeline stages here.
                </li>
                <li>
                  <strong className="text-[var(--text)]">Book or share</strong> — Use the book icon
                  on a slot for a specific pipeline row, or copy a{" "}
                  <strong className="text-[var(--text)]">self-schedule link</strong> for the whole
                  job (first applicant to finish booking uses the link; they pick their name on the
                  public page).
                </li>
                <li>
                  <strong className="text-[var(--text)]">Who interviews?</strong> — Only if you want
                  calendar context per round, open{" "}
                  <Link
                    href={`/recruit/jobs/${id}/pipeline-stages`}
                    className="font-medium text-[var(--accent)] hover:underline"
                  >
                    Hiring setup
                  </Link>{" "}
                  and assign interviewers on existing <em>interview</em> rounds. Use{" "}
                  <strong className="text-[var(--text)]">Add round to pipeline</strong> only when
                  you truly need an extra stage — not for scheduling.
                </li>
                <li>
                  <strong className="text-[var(--text)]">Confirmation</strong> — Booking here
                  confirms the time. WhatsApp self-serve choices update the same field
                  automatically. Full details: docs/help/interview-scheduling-flow.md.
                </li>
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Slot summary + filter */}
      {!loading && job && enrichedSlots.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-sm text-white/60">
            <span>
              <strong className="text-[var(--text)]">{slotCounts.total}</strong> total
            </span>
            <span className="text-emerald-400">{slotCounts.available} available</span>
            <span className="text-amber-400">{slotCounts.booked} booked</span>
          </div>
          <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
            {(["all", "available", "booked"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setFilterStatus(status)}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition ${
                  filterStatus === status
                    ? "bg-[var(--accent)] text-black"
                    : "text-white/60 hover:text-[var(--text)]"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="card-lifted flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-8 w-36" />
          </div>
          <div className="space-y-6">
            {Array.from({ length: 2 }).map((_, blockIndex) => (
              <div key={blockIndex} className="card-lifted p-6 sm:p-8">
                <Skeleton className="mb-4 h-6 w-48" />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 3 }).map((__, index) => (
                    <div key={index} className="rounded-xl border border-white/10 p-4">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="mt-2 h-3 w-1/2" />
                      <Skeleton className="mt-3 h-5 w-16" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : !job ? (
        <div className="flex flex-col items-center justify-center card-lifted px-6 py-20">
          <AlertCircle size={40} className="text-white/60" />
          <p className="text-body mt-4 text-white/60">Job not found</p>
          <button
            type="button"
            onClick={() => router.push("/recruit/jobs")}
            className="mt-4 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-white/[0.04]"
          >
            Back to Jobs
          </button>
        </div>
      ) : enrichedSlots.length === 0 ? (
        <div className="flex flex-col items-center justify-center card-lifted px-6 py-20">
          <Calendar size={40} className="text-white/60" />
          <p className="text-body mt-4 text-white/60">No interview slots yet</p>
          <p className="text-body mt-1 text-sm text-white/60">
            Create availability slots to start scheduling interviews.
          </p>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
          >
            <CalendarPlus size={16} />
            Create Slots
          </button>
        </div>
      ) : filteredSlots.length === 0 ? (
        <div className="flex flex-col items-center justify-center card-lifted px-6 py-16 text-center">
          <Calendar size={36} className="text-white/50" />
          <p className="text-body mt-4 text-white/70">
            No <span className="capitalize">{filterStatus}</span> slots in the current date range.
          </p>
          <p className="mt-1 text-sm text-white/55">
            {slotCounts.booked > 0 && filterStatus === "available"
              ? `${slotCounts.booked} booked — switch to Booked or All to see them.`
              : `${slotCounts.total} slot${slotCounts.total === 1 ? "" : "s"} on this job.`}
          </p>
          {filterStatus !== "all" && (
            <button
              type="button"
              onClick={() => setFilterStatus("all")}
              className="mt-4 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--accent)] hover:bg-white/[0.04]"
            >
              Show all slots
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(groupedSlots.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dateKey, slots]) => (
              <div key={dateKey} className="card-lifted p-6 sm:p-8">
                <h3 className="heading-section mb-4 text-lg text-[var(--text)]">
                  {formatDate(slots[0].start)}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {slots
                    .sort((a, b) => a.start.localeCompare(b.start))
                    .map((slot) => (
                      <div
                        key={slot.slot_id || slot.start}
                        className={`rounded-xl border p-4 transition ${
                          slot.status === "booked"
                            ? "border-amber-500/30 bg-amber-500/5"
                            : "border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--accent)]/30"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 text-sm font-medium text-[var(--text)]">
                              <Clock size={16} className="text-[var(--accent)]" />
                              {formatTime(slot.start)} – {formatTime(slot.end)}
                            </div>
                            {(slot.slot_owner_id ?? slot.slot_owner_name) && (
                              <div className="mt-1.5 flex items-center gap-2 text-xs text-white/60">
                                <User size={14} aria-hidden />
                                <span>
                                  Created by{" "}
                                  <span className="text-white/75">
                                    {authUser?.id && slot.slot_owner_id === authUser.id
                                      ? "you"
                                      : slot.slot_owner_name?.trim() || "teammate"}
                                  </span>
                                </span>
                              </div>
                            )}
                            {slot.interviewer_email && (
                              <div className="mt-1.5 flex items-center gap-2 text-xs text-white/60">
                                <User size={14} />
                                {slot.interviewer_email}
                              </div>
                            )}
                            <div className="mt-2">
                              <StatusBadge
                                tone={getInterviewSlotTone(slot.status)}
                                size="sm"
                                icon={
                                  slot.status === "booked" ? (
                                    <CheckCircle2 size={12} />
                                  ) : (
                                    <Calendar size={12} />
                                  )
                                }
                              >
                                {slot.status === "booked" ? "Booked" : "Available"}
                              </StatusBadge>
                            </div>
                            {slot.status === "booked" && slot.slot_id && (
                              <InviteDeliveryBanner
                                delivery={slot}
                                onResend={() => handleResendInvites(slot.slot_id!)}
                                resending={resendSlotId === slot.slot_id}
                              />
                            )}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            {slot.status === "available" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setSelectedSlot(slot)}
                                  disabled={jobPipelineCandidates.length === 0}
                                  className="rounded-md p-1.5 text-[var(--accent)] transition hover:bg-[var(--accent)]/15 disabled:cursor-not-allowed disabled:opacity-50"
                                  aria-label={
                                    jobPipelineCandidates.length === 0
                                      ? "No pipeline candidates available"
                                      : "Book this slot"
                                  }
                                  title={
                                    jobPipelineCandidates.length === 0
                                      ? "Add candidates to this job's pipeline first, then book a slot for them"
                                      : "Book a pipeline candidate into this slot"
                                  }
                                >
                                  <BookOpen size={16} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => slot.slot_id && handleDeleteSlot(slot.slot_id)}
                                  disabled={deletingLoading}
                                  className="rounded-md p-1.5 text-white/60 transition hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                                  aria-label="Delete slot"
                                  title="Delete slot"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setRescheduleFromSlot(slot)}
                                  className="rounded-md p-1.5 text-[var(--accent)] transition hover:bg-[var(--accent)]/15"
                                  aria-label="Reschedule interview"
                                  title="Reschedule interview"
                                >
                                  <CalendarClock size={16} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => slot.slot_id && handleCancel(slot.slot_id)}
                                  disabled={cancelingLoading}
                                  className="rounded-md p-1.5 text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                                  aria-label="Cancel interview"
                                  title="Cancel interview"
                                >
                                  {cancelingLoading ? (
                                    <Loader2 size={16} className="animate-spin" />
                                  ) : (
                                    <XCircle size={16} />
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {selectedSlot && (
        <BookingModal
          slot={selectedSlot}
          pipelineCandidates={jobPipelineCandidates}
          stages={stagesData?.stages ?? []}
          onClose={() => setSelectedSlot(null)}
          onBook={handleBook}
          loading={bookingLoading}
          errorMessage={bookingError}
        />
      )}

      {rescheduleFromSlot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reschedule-title"
        >
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => !rescheduleLoading && setRescheduleFromSlot(null)}
            aria-hidden="true"
          />
          <div className="relative z-10 max-h-[min(90vh,36rem)] w-full max-w-md overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl sm:p-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="reschedule-title" className="heading-card text-lg text-[var(--text)]">
                Reschedule interview
              </h2>
              <button
                type="button"
                onClick={() => !rescheduleLoading && setRescheduleFromSlot(null)}
                className="rounded-full p-1 text-white/60 transition hover:bg-white/[0.04] hover:text-[var(--text)]"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-body mb-4 text-sm text-white/60">
              Current: {formatDate(rescheduleFromSlot.start)} {formatTime(rescheduleFromSlot.start)}{" "}
              – {formatTime(rescheduleFromSlot.end)}. Choose a new slot:
            </p>
            {availableSlotsForReschedule.length === 0 ? (
              <p className="text-body text-sm text-white/60">
                No available slots. Create more slots first.
              </p>
            ) : (
              <ul className="max-h-60 space-y-2 overflow-y-auto">
                {availableSlotsForReschedule.map((s) => {
                  const slotId = s.slot_id ?? s.id;
                  if (!slotId) return null;
                  return (
                    <li key={slotId}>
                      <button
                        type="button"
                        onClick={() =>
                          handleReschedule(
                            rescheduleFromSlot.slot_id ?? rescheduleFromSlot.id ?? "",
                            slotId,
                          )
                        }
                        disabled={rescheduleLoading}
                        className="text-body w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-left text-sm text-[var(--text)] transition hover:border-[var(--accent)] hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {formatDate(s.start)} · {formatTime(s.start)} – {formatTime(s.end)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {showCreateModal && authUser?.id && (
        <CreateSlotsModal
          jobTitle={job?.title ?? "This job"}
          signedInAsLabel={createSlotsSignedInAsLabel}
          signedInUserId={authUser.id}
          ownerOptions={slotOwnerOptions}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateSlots}
          loading={creatingLoading}
          errorMessage={actionError}
          preferInterviewerMode={pickFromInterviewerAvailability}
          interviewerPickerEnabled={Boolean(interviewerAvailabilityData?.has_declared_availability)}
          onBulkFromWindows={
            interviewerAvailabilityData?.has_declared_availability
              ? handleBulkFromInterviewerWindows
              : undefined
          }
          interviewerPicker={
            <InterviewerAvailabilityPicker
              windows={interviewerAvailabilityData?.windows ?? []}
              loading={interviewerAvailabilityLoading}
              onPick={async (w) => {
                await handleCreateSlots({
                  slots: [
                    {
                      start_at: w.starts_at,
                      end_at: w.ends_at,
                      source: "interviewer_declared",
                    },
                  ],
                  source: "interviewer_declared",
                  owner_user_id: authUser?.id && w.user_id !== authUser.id ? w.user_id : undefined,
                });
              }}
            />
          }
        />
      )}
    </>
  );
}
