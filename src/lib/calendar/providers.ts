/**
 * Google Calendar and Microsoft 365 (Outlook) calls: who is busy, and booking
 * or cancelling the interview event with a Meet or Teams link.
 *
 * Events are tied to the TigerHire slot id so every call is idempotent: a
 * retried booking never creates a second event, and cancelling finds the
 * right one without storing provider ids.
 */
import type { CalendarAccess } from "@/lib/calendar/access";
import type { Interval } from "@/lib/calendar/slots";

const GOOGLE = "https://www.googleapis.com/calendar/v3";
const GRAPH = "https://graph.microsoft.com/v1.0";
/** Microsoft extended property that carries the TigerHire slot id. */
const MS_SLOT_PROP = "String {7b1f4a52-3c0e-4c7a-9f3e-2a7c1e9b6d11} Name tigerhireSlotId";

export class CalendarError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reconnect = false,
  ) {
    super(message);
  }
}

async function call<T>(
  access: CalendarAccess,
  url: string,
  init: RequestInit & { allow?: number[] } = {},
): Promise<{ status: number; body: T | null }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${access.accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (res.ok || init.allow?.includes(res.status)) {
    const text = await res.text();
    return { status: res.status, body: text ? (JSON.parse(text) as T) : null };
  }
  let detail = "";
  try {
    const j = (await res.json()) as { error?: { message?: string } | string };
    detail = typeof j.error === "string" ? j.error : (j.error?.message ?? "");
  } catch {
    detail = "";
  }
  throw new CalendarError(
    `${access.provider === "google_calendar" ? "Google" : "Outlook"} calendar ${res.status}${detail ? `: ${detail}` : ""}`,
    res.status,
    res.status === 401 || res.status === 403,
  );
}

/** Google event ids allow a-v and 0-9; a uuid without dashes qualifies. */
export function googleEventId(slotId: string): string {
  return `th${slotId.replace(/-/g, "").toLowerCase()}`;
}

/** Busy time on the person's main calendar between `from` and `to`. */
export async function fetchBusy(
  access: CalendarAccess,
  from: number,
  to: number,
): Promise<Interval[]> {
  if (access.provider === "google_calendar") {
    const { body } = await call<{
      calendars?: Record<
        string,
        { busy?: { start: string; end: string }[]; errors?: { reason?: string }[] }
      >;
    }>(access, `${GOOGLE}/freeBusy`, {
      method: "POST",
      body: JSON.stringify({
        timeMin: new Date(from).toISOString(),
        timeMax: new Date(to).toISOString(),
        items: [{ id: "primary" }],
      }),
    });
    const cal = body?.calendars?.primary;
    if (cal?.errors?.length) {
      throw new CalendarError(`Google calendar: ${cal.errors[0].reason ?? "unavailable"}`, 502);
    }
    return (cal?.busy ?? []).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
  }

  // Outlook: read the calendar view in UTC and keep anything not marked free.
  const out: Interval[] = [];
  let url: string | null =
    `${GRAPH}/me/calendarView?startDateTime=${encodeURIComponent(new Date(from).toISOString())}` +
    `&endDateTime=${encodeURIComponent(new Date(to).toISOString())}` +
    `&$select=showAs,isCancelled,start,end&$top=200`;
  let pages = 0;
  while (url && pages < 10) {
    pages++;
    const res: {
      body: {
        value?: {
          showAs?: string;
          isCancelled?: boolean;
          start: { dateTime: string };
          end: { dateTime: string };
        }[];
        "@odata.nextLink"?: string;
      } | null;
    } = await call(access, url, { headers: { Prefer: 'outlook.timezone="UTC"' } });
    for (const e of res.body?.value ?? []) {
      if (e.isCancelled || e.showAs === "free") continue;
      const z = (s: string) => Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`);
      out.push({ start: z(e.start.dateTime), end: z(e.end.dateTime) });
    }
    url = res.body?.["@odata.nextLink"] ?? null;
  }
  return out;
}

export interface EventInput {
  slotId: string;
  title: string;
  description: string;
  start: number;
  end: number;
  timeZone: string;
  attendees: { email: string; name?: string | null }[];
  /** Ask the provider to attach a Meet / Teams link. */
  withVideo: boolean;
}

export interface CreatedEvent {
  eventId: string;
  meetingUrl: string | null;
  meetingProvider: "meet" | "teams" | null;
  htmlLink: string | null;
}

/** Create the interview on the organiser's calendar; reuses it if it already exists. */
export async function createEvent(access: CalendarAccess, e: EventInput): Promise<CreatedEvent> {
  const attendees = dedupeAttendees(e.attendees, access.email);

  if (access.provider === "google_calendar") {
    const id = googleEventId(e.slotId);
    type GEvent = {
      id: string;
      hangoutLink?: string;
      htmlLink?: string;
      conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
    };
    const created = await call<GEvent>(
      access,
      `${GOOGLE}/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: "POST",
        allow: [409],
        body: JSON.stringify({
          id,
          summary: e.title,
          description: e.description,
          start: { dateTime: new Date(e.start).toISOString(), timeZone: e.timeZone },
          end: { dateTime: new Date(e.end).toISOString(), timeZone: e.timeZone },
          attendees: attendees.map((a) => ({ email: a.email, displayName: a.name ?? undefined })),
          reminders: { useDefault: true },
          guestsCanModify: false,
          ...(e.withVideo
            ? {
                conferenceData: {
                  createRequest: {
                    requestId: e.slotId,
                    conferenceSolutionKey: { type: "hangoutsMeet" },
                  },
                },
              }
            : {}),
        }),
      },
    );
    const ev =
      created.status === 409
        ? (await call<GEvent>(access, `${GOOGLE}/calendars/primary/events/${id}`)).body
        : created.body;
    const video =
      ev?.hangoutLink ??
      ev?.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ??
      null;
    return {
      eventId: ev?.id ?? id,
      meetingUrl: video,
      meetingProvider: video ? "meet" : null,
      htmlLink: ev?.htmlLink ?? null,
    };
  }

  const existing = await findOutlookEvent(access, e.slotId);
  type MEvent = { id: string; webLink?: string; onlineMeeting?: { joinUrl?: string } | null };
  if (existing) {
    const { body } = await call<MEvent>(
      access,
      `${GRAPH}/me/events/${existing}?$select=id,webLink,onlineMeeting`,
    );
    return outlookResult(body, existing);
  }
  const payload = (video: boolean) =>
    JSON.stringify({
      subject: e.title,
      body: { contentType: "text", content: e.description },
      start: { dateTime: new Date(e.start).toISOString().slice(0, 19), timeZone: "UTC" },
      end: { dateTime: new Date(e.end).toISOString().slice(0, 19), timeZone: "UTC" },
      attendees: attendees.map((a) => ({
        emailAddress: { address: a.email, name: a.name ?? a.email },
        type: "required",
      })),
      transactionId: e.slotId,
      singleValueExtendedProperties: [{ id: MS_SLOT_PROP, value: e.slotId }],
      ...(video ? { isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" } : {}),
    });
  try {
    const { body } = await call<MEvent>(access, `${GRAPH}/me/events`, {
      method: "POST",
      body: payload(e.withVideo),
    });
    return outlookResult(body, "");
  } catch (err) {
    // Personal Microsoft accounts can't create Teams meetings; book without one.
    if (e.withVideo && err instanceof CalendarError && err.status === 400) {
      const { body } = await call<MEvent>(access, `${GRAPH}/me/events`, {
        method: "POST",
        body: payload(false),
      });
      return outlookResult(body, "");
    }
    throw err;
  }
}

function outlookResult(
  body: { id: string; webLink?: string; onlineMeeting?: { joinUrl?: string } | null } | null,
  fallbackId: string,
): CreatedEvent {
  const url = body?.onlineMeeting?.joinUrl ?? null;
  return {
    eventId: body?.id ?? fallbackId,
    meetingUrl: url,
    meetingProvider: url ? "teams" : null,
    htmlLink: body?.webLink ?? null,
  };
}

async function findOutlookEvent(access: CalendarAccess, slotId: string): Promise<string | null> {
  const filter = `singleValueExtendedProperties/Any(ep: ep/id eq '${MS_SLOT_PROP}' and ep/value eq '${slotId}')`;
  const { body } = await call<{ value?: { id: string }[] }>(
    access,
    `${GRAPH}/me/events?$filter=${encodeURIComponent(filter)}&$select=id&$top=1`,
  );
  return body?.value?.[0]?.id ?? null;
}

/** Cancel the interview event, telling attendees. Missing events are fine. */
export async function cancelEvent(
  access: CalendarAccess,
  slotId: string,
  note = "This interview has been cancelled.",
): Promise<"cancelled" | "not_found"> {
  if (access.provider === "google_calendar") {
    const { status } = await call(
      access,
      `${GOOGLE}/calendars/primary/events/${googleEventId(slotId)}?sendUpdates=all`,
      { method: "DELETE", allow: [404, 410] },
    );
    return status === 404 || status === 410 ? "not_found" : "cancelled";
  }
  const id = await findOutlookEvent(access, slotId);
  if (!id) return "not_found";
  await call(access, `${GRAPH}/me/events/${id}/cancel`, {
    method: "POST",
    allow: [404],
    body: JSON.stringify({ comment: note }),
  });
  return "cancelled";
}

export function dedupeAttendees(
  list: { email: string; name?: string | null }[],
  organiser: string | null,
): { email: string; name?: string | null }[] {
  const seen = new Set<string>(organiser ? [organiser.toLowerCase()] : []);
  const out: { email: string; name?: string | null }[] = [];
  for (const a of list) {
    const email = a.email?.trim().toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name: a.name ?? null });
  }
  return out;
}
