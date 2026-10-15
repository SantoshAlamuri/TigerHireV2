/**
 * Did an email provider call actually fail?
 *
 * The production outbound hold used to return a fake success id with a null
 * error, so every caller recorded a delivery that never happened. It now returns
 * a real error — but acknowledgement recorders write to attempt tables that
 * suppress re-sends for 24h, so logging a provider error as "sent" would
 * silently swallow the message even after the env var is corrected.
 *
 * Accepts the loose shapes the various send helpers return.
 */
export function providerSendFailed(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const r = result as { error?: unknown; data?: { error?: unknown } | null };
  if (r.error) return true;
  if (r.data && typeof r.data === "object" && (r.data as { error?: unknown }).error) return true;
  return false;
}
