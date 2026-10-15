/**
 * Screening reach: how many candidates were messaged, and how many answered.
 *
 * The denominator is the point. Reply rate has to divide by messages actually
 * SENT (prescreen_sessions.questions_sent_at), not by sessions created. A
 * session that exists but never went out — a failed send, a candidate with no
 * phone number — is not somebody ignoring us. Counting it as one understates the
 * reply rate and hides a delivery problem behind a candidate-behaviour metric.
 *
 * A decline counts as a reply. The candidate responded; they just said no.
 */
export interface SessionRow {
  questions_sent_at?: string | null;
  completed_at?: string | null;
  declined_at?: string | null;
}

export interface Reach {
  sent: number;
  replied: number;
  declined: number;
  /** Sessions that exist but were never delivered — a delivery signal. */
  neverSent: number;
  replyRate: number | null;
}

export function screeningReach(rows: SessionRow[]): Reach {
  const sentRows = rows.filter((r) => Boolean(r.questions_sent_at));
  const replied = sentRows.filter((r) => r.completed_at || r.declined_at).length;
  const declined = sentRows.filter((r) => r.declined_at).length;
  return {
    sent: sentRows.length,
    replied,
    declined,
    neverSent: rows.length - sentRows.length,
    replyRate:
      sentRows.length > 0 ? Math.min(100, Math.round((replied / sentRows.length) * 100)) : null,
  };
}
