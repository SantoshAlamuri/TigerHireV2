/**
 * Pure helpers for application-deadline reminder scheduling (A2).
 */

export type ApplicationDeadlineReminderKind = "7d" | "24h";

const HOURS_7D = 7 * 24;

export function planApplicationDeadlineReminder(params: {
  hoursLeft: number;
  sent7d: boolean;
  sent24h: boolean;
}): ApplicationDeadlineReminderKind | null {
  const { hoursLeft, sent7d, sent24h } = params;
  if (!Number.isFinite(hoursLeft) || hoursLeft <= 0) return null;
  if (!sent24h && hoursLeft <= 24) return "24h";
  if (!sent7d && hoursLeft <= HOURS_7D) return "7d";
  return null;
}

export function hoursUntil(isoDate: string, nowMs: number): number {
  const t = new Date(isoDate).getTime();
  if (!Number.isFinite(t)) return NaN;
  return (t - nowMs) / (1000 * 60 * 60);
}
