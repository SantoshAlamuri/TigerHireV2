"use client";

import { useApiQuery } from "@/lib/hooks/use-api";

/**
 * The brief an agency works from: what "good" means on this role, read-only.
 *
 * Agencies currently submit blind and find out weeks later that half the CVs
 * missed a must-have nobody told them about. The rubric already exists; showing
 * it as a brief costs nothing and is the difference between wasted submissions
 * and useful ones.
 *
 * "Auto-held" is not a warning invented for this screen — it describes the
 * upload gate that already runs in production: a submitted CV waits until the
 * candidate answers screening on WhatsApp. Agencies see uploads sit there with
 * no explanation today, which reads as the product being broken.
 */
function Col({
  title,
  count,
  tone,
  items,
  empty,
}: {
  title: string;
  count: string;
  tone: "g" | "a" | "r";
  items: string[];
  empty: string;
}) {
  const border =
    tone === "g"
      ? "border-emerald-400/25"
      : tone === "a"
        ? "border-amber-400/25"
        : "border-white/15";
  const text =
    tone === "g" ? "text-emerald-300" : tone === "a" ? "text-amber-300" : "text-white/60";
  return (
    <div className={`rounded-lg border bg-[var(--surface)]/40 p-3 ${border}`}>
      <h4 className={`flex items-center justify-between text-xs font-bold ${text}`}>
        <span>{title}</span>
        <b className="font-mono tabular-nums">{count}</b>
      </h4>
      {items.length === 0 ? (
        <p className="mt-2 text-[11px] text-white/35">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((t) => (
            <li key={t} className="text-[12px] leading-snug text-white/70">
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AgencyBrief({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const { data } = useApiQuery<{
    mustHaves?: string[];
    applyQuestions?: { id: string; questionText?: string }[];
  }>(jobId ? `/api/jobs/${jobId}/whatsapp-screening` : null);

  const mustHaves = data?.mustHaves ?? [];
  const asks = (data?.applyQuestions ?? []).map((q) => q.questionText ?? "").filter(Boolean);

  return (
    <div className="mt-4">
      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/35">
        The brief — what good means on {jobTitle}
      </h2>
      <div className="grid gap-2 md:grid-cols-3">
        <Col
          title="Must have"
          count={String(mustHaves.length)}
          tone="g"
          items={mustHaves}
          empty="The client has not published must-haves for this role yet."
        />
        <Col
          title="Screening asks"
          count={String(asks.length)}
          tone="a"
          items={asks}
          empty="No screening questions set on this role yet."
        />
        <Col
          title="Auto-held"
          count="·"
          tone="r"
          items={[
            "Uploads wait until the candidate answers screening on WhatsApp — they are not lost, and no action is needed from you.",
          ]}
          empty=""
        />
      </div>
    </div>
  );
}
