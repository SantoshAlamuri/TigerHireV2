export type SlaHealth = "green" | "amber" | "red";

/**
 * Uses calendar-day SLA: compare elapsed time since `updatedAt` to `slaDays` full days.
 * `null` sla means no SLA (no pressure).
 */
export function computeSlaHealth(
  updatedAtIso: string | null | undefined,
  slaDays: number | null | undefined,
): {
  health: SlaHealth | null;
  daysInStage: number | null;
  overdueDays: number | null;
} {
  if (slaDays == null || slaDays <= 0 || !updatedAtIso) {
    return { health: null, daysInStage: null, overdueDays: null };
  }
  const updated = Date.parse(updatedAtIso);
  if (!Number.isFinite(updated)) {
    return { health: null, daysInStage: null, overdueDays: null };
  }
  const elapsedMs = Date.now() - updated;
  const breachMs = slaDays * 86_400_000;
  const daysInStage = elapsedMs / 86_400_000;
  if (elapsedMs >= breachMs) {
    const overdueDays = Math.max(0, (elapsedMs - breachMs) / 86_400_000);
    return { health: "red", daysInStage, overdueDays };
  }
  if (elapsedMs >= breachMs - 86_400_000) {
    return { health: "amber", daysInStage, overdueDays: null };
  }
  return { health: "green", daysInStage, overdueDays: null };
}
