"use client";

import { useCallback, useMemo, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery } from "@/lib/hooks/use-api";
import { generateSlotsFromWindow } from "@/lib/interviews/generate-slots-from-window";
import { CreateSlotsModal } from "./CreateSlotsModal";
import type { CreateSlotsPayload } from "./create-slots-types";
import {
  InterviewerAvailabilityPicker,
  type InterviewerDeclaredWindow,
} from "@/app/(dashboard)/recruit/jobs/[id]/interviews/components/InterviewerAvailabilityPicker";

type JobRow = { id: string; title?: string | null };

export function JobCreateSlotsLauncher({
  jobId: fixedJobId,
  jobTitle: fixedJobTitle,
  onCreated,
  preferInterviewerMode = false,
  buttonLabel = "Create slots",
  className,
}: {
  jobId?: string;
  jobTitle?: string;
  onCreated?: () => void | Promise<void>;
  preferInterviewerMode?: boolean;
  buttonLabel?: string;
  className?: string;
}) {
  const { user: authUser, loading: authLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickedJobId, setPickedJobId] = useState("");

  const jobId = fixedJobId ?? pickedJobId;

  const { data: jobsData, loading: jobsLoading } = useApiQuery<{ jobs: JobRow[] }>(
    open && !fixedJobId ? "/api/jobs" : null,
    { status: "open" },
  );

  const jobOptions = useMemo(
    () =>
      (jobsData?.jobs ?? [])
        .filter((j) => j.id)
        .map((j) => ({
          id: j.id,
          title: (j.title as string | null | undefined)?.trim() || "Untitled job",
        })),
    [jobsData?.jobs],
  );

  const jobTitle = fixedJobTitle ?? jobOptions.find((j) => j.id === jobId)?.title ?? "Selected job";

  const { data: interviewerAvailabilityData, loading: interviewerAvailabilityLoading } =
    useApiQuery<{
      windows: InterviewerDeclaredWindow[];
      has_declared_availability: boolean;
    }>(open && jobId ? `/api/jobs/${jobId}/interviewer-availability` : null);

  const { data: ownerProfilesData } = useApiQuery<{
    profiles: Array<{ id: string; full_name: string | null; email: string }>;
  }>(open && jobId ? `/api/jobs/${jobId}/interviewer-profile-options` : null);

  const signedInAsLabel = useMemo(() => {
    if (authLoading) return "Loading session…";
    if (!authUser) return "Sign in required";
    const name = authUser.name?.trim();
    const email = authUser.email?.trim();
    if (name && email && name.toLowerCase() !== email.toLowerCase()) {
      return `${name} · ${email}`;
    }
    return name || email || "Your account";
  }, [authUser, authLoading]);

  const ownerOptions = useMemo(() => {
    const self = authUser?.id ? [{ id: authUser.id, label: `${signedInAsLabel} (you)` }] : [];
    const fromApi = (ownerProfilesData?.profiles ?? [])
      .filter((p) => p.id !== authUser?.id)
      .map((p) => ({
        id: p.id,
        label: p.full_name?.trim() || p.email || p.id,
      }));
    return [...self, ...fromApi];
  }, [authUser, ownerProfilesData?.profiles, signedInAsLabel]);

  const handleCreate = useCallback(
    async (payload: CreateSlotsPayload) => {
      if (!authUser?.id) {
        setError("You must be signed in to create slots.");
        return;
      }
      if (!jobId) {
        setError("Choose a job first.");
        return;
      }
      setError(null);
      setCreating(true);
      const defaultSource = payload.slots.some((s) => s.source === "interviewer_declared")
        ? "interviewer_declared"
        : "recruiter_manual";
      try {
        const res = await fetch(`/api/jobs/${jobId}/availability`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slots: payload.slots,
            source: payload.source ?? defaultSource,
            ...(payload.owner_user_id ? { owner_user_id: payload.owner_user_id } : {}),
            ...(payload.bookable_by ? { bookable_by: payload.bookable_by } : {}),
          }),
          credentials: "include",
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          slots?: unknown[];
        };
        if (!res.ok) {
          setError(json.error ?? `Failed to create slots (${res.status})`);
          return;
        }
        const created = Array.isArray(json.slots) ? json.slots.length : 0;
        if (created === 0) {
          setError("No slots were saved. Check permissions or try again.");
          return;
        }
        setOpen(false);
        setPickedJobId("");
        setError(null);
        await onCreated?.();
      } catch {
        setError("Could not create slots. Check your connection and try again.");
      } finally {
        setCreating(false);
      }
    },
    [authUser?.id, jobId, onCreated],
  );

  const handleBulkFromWindows = useCallback(async () => {
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
      setError("No future availability windows to convert.");
      return;
    }
    await handleCreate({
      slots,
      source: "interviewer_declared",
    });
  }, [handleCreate, interviewerAvailabilityData?.windows]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setPickedJobId("");
    setError(null);
  }, []);

  const handleOpen = useCallback(() => {
    setError(null);
    setOpen(true);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={
          className ??
          "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-black hover:bg-[var(--accent-hover)] touch-manipulation"
        }
      >
        <CalendarPlus size={16} />
        {buttonLabel}
      </button>
      {open ? (
        <CreateSlotsModal
          jobTitle={jobTitle}
          signedInAsLabel={signedInAsLabel}
          signedInUserId={authUser?.id ?? ""}
          ownerOptions={ownerOptions}
          jobOptions={fixedJobId ? undefined : jobOptions}
          jobId={fixedJobId ? fixedJobId : pickedJobId || undefined}
          onJobIdChange={fixedJobId ? undefined : setPickedJobId}
          jobsLoading={!fixedJobId && jobsLoading}
          errorMessage={error}
          onClose={handleClose}
          onCreate={handleCreate}
          loading={creating}
          preferInterviewerMode={preferInterviewerMode}
          interviewerPickerEnabled={Boolean(
            jobId && interviewerAvailabilityData?.has_declared_availability,
          )}
          onBulkFromWindows={
            jobId && interviewerAvailabilityData?.has_declared_availability
              ? handleBulkFromWindows
              : undefined
          }
          interviewerPicker={
            jobId && authUser?.id ? (
              <InterviewerAvailabilityPicker
                windows={interviewerAvailabilityData?.windows ?? []}
                loading={interviewerAvailabilityLoading}
                onPick={async (w) => {
                  await handleCreate({
                    slots: [
                      {
                        start_at: w.starts_at,
                        end_at: w.ends_at,
                        source: "interviewer_declared",
                      },
                    ],
                    source: "interviewer_declared",
                    owner_user_id: w.user_id !== authUser.id ? w.user_id : undefined,
                  });
                }}
              />
            ) : null
          }
        />
      ) : null}
    </>
  );
}
