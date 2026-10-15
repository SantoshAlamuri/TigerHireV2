const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function parseTimeToMinutes(timeValue: string | null | undefined): number {
  const raw = (timeValue ?? "").trim();
  if (!raw) return 0;
  const [hourPart, minutePart] = raw.split(":");
  const h = Number(hourPart);
  const m = Number(minutePart);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return Math.max(0, Math.min(23, h)) * 60 + Math.max(0, Math.min(59, m));
}

function nowInIstMinutes(reference = new Date()): number {
  const ist = new Date(reference.getTime() + IST_OFFSET_MS);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

export function isWithinCallingWindow(args: {
  start: string | null | undefined;
  end: string | null | undefined;
  now?: Date;
}): boolean {
  const now = nowInIstMinutes(args.now ?? new Date());
  const startMin = parseTimeToMinutes(args.start || "10:00:00");
  const endMin = parseTimeToMinutes(args.end || "19:00:00");
  return now >= startMin && now < endMin;
}

export function nextCallingWindowStartIso(args: {
  start: string | null | undefined;
  now?: Date;
}): string {
  const now = args.now ?? new Date();
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const startMin = parseTimeToMinutes(args.start || "10:00:00");
  const startHour = Math.floor(startMin / 60);
  const startMinute = startMin % 60;

  const candidateIst = new Date(istNow);
  candidateIst.setUTCHours(startHour, startMinute, 0, 0);
  if (candidateIst.getTime() <= istNow.getTime()) {
    candidateIst.setUTCDate(candidateIst.getUTCDate() + 1);
  }
  return new Date(candidateIst.getTime() - IST_OFFSET_MS).toISOString();
}
