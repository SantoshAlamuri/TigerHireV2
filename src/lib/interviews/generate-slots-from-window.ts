const DEFAULT_SLOT_MINUTES = 60;

/**
 * Split an availability window into fixed-duration bookable slots.
 */
export function generateSlotsFromWindow(
  startsAt: string,
  endsAt: string,
  durationMinutes = DEFAULT_SLOT_MINUTES,
): Array<{ start_at: string; end_at: string }> {
  const startMs = new Date(startsAt).getTime();
  const endMs = new Date(endsAt).getTime();
  const durationMs = durationMinutes * 60 * 1000;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];

  const slots: Array<{ start_at: string; end_at: string }> = [];
  let cursor = startMs;
  while (cursor + durationMs <= endMs) {
    slots.push({
      start_at: new Date(cursor).toISOString(),
      end_at: new Date(cursor + durationMs).toISOString(),
    });
    cursor += durationMs;
  }
  return slots;
}
