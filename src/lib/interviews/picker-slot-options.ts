import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDisplayDateTime } from "@/lib/locale/display";
import {
  collectJobInterviewerUserIds,
  listJobInterviewerAvailability,
} from "@/lib/interviews/interviewer-availability";
import {
  getSelfServeCandidateHorizonEnd,
  isSlotEligibleForCandidateSelfServe,
} from "@/lib/interviews/self-serve-slot-window";

export const PICKER_SLOT_MINUTES = 60;
export const MAX_PICKER_SLOTS = 5;
export type PickerSlotOption = {
  id: string;
  label: string;
  datetime: string;
  end_at: string | null;
  source: "existing_slot" | "window_generated";
};

function formatPickerLabel(iso: string): string {
  return formatDisplayDateTime(iso);
}

function splitWindowIntoSlots(
  startsAt: string,
  endsAt: string,
  durationMs: number,
): Array<{ start_at: string; end_at: string }> {
  const startMs = new Date(startsAt).getTime();
  const endMs = new Date(endsAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];

  const chunks: Array<{ start_at: string; end_at: string }> = [];
  let cursor = startMs;
  while (cursor + durationMs <= endMs) {
    chunks.push({
      start_at: new Date(cursor).toISOString(),
      end_at: new Date(cursor + durationMs).toISOString(),
    });
    cursor += durationMs;
  }
  return chunks;
}

/**
 * Build numbered slot options from interviewer availability windows, then existing job slots.
 */
export async function resolvePickerSlotOptions(
  admin: SupabaseClient,
  params: {
    jobId: string;
    organisationId: string;
    stageId?: string | null;
    interviewerUserId?: string | null;
    maxSlots?: number;
  },
): Promise<PickerSlotOption[]> {
  const maxSlots = params.maxSlots ?? MAX_PICKER_SLOTS;
  const now = new Date();
  const horizon = getSelfServeCandidateHorizonEnd(now);
  const durationMs = PICKER_SLOT_MINUTES * 60 * 1000;

  let interviewerUserIds: string[] = [];
  if (params.interviewerUserId) {
    interviewerUserIds = [params.interviewerUserId];
  } else if (params.stageId) {
    const { data: stage } = await admin
      .from("pipeline_stages")
      .select("interviewer_user_id")
      .eq("id", params.stageId)
      .maybeSingle();
    const uid = String(stage?.interviewer_user_id ?? "").trim();
    if (uid) interviewerUserIds = [uid];
  }
  if (interviewerUserIds.length === 0) {
    interviewerUserIds = await collectJobInterviewerUserIds(admin, params.jobId);
  }

  const options: PickerSlotOption[] = [];
  const seenStarts = new Set<string>();

  if (interviewerUserIds.length > 0) {
    const windows = await listJobInterviewerAvailability(admin, {
      jobId: params.jobId,
      organisationId: params.organisationId,
      interviewerUserIds,
      from: now,
      to: horizon,
    });

    for (const window of windows) {
      const chunks = splitWindowIntoSlots(window.starts_at, window.ends_at, durationMs);
      for (const chunk of chunks) {
        if (!isSlotEligibleForCandidateSelfServe(chunk.start_at, now)) continue;
        if (seenStarts.has(chunk.start_at)) continue;
        seenStarts.add(chunk.start_at);
        options.push({
          id: `window:${window.id}:${chunk.start_at}`,
          label: formatPickerLabel(chunk.start_at),
          datetime: chunk.start_at,
          end_at: chunk.end_at,
          source: "window_generated",
        });
        if (options.length >= maxSlots) return options;
      }
    }
  }

  const { data: existingSlots } = await admin
    .from("interview_availability_slots")
    .select("id, start_at, end_at")
    .eq("job_id", params.jobId)
    .eq("status", "available")
    .gte("start_at", now.toISOString())
    .lte("start_at", horizon.toISOString())
    .order("start_at", { ascending: true })
    .limit(maxSlots * 3);

  for (const slot of existingSlots ?? []) {
    const startAt = slot.start_at as string;
    if (!isSlotEligibleForCandidateSelfServe(startAt, now)) continue;
    if (seenStarts.has(startAt)) continue;
    seenStarts.add(startAt);
    options.push({
      id: slot.id as string,
      label: formatPickerLabel(startAt),
      datetime: startAt,
      end_at: (slot.end_at as string | null) ?? null,
      source: "existing_slot",
    });
    if (options.length >= maxSlots) break;
  }

  return options.slice(0, maxSlots);
}

/**
 * Ensures window-derived options exist as `interview_availability_slots` rows and returns options with real slot ids.
 */
export async function materializePickerSlotOptions(
  admin: SupabaseClient,
  params: {
    jobId: string;
    userId: string;
    options: PickerSlotOption[];
  },
): Promise<PickerSlotOption[]> {
  const materialized: PickerSlotOption[] = [];

  for (const option of params.options) {
    if (option.source === "existing_slot" && !option.id.startsWith("window:")) {
      materialized.push(option);
      continue;
    }

    const endAt =
      option.end_at ??
      new Date(new Date(option.datetime).getTime() + PICKER_SLOT_MINUTES * 60 * 1000).toISOString();

    const { data: inserted, error } = await admin
      .from("interview_availability_slots")
      .insert({
        job_id: params.jobId,
        user_id: params.userId,
        start_at: option.datetime,
        end_at: endAt,
        timezone: "Asia/Kolkata",
        status: "available",
        source: "interviewer_declared",
      })
      .select("id, start_at, end_at")
      .single();

    if (error || !inserted?.id) {
      continue;
    }

    materialized.push({
      id: inserted.id as string,
      label: formatPickerLabel(inserted.start_at as string),
      datetime: inserted.start_at as string,
      end_at: (inserted.end_at as string | null) ?? null,
      source: "existing_slot",
    });
  }

  return materialized;
}
