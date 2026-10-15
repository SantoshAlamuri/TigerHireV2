/**
 * Interviews on real calendars: who is free, booking the event with a video
 * link, cancelling it, and checking that an opened slot is still free.
 *
 * Everything here is best effort around the existing booking flow: a calendar
 * that fails never blocks a booking, but the failure is logged with its own
 * event name and recorded on the slot so the recruiter sees it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import {
  accessFromRow,
  getCalendarAccess,
  loadCalendarRows,
  type CalendarAccessResult,
} from "@/lib/calendar/access";
import { cancelEvent, createEvent, fetchBusy, CalendarError } from "@/lib/calendar/providers";
import {
  DEFAULT_WORKING_HOURS,
  clashes,
  expandWorkingHours,
  mergeIntervals,
  type Interval,
} from "@/lib/calendar/slots";

export type CalendarSource = "calendar" | "declared_hours" | "working_hours";

export interface MemberAvailability {
  userId: string;
  name: string;
  email: string | null;
  /** Where their free time came from. */
  source: CalendarSource;
  /** Calendar state, so the UI can ask the right person to fix it. */
  calendar: "connected" | "not_connected" | "reconnect" | "error";
  calendarProvider: "google_calendar" | "outlook" | null;
  message: string | null;
  available: Interval[];
  busy: Interval[];
}

/** Columns added by 20261015120000_interview_slot_calendar.sql; tolerated when missing. */
function isMissingColumn(err: { code?: string; message?: string } | null): boolean {
  return Boolean(
    err &&
    (err.code === "42703" ||
      err.code === "PGRST204" ||
      /column .* does not exist|Could not find the .* column/i.test(err.message ?? "")),
  );
}

/** Record how the calendar sync went on the slot; quiet if the columns aren't there yet. */
export async function recordSlotCalendar(
  admin: SupabaseClient,
  slotId: string,
  fields: {
    calendar_sync_status: "synced" | "failed" | "not_connected" | "cancelled";
    calendar_sync_message?: string | null;
    meeting_url?: string | null;
    meeting_provider?: string | null;
  },
): Promise<void> {
  const { meeting_url, meeting_provider, ...sync } = fields;
  if (meeting_url) {
    await admin
      .from("interview_availability_slots")
      .update({ meeting_url, ...(meeting_provider ? { meeting_provider } : {}) })
      .eq("id", slotId)
      .is("meeting_url", null);
  }
  const { error } = await admin
    .from("interview_availability_slots")
    .update({ ...sync, calendar_sync_message: sync.calendar_sync_message ?? null })
    .eq("id", slotId);
  if (error && !isMissingColumn(error)) {
    logger.warn("calendar_sync_status_write_failed", { slotId, error: error.message });
  }
}

/** Panel members on a slot (the owner first). Falls back to the owner alone. */
export async function slotPanel(
  admin: SupabaseClient,
  slotId: string,
): Promise<{ ownerId: string | null; panel: string[] }> {
  const withPanel = await admin
    .from("interview_availability_slots")
    .select("user_id, panel_user_ids")
    .eq("id", slotId)
    .maybeSingle();
  if (!withPanel.error) {
    const row = withPanel.data as { user_id: string | null; panel_user_ids?: string[] | null };
    const ownerId = row?.user_id ?? null;
    const panel = [
      ...new Set([ownerId, ...(row?.panel_user_ids ?? [])].filter((x): x is string => !!x)),
    ];
    return { ownerId, panel };
  }
  const plain = await admin
    .from("interview_availability_slots")
    .select("user_id")
    .eq("id", slotId)
    .maybeSingle();
  const ownerId = (plain.data as { user_id?: string | null } | null)?.user_id ?? null;
  return { ownerId, panel: ownerId ? [ownerId] : [] };
}

async function profiles(admin: SupabaseClient, ids: string[]) {
  if (!ids.length) return new Map<string, { name: string; email: string | null }>();
  const { data } = await admin.from("profiles").select("id, full_name, email").in("id", ids);
  return new Map(
    ((data ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((p) => [
      p.id,
      { name: p.full_name?.trim() || p.email || "Interviewer", email: p.email },
    ]),
  );
}

/**
 * Each panel member's free and busy time between `from` and `to`.
 * Busy always includes interviews already booked in TigerHire, so two
 * candidates can never be offered the same person at the same time.
 */
export async function panelAvailability(
  admin: SupabaseClient,
  params: { organisationId: string; userIds: string[]; from: number; to: number },
): Promise<MemberAvailability[]> {
  const ids = [...new Set(params.userIds)];
  const [people, rows, windowsRes, bookedRes] = await Promise.all([
    profiles(admin, ids),
    loadCalendarRows(admin, ids),
    admin
      .from("interviewer_availability_windows")
      .select("user_id, starts_at, ends_at")
      .in("user_id", ids)
      .eq("organisation_id", params.organisationId)
      .eq("is_active", true)
      .lt("starts_at", new Date(params.to).toISOString())
      .gt("ends_at", new Date(params.from).toISOString()),
    admin
      .from("interview_availability_slots")
      .select("user_id, start_at, end_at")
      .in("user_id", ids)
      .eq("status", "booked")
      .lt("start_at", new Date(params.to).toISOString())
      .gt("end_at", new Date(params.from).toISOString()),
  ]);

  const windows = (windowsRes.data ?? []) as {
    user_id: string;
    starts_at: string;
    ends_at: string;
  }[];
  const booked = (bookedRes.data ?? []) as { user_id: string; start_at: string; end_at: string }[];
  const hours = expandWorkingHours(DEFAULT_WORKING_HOURS, params.from, params.to);

  return Promise.all(
    ids.map(async (userId): Promise<MemberAvailability> => {
      const person = people.get(userId) ?? { name: "Interviewer", email: null };
      const declared = windows
        .filter((w) => w.user_id === userId)
        .map((w) => ({ start: Date.parse(w.starts_at), end: Date.parse(w.ends_at) }));
      const ownBooked = booked
        .filter((b) => b.user_id === userId)
        .map((b) => ({ start: Date.parse(b.start_at), end: Date.parse(b.end_at) }));

      const row = rows.get(userId);
      const acc: CalendarAccessResult = await accessFromRow(admin, row);
      let busy = ownBooked;
      let calendar: MemberAvailability["calendar"] = acc.ok ? "connected" : acc.reason;
      let message: string | null = acc.ok ? null : acc.message;
      if (acc.ok) {
        try {
          busy = mergeIntervals([
            ...ownBooked,
            ...(await fetchBusy(acc.access, params.from, params.to)),
          ]);
        } catch (err) {
          calendar = err instanceof CalendarError && err.reconnect ? "reconnect" : "error";
          message =
            calendar === "reconnect"
              ? "Calendar access was revoked. Reconnect it."
              : "Couldn't read the calendar just now.";
          logger.warn("calendar_freebusy_failed", { userId, error: String(err) });
        }
      }
      const source: CalendarSource =
        calendar === "connected"
          ? "calendar"
          : declared.length
            ? "declared_hours"
            : "working_hours";
      return {
        userId,
        name: person.name,
        email: person.email,
        source,
        calendar,
        calendarProvider: (row?.provider as MemberAvailability["calendarProvider"]) ?? null,
        message,
        available: declared.length ? mergeIntervals(declared) : hours,
        busy,
      };
    }),
  );
}

/**
 * Put a booked interview on the organiser's calendar with a video link and
 * invite the candidate and the rest of the panel. Returns the meeting link so
 * the confirmation emails can carry it.
 */
export async function syncBookedEvent(
  admin: SupabaseClient,
  params: {
    slotId: string;
    jobTitle: string;
    stageName?: string | null;
    candidateName?: string | null;
    candidateEmail?: string | null;
    startAt: string;
    endAt: string;
  },
): Promise<{ meetingUrl: string | null; onCalendar: boolean }> {
  const { ownerId, panel } = await slotPanel(admin, params.slotId);
  if (!ownerId) return { meetingUrl: null, onCalendar: false };
  const acc = await getCalendarAccess(admin, ownerId);
  if (!acc.ok) {
    await recordSlotCalendar(admin, params.slotId, {
      calendar_sync_status: "not_connected",
      calendar_sync_message: acc.message,
    });
    return { meetingUrl: null, onCalendar: false };
  }

  const { data: existing } = await admin
    .from("interview_availability_slots")
    .select("meeting_url")
    .eq("id", params.slotId)
    .maybeSingle();
  const presetUrl = (existing as { meeting_url?: string | null } | null)?.meeting_url ?? null;

  const people = await profiles(admin, panel);
  const candidate = (params.candidateName ?? "Candidate").trim() || "Candidate";
  try {
    const ev = await createEvent(acc.access, {
      slotId: params.slotId,
      title: `Interview: ${candidate} – ${params.jobTitle}`,
      description: [
        `${params.stageName ?? "Interview"} for ${params.jobTitle}.`,
        `Candidate: ${candidate}.`,
        presetUrl ? `Join: ${presetUrl}` : null,
        "Scheduled with TigerHire.",
      ]
        .filter(Boolean)
        .join("\n"),
      start: Date.parse(params.startAt),
      end: Date.parse(params.endAt),
      timeZone: DEFAULT_WORKING_HOURS.timeZone,
      attendees: [
        ...(params.candidateEmail ? [{ email: params.candidateEmail, name: candidate }] : []),
        ...panel
          .filter((id) => id !== ownerId)
          .map((id) => ({ email: people.get(id)?.email ?? "", name: people.get(id)?.name })),
      ],
      withVideo: !presetUrl,
    });
    const meetingUrl = presetUrl ?? ev.meetingUrl;
    await recordSlotCalendar(admin, params.slotId, {
      calendar_sync_status: "synced",
      meeting_url: presetUrl ? null : ev.meetingUrl,
      meeting_provider: presetUrl ? null : ev.meetingProvider,
    });
    return { meetingUrl, onCalendar: true };
  } catch (err) {
    logger.warn("calendar_event_create_failed", {
      slotId: params.slotId,
      provider: acc.access.provider,
      error: String(err),
    });
    await recordSlotCalendar(admin, params.slotId, {
      calendar_sync_status: "failed",
      calendar_sync_message:
        err instanceof CalendarError && err.reconnect
          ? "Calendar access was revoked. Reconnect it, then resend the invite."
          : "Couldn't add this to the calendar. The email invites still went out.",
    });
    return { meetingUrl: presetUrl, onCalendar: false };
  }
}

/** Take a cancelled or moved interview off the organiser's calendar. */
export async function cancelBookedEvent(
  admin: SupabaseClient,
  slotId: string,
  ownerId: string | null,
): Promise<void> {
  if (!ownerId) return;
  const acc = await getCalendarAccess(admin, ownerId);
  if (!acc.ok) return;
  try {
    await cancelEvent(acc.access, slotId);
    await recordSlotCalendar(admin, slotId, { calendar_sync_status: "cancelled" });
  } catch (err) {
    logger.warn("calendar_event_cancel_failed", { slotId, error: String(err) });
  }
}

/**
 * Of these open slots, the ones that are still free for their whole panel.
 * Slots whose people have no connected calendar are kept (nothing to check).
 */
export async function filterStillFree<
  T extends { id: string; start_at: string; end_at: string; user_id?: string | null },
>(admin: SupabaseClient, slots: T[]): Promise<T[]> {
  if (!slots.length) return slots;
  const owners = [...new Set(slots.map((s) => s.user_id).filter((x): x is string => !!x))];
  const rows = await loadCalendarRows(admin, owners);
  if (!rows.size) return slots;
  const from = Math.min(...slots.map((s) => Date.parse(s.start_at)));
  const to = Math.max(...slots.map((s) => Date.parse(s.end_at)));
  const busyBy = new Map<string, Interval[] | null>();
  await Promise.all(
    owners.map(async (id) => {
      const acc = await accessFromRow(admin, rows.get(id));
      if (!acc.ok) return busyBy.set(id, null);
      try {
        busyBy.set(id, await fetchBusy(acc.access, from, to));
      } catch (err) {
        logger.warn("calendar_recheck_failed", { userId: id, error: String(err) });
        busyBy.set(id, null);
      }
    }),
  );
  return slots.filter((s) => {
    const busy = s.user_id ? busyBy.get(s.user_id) : null;
    if (!busy) return true;
    return !clashes({ start: Date.parse(s.start_at), end: Date.parse(s.end_at) }, busy);
  });
}
