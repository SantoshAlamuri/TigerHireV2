function icsDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildInterviewInviteIcs(input: {
  slotId: string;
  title: string;
  candidateName: string;
  startAt: string;
  endAt: string;
  method?: "REQUEST" | "CANCEL";
  cancelled?: boolean;
  /** Optional recording-disclosure sentence appended to the event description. (#354) */
  recordingNotice?: string;
  meetingUrl?: string;
}): string {
  const start = new Date(input.startAt);
  const end = new Date(input.endAt);
  const now = new Date();
  const uid = `tigerhire-booked-${input.slotId}@tigerhire`;
  const description = input.recordingNotice
    ? `Interview for role: ${input.title}. Candidate: ${input.candidateName}. ${input.recordingNotice}`
    : `Interview for role: ${input.title}. Candidate: ${input.candidateName}.`;
  const withJoin = input.meetingUrl ? `${description} Join: ${input.meetingUrl}` : description;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TigerHire//Interview Invite//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${input.method ?? "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(`Interview - ${input.title}`)}`,
    `DESCRIPTION:${icsEscape(withJoin)}`,
    ...(input.meetingUrl
      ? [`LOCATION:${icsEscape(input.meetingUrl)}`, `URL:${input.meetingUrl}`]
      : []),
    ...(input.cancelled ? ["STATUS:CANCELLED"] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
