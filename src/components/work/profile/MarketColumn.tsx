"use client";

import { useMemo, useState } from "react";
import { useApiMutation, useApiQuery, invalidateQueries } from "@/lib/hooks/use-api";
import type { PanelProps } from "@/components/work/panels";
import { getIndiaJdTemplateById } from "@/lib/fitscore/hybrid/jd-india-templates";
import { RANKING_MIN_POOL, lpa, rankingSpread, readPay, type PayBand } from "@/lib/work/profile";
import type { JdBaseView } from "./ProfileBlock";
import s from "./profile.module.css";

interface AppRow {
  expected_ctc_lpa?: number | null;
  fit_scores?: { market_label?: string | null; overall_score?: number | null } | null;
}

/**
 * The market around this role: which role template the scoring stands on,
 * how the pay compares with your bands and with what applicants ask, and how
 * candidates rank against the pool.
 */
type Row = "template" | "pay" | "ranking";

export function MarketRows({
  jobId,
  job,
  doc,
  onLog,
  onTemplate,
}: {
  jobId: string;
  job: PanelProps["job"];
  doc: NonNullable<JdBaseView["jdBase"]>;
  onLog: PanelProps["onLog"];
  onTemplate: () => Promise<void>;
}) {
  const [open, setOpen] = useState<Row | null>(null);
  const bands = useApiQuery<{ bands: PayBand[] }>("/api/compensation-bands");
  const apps = useApiQuery<{ applications: AppRow[] }>("/api/applications", {
    jobId,
    limit: 100,
    fields: "review",
  });
  const [saved, setSaved] = useState<{ min: number | null; max: number | null } | null>(null);
  const range = saved ?? { min: job.compensation_min ?? null, max: job.compensation_max ?? null };
  const rows = apps.data?.applications ?? [];
  const pay = readPay(
    range,
    bands.data?.bands ?? [],
    rows.map((r) => r.expected_ctc_lpa),
  );
  const spread = rankingSpread(rows.map((r) => r.fit_scores?.market_label));
  const tpl = doc.indiaTemplateId ? getIndiaJdTemplateById(doc.indiaTemplateId) : undefined;

  const payWarn =
    pay.withinRange != null && pay.asks.count >= 5 && pay.withinRange < 30
      ? `applicants ask ${lpa(pay.asks.median)}`
      : null;
  const items: { key: Row; label: string; value: string; warn?: string | null }[] = [
    {
      key: "template",
      label: "Role template",
      value: tpl ? tpl.roleTitle : "Drafted by the agent",
    },
    {
      key: "pay",
      label: "Pay",
      value: range.max ? `${lpa(range.min)} to ${lpa(range.max)}` : "No range set",
      warn: payWarn,
    },
    {
      key: "ranking",
      label: "Market ranking",
      value: spread.length
        ? spread
            .map((x) => `${x.count} ${x.label}`)
            .slice(0, 2)
            .join(", ")
        : "Not enough scored yet",
    },
  ];

  return (
    <section aria-label="Market" className={s.rows}>
      <h3 className={s.groupTitle} style={{ marginBottom: 4 }}>
        Market
      </h3>
      {items.map((r) => {
        const isOpen = open === r.key;
        return (
          <div key={r.key} className={s.rowWrap}>
            <button
              type="button"
              className={s.discl}
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : r.key)}
            >
              <span className={s.disclLabel}>{r.label}</span>
              <span className={s.disclPreview}>
                {r.value}
                {r.warn && <span className={s.warn}> · {r.warn}</span>}
              </span>
              <span className={s.disclCount}>
                <i aria-hidden="true">{isOpen ? "−" : "+"}</i>
              </span>
            </button>
            {isOpen && (
              <div className={s.disclBody}>
                {r.key === "template" && (
                  <TemplateCard jobId={jobId} doc={doc} onLog={onLog} onTemplate={onTemplate} />
                )}
                {r.key === "pay" && (
                  <PayBody
                    jobId={jobId}
                    range={range}
                    pay={pay}
                    hasBands={(bands.data?.bands ?? []).length > 0}
                    onLog={onLog}
                    onSaved={setSaved}
                  />
                )}
                {r.key === "ranking" && (
                  <RankingBody spread={spread} loading={apps.loading && !apps.data} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function TemplateCard({
  jobId,
  doc,
  onLog,
  onTemplate,
}: {
  jobId: string;
  doc: NonNullable<JdBaseView["jdBase"]>;
  onLog: PanelProps["onLog"];
  onTemplate: () => Promise<void>;
}) {
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState("");
  const list = useApiQuery<{ templates: { id: string; category: string; roleTitle: string }[] }>(
    picking ? "/api/fitscore/jd-base/templates" : null,
  );
  const apply = useApiMutation<{ jobId: string; templateId: string }, unknown>(
    "/api/fitscore/jd-base/from-template",
    "POST",
  );
  const tpl = doc.indiaTemplateId ? getIndiaJdTemplateById(doc.indiaTemplateId) : undefined;
  const groups = useMemo(() => {
    const m = new Map<string, { id: string; roleTitle: string }[]>();
    for (const t of list.data?.templates ?? []) {
      m.set(t.category, [...(m.get(t.category) ?? []), t]);
    }
    return [...m.entries()];
  }, [list.data]);
  const signals = (tpl?.signals ?? "")
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 6);
  const redFlags = (tpl?.redFlags ?? "")
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 4);

  return (
    <div className={s.body}>
      {doc.scoringFoundation === "india_template" && tpl ? (
        <>
          <span className={s.big}>{tpl.roleTitle}</span>
          <span className={`${s.small} ${s.faint}`}>
            {tpl.category} · from the India role library
          </span>
          {signals.length > 0 && (
            <div className={s.tags} aria-label="What good looks like">
              {signals.map((x) => (
                <span key={x} className={s.tag}>
                  {x}
                </span>
              ))}
            </div>
          )}
          {redFlags.length > 0 && (
            <p className={s.small}>
              <span style={{ color: "var(--wd-bad)" }}>Watch for:</span> {redFlags.join(", ")}
            </p>
          )}
        </>
      ) : (
        <p className={s.small}>
          Drafted by the agent from your description, not from a library template.
        </p>
      )}
      {picking ? (
        <div className="wd-stack" style={{ gap: 8 }}>
          <select
            className={s.select}
            value={choice}
            aria-label="Role template"
            onChange={(e) => setChoice(e.target.value)}
          >
            <option value="">{list.loading ? "Loading templates…" : "Pick a role"}</option>
            {groups.map(([cat, items]) => (
              <optgroup key={cat} label={cat}>
                {items.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.roleTitle}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {choice && (
            <p className={s.small}>
              This replaces the weights and the ideal candidate with the template&apos;s. You can
              edit them after.
            </p>
          )}
          {(apply.error || list.error) && <p className="wd-problem">{apply.error ?? list.error}</p>}
          <div className="wd-row-actions">
            <button
              type="button"
              className="wd-btn"
              disabled={!choice || apply.loading}
              onClick={async () => {
                const ok = await apply.mutate({ jobId, templateId: choice });
                if (ok) {
                  onLog("you", "Switched the role template");
                  setPicking(false);
                  setChoice("");
                  await onTemplate();
                }
              }}
            >
              {apply.loading ? "Applying…" : "Use this template"}
            </button>
            <button type="button" className="wd-btn quiet" onClick={() => setPicking(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={s.link} onClick={() => setPicking(true)}>
          {tpl ? "Use a different template" : "Start from a template"}
        </button>
      )}
    </div>
  );
}

function PayBody({
  jobId,
  range,
  pay,
  hasBands,
  onLog,
  onSaved,
}: {
  jobId: string;
  range: { min: number | null; max: number | null };
  pay: ReturnType<typeof readPay>;
  hasBands: boolean;
  onLog: PanelProps["onLog"];
  onSaved: (r: { min: number; max: number }) => void;
}) {
  const patch = useApiMutation<{ compensationMin: number; compensationMax: number }, unknown>(
    `/api/jobs/${jobId}`,
    "PATCH",
  );
  const [editing, setEditing] = useState(false);
  const [minText, setMinText] = useState("");
  const [maxText, setMaxText] = useState("");

  const points = [
    range.min,
    range.max,
    pay.band?.min_amount,
    pay.band?.max_amount,
    pay.asks.low,
    pay.asks.high,
  ].filter((x): x is number => typeof x === "number" && x > 0);
  const lo = points.length ? Math.min(...points) * 0.9 : 0;
  const hi = points.length ? Math.max(...points) * 1.1 : 1;
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  const width = (a: number, b: number) =>
    `${Math.max(1, ((Math.min(b, hi) - Math.max(a, lo)) / (hi - lo)) * 100)}%`;
  const fit: Record<typeof pay.bandFit, string> = {
    inside: `Inside your ${pay.band?.label} band.`,
    overlaps: `Partly outside your ${pay.band?.label} band.`,
    below: `Below your ${pay.band?.label} band.`,
    above: `Above your ${pay.band?.label} band.`,
    no_band: hasBands ? "No pay band overlaps this range." : "No pay bands set up.",
  };

  return (
    <div className={s.body}>
      {editing ? (
        <div className="wd-stack" style={{ gap: 8 }}>
          <span className={s.years}>
            ₹
            <input
              className={s.num}
              style={{ width: 64 }}
              inputMode="decimal"
              aria-label="Minimum LPA"
              value={minText}
              onChange={(e) => setMinText(e.target.value)}
            />
            to
            <input
              className={s.num}
              style={{ width: 64 }}
              inputMode="decimal"
              aria-label="Maximum LPA"
              value={maxText}
              onChange={(e) => setMaxText(e.target.value)}
            />
            LPA
          </span>
          {patch.error && <p className="wd-problem">{patch.error}</p>}
          <div className="wd-row-actions">
            <button
              type="button"
              className="wd-btn"
              disabled={patch.loading}
              onClick={async () => {
                const mn = Math.round(Number(minText) * 100_000);
                const mx = Math.round(Number(maxText) * 100_000);
                if (!(mn > 0 && mx >= mn)) return;
                const ok = await patch.mutate({ compensationMin: mn, compensationMax: mx });
                if (ok) {
                  onSaved({ min: mn, max: mx });
                  setEditing(false);
                  invalidateQueries(`/api/jobs/${jobId}`);
                  onLog("you", `Set pay to ${lpa(mn)} to ${lpa(mx)}`);
                }
              }}
            >
              {patch.loading ? "Saving…" : "Save range"}
            </button>
            <button type="button" className="wd-btn quiet" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {points.length > 1 && (
        <>
          <div className={s.payScale} aria-hidden="true">
            <span className={s.payTrack} />
            {pay.band && (
              <span
                className={s.payBand}
                style={{
                  left: pct(pay.band.min_amount),
                  width: width(pay.band.min_amount, pay.band.max_amount),
                }}
              />
            )}
            {range.min && range.max ? (
              <span
                className={s.payRange}
                style={{ left: pct(range.min), width: width(range.min, range.max) }}
              />
            ) : null}
            {pay.asks.median ? (
              <span className={s.payMedian} style={{ left: pct(pay.asks.median) }} />
            ) : null}
          </div>
          <div className={s.legend}>
            <span>
              <i style={{ background: "var(--wd-amber)" }} />
              Your range
            </span>
            {pay.band && (
              <span>
                <i style={{ background: "color-mix(in srgb, var(--wd-agent) 35%, transparent)" }} />
                {pay.band.label}
              </span>
            )}
            {pay.asks.median ? (
              <span>
                <i style={{ background: "var(--wd-ink)", width: 2 }} />
                Median ask
              </span>
            ) : null}
          </div>
        </>
      )}
      {range.max ? <p className={s.small}>{fit[pay.bandFit]}</p> : null}
      <p className={s.small}>
        {pay.asks.count > 0
          ? `${pay.asks.count} applicants gave an expected salary: median ${lpa(pay.asks.median)}, most between ${lpa(pay.asks.low)} and ${lpa(pay.asks.high)}.${pay.withinRange != null ? ` ${pay.withinRange}% fit your range.` : ""}`
          : "No applicant has given an expected salary yet."}
      </p>
      {!editing && (
        <button
          type="button"
          className={s.link}
          onClick={() => {
            setMinText(range.min ? String(range.min / 100_000) : "");
            setMaxText(range.max ? String(range.max / 100_000) : "");
            setEditing(true);
          }}
        >
          {range.max ? "Change the range" : "Set a range"}
        </button>
      )}
    </div>
  );
}

function RankingBody({
  spread,
  loading,
}: {
  spread: { label: string; count: number }[];
  loading: boolean;
}) {
  const max = Math.max(1, ...spread.map((x) => x.count));
  return (
    <div className={s.body}>
      <p className={s.small}>
        Each scored candidate is ranked against everyone scored for similar roles in your
        organisation. Rankings appear once {RANKING_MIN_POOL} have been scored.
      </p>
      {spread.length ? (
        <div className={s.spread}>
          {spread.map((x) => (
            <div key={x.label} className={s.spreadRow}>
              <span>{x.label}</span>
              <span className={s.spreadBar}>
                <span style={{ width: `${(x.count / max) * 100}%` }} />
              </span>
              <span style={{ textAlign: "right", color: "var(--wd-soft)" }}>{x.count}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className={`${s.small} ${s.faint}`}>
          {loading ? "Loading…" : "No ranked applicants yet."}
        </p>
      )}
    </div>
  );
}
