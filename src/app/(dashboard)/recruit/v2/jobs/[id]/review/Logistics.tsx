"use client";

import type { ReviewAppRow } from "./useEvidencePack";
import { indianPhone } from "@/lib/v2/phone";

/**
 * The logistics strip: the four facts that decide whether a good candidate is
 * actually hireable. A strong score with a 90-day notice and two offers in hand
 * is a different proposition to the same score without them, and a reviewer
 * should not have to open the profile to find that out.
 */
function Cell({ k, v, tone }: { k: string; v: string; tone?: "ok" | "warn" }) {
  return (
    <div className="bg-[var(--panel)] px-2.5 py-1.5">
      <div className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
        {k}
      </div>
      <div
        className={`mt-0.5 text-[13px] font-semibold ${
          tone === "warn"
            ? "text-amber-300"
            : tone === "ok"
              ? "text-emerald-300"
              : "text-[var(--text)]"
        }`}
      >
        {v}
      </div>
    </div>
  );
}

export function Logistics({ row }: { row: ReviewAppRow | undefined }) {
  if (!row) return null;

  const notice = row.notice_period_days;
  const ctc = row.expected_ctc_lpa;
  const offers = row.offers_in_hand ?? 0;
  const location = row.candidates?.location?.trim();

  return (
    <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
      <Cell
        k="Notice"
        v={notice == null ? "—" : notice === 0 ? "Immediate" : `${notice} days`}
        // Long notice is the quiet reason a hire slips a quarter.
        tone={notice == null ? undefined : notice <= 30 ? "ok" : notice >= 60 ? "warn" : undefined}
      />
      <Cell k="Expected CTC" v={ctc ? `₹${ctc}L` : "—"} />
      <Cell
        k="Offers in hand"
        v={offers > 0 ? String(offers) : "None disclosed"}
        tone={offers > 0 ? "warn" : undefined}
      />
      <Cell k="Location" v={location || "—"} />
    </div>
  );
}
