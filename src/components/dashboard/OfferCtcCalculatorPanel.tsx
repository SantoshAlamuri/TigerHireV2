"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calculator, CheckCircle2, Plus, Trash2 } from "lucide-react";
import {
  computeAnnualCtcFromLineItems,
  formatAnnualCompact,
  formatCtcLpaInr,
  formatLpaShort,
  resolveConfiguredCtcItems,
  type OfferCtcFormula,
} from "@/lib/offers/offer-ctc-calculator";

export type OfferCtcApplyExtras = {
  components: { label: string; annual: number }[];
  variablePercentOfSubtotal: number;
  joiningBonus: number;
  includeJoiningInAnnual: boolean;
};

type Props = {
  /** Band currency for labels (defaults INR). */
  currencyHint?: string;
  /** Optional admin-defined default component rows. */
  initialComponents?: { label: string; annual?: number | null; formula?: OfferCtcFormula | null }[];
  /** Optional target annual CTC that auto-fills manual component rows. */
  targetAnnualCtc?: number | null;
  /** Called when user applies the computed CTC to the offer draft. */
  onApply: (params: {
    ctc: number;
    breakdown: string;
    ctcLpaLabel: string;
    extras: OfferCtcApplyExtras;
  }) => void;
};

type Row = {
  id: string;
  label: string;
  amount: string;
  mode: "manual" | "formula";
  formulaBasis: "base" | "subtotal";
  formulaPercent: string;
};

type CalculationMode = "target" | "details";

function newRowId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `r_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function toInitialRows(
  initialComponents?: { label: string; annual?: number | null; formula?: OfferCtcFormula | null }[],
): Row[] {
  if (!initialComponents || initialComponents.length === 0) {
    return [
      {
        id: newRowId(),
        label: "Base / fixed pay",
        amount: "",
        mode: "manual",
        formulaBasis: "base",
        formulaPercent: "",
      },
      {
        id: newRowId(),
        label: "HRA",
        amount: "",
        mode: "formula",
        formulaBasis: "base",
        formulaPercent: "40",
      },
      {
        id: newRowId(),
        label: "Employer PF",
        amount: "",
        mode: "formula",
        formulaBasis: "base",
        formulaPercent: "12",
      },
      {
        id: newRowId(),
        label: "Allowances & cash benefits",
        amount: "",
        mode: "manual",
        formulaBasis: "base",
        formulaPercent: "",
      },
    ];
  }
  const rows = initialComponents
    .slice(0, 12)
    .map<Row>((row) => ({
      id: newRowId(),
      label: row.label?.trim() || "Component",
      amount:
        typeof row.annual === "number" && Number.isFinite(row.annual) && row.annual > 0
          ? String(Math.round(row.annual))
          : "",
      mode: row.formula ? "formula" : "manual",
      formulaBasis: row.formula?.basis ?? "base",
      formulaPercent:
        typeof row.formula?.percent === "number" && Number.isFinite(row.formula.percent)
          ? String(row.formula.percent)
          : "",
    }))
    .filter((row) => row.label.length > 0);
  return rows.length > 0
    ? rows
    : [
        {
          id: newRowId(),
          label: "Component",
          amount: "",
          mode: "manual",
          formulaBasis: "base",
          formulaPercent: "",
        },
      ];
}

export function OfferCtcCalculatorPanel({
  currencyHint = "INR",
  initialComponents,
  targetAnnualCtc,
  onApply,
}: Props) {
  const [rows, setRows] = useState<Row[]>(() => toInitialRows(initialComponents));
  const [calculationMode, setCalculationMode] = useState<CalculationMode>(() =>
    targetAnnualCtc && targetAnnualCtc > 0 ? "target" : "details",
  );
  const [targetCtcInput, setTargetCtcInput] = useState(() =>
    targetAnnualCtc && targetAnnualCtc > 0 ? String(Math.round(targetAnnualCtc)) : "",
  );
  const [variablePct, setVariablePct] = useState("10");
  const [joining, setJoining] = useState("0");
  const [includeJoining, setIncludeJoining] = useState(true);
  const lastAutoFilledTargetRef = useRef<number | null>(null);

  useEffect(() => {
    setRows(toInitialRows(initialComponents));
  }, [initialComponents]);

  const parsedItems = useMemo(() => {
    return rows.map((r) => {
      const annual = Number(String(r.amount).replace(/,/g, ""));
      const formulaPercent = Number(String(r.formulaPercent).replace(/,/g, ""));
      return {
        label: r.label.trim() || "Component",
        annual,
        formula:
          r.mode === "formula"
            ? {
                basis: r.formulaBasis,
                percent: Number.isFinite(formulaPercent) ? formulaPercent : 0,
              }
            : null,
      };
    });
  }, [rows]);

  const parsedJoining = useMemo(() => Number(String(joining).replace(/,/g, "")), [joining]);
  const parsedVp = useMemo(() => Number(String(variablePct).replace(/,/g, "")), [variablePct]);
  const parsedTargetCtc = useMemo(
    () => Number(String(targetCtcInput).replace(/,/g, "")),
    [targetCtcInput],
  );

  const autoPopulateFromTargetCtc = useCallback(
    (target: number) => {
      if (!Number.isFinite(target) || target <= 0) return;
      const vp = Number.isFinite(parsedVp) ? Math.max(0, Math.min(100, parsedVp)) : 0;
      const joiningBonus = Number.isFinite(parsedJoining) ? Math.max(0, parsedJoining) : 0;
      const ctcBeforeJoining = target - (includeJoining ? joiningBonus : 0);
      if (ctcBeforeJoining <= 0) return;

      const ctcMultiplier = 1 + vp / 100;
      const targetComponentSubtotal = ctcBeforeJoining / ctcMultiplier;
      if (!Number.isFinite(targetComponentSubtotal) || targetComponentSubtotal <= 0) return;

      setRows((prev) => {
        const manualIndices: number[] = [];
        let sumBasePct = 0;
        let sumSubtotalPct = 0;

        prev.forEach((row, idx) => {
          if (row.mode === "manual") {
            manualIndices.push(idx);
          } else {
            const pct = Number(String(row.formulaPercent).replace(/,/g, ""));
            const normalizedPct = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) / 100 : 0;
            if (row.formulaBasis === "base") sumBasePct += normalizedPct;
            else sumSubtotalPct += normalizedPct;
          }
        });

        if (manualIndices.length === 0) return prev;

        const weights = manualIndices.map((idx) => {
          const n = Number(String(prev[idx]?.amount ?? "").replace(/,/g, ""));
          return Number.isFinite(n) && n > 0 ? n : 1;
        });

        const denominator = manualIndices.reduce((sum, _idx, i) => {
          const coeff = i === 0 ? 1 + sumSubtotalPct + sumBasePct : 1 + sumSubtotalPct;
          return sum + weights[i]! * coeff;
        }, 0);
        if (!Number.isFinite(denominator) || denominator <= 0) return prev;

        const scale = targetComponentSubtotal / denominator;
        if (!Number.isFinite(scale) || scale <= 0) return prev;

        return prev.map((row, idx) => {
          const manualPos = manualIndices.indexOf(idx);
          if (manualPos === -1) return row;
          const nextAnnual = Math.max(0, Math.round(scale * (weights[manualPos] ?? 0)));
          return { ...row, amount: String(nextAnnual) };
        });
      });
    },
    [includeJoining, parsedJoining, parsedVp],
  );

  useEffect(() => {
    if (!targetAnnualCtc || targetAnnualCtc <= 0 || !Number.isFinite(targetAnnualCtc)) {
      lastAutoFilledTargetRef.current = null;
      return;
    }
    const roundedTarget = Math.round(targetAnnualCtc);
    setTargetCtcInput(String(roundedTarget));
    if (lastAutoFilledTargetRef.current === roundedTarget) return;
    autoPopulateFromTargetCtc(roundedTarget);
    lastAutoFilledTargetRef.current = roundedTarget;
  }, [autoPopulateFromTargetCtc, targetAnnualCtc]);

  const preview = useMemo(() => {
    const vp = Number.isFinite(parsedVp) ? parsedVp : 0;
    const joiningBonus = Number.isFinite(parsedJoining) ? Math.max(0, parsedJoining) : 0;
    const resolved = resolveConfiguredCtcItems(parsedItems);
    return computeAnnualCtcFromLineItems({
      items: resolved.resolvedItems,
      variablePercentOfSubtotal: vp,
      joiningBonus,
      includeJoiningInAnnual: includeJoining,
    });
  }, [parsedItems, parsedVp, parsedJoining, includeJoining]);

  const derivedByRow = useMemo(() => {
    const manualRows = parsedItems.filter((r) => !r.formula);
    const manualSubtotal = manualRows.reduce(
      (sum, row) => sum + (Number.isFinite(row.annual) && row.annual > 0 ? row.annual : 0),
      0,
    );
    const baseAnnual =
      Number.isFinite(manualRows[0]?.annual) && (manualRows[0]?.annual ?? 0) > 0
        ? (manualRows[0]?.annual ?? 0)
        : 0;
    return rows.map((row, idx) => {
      if (row.mode !== "formula") return null;
      const parsed = parsedItems[idx];
      const percent = Math.max(0, Math.min(100, parsed?.formula?.percent ?? 0));
      const source = row.formulaBasis === "base" ? baseAnnual : manualSubtotal;
      return (source * percent) / 100;
    });
  }, [rows, parsedItems]);

  const canPreview = preview.componentSubtotal > 0;
  const displayVariablePct = Number.isFinite(parsedVp) ? Math.max(0, Math.min(100, parsedVp)) : 0;
  const displayJoining = Number.isFinite(parsedJoining) ? Math.max(0, parsedJoining) : 0;
  const canCalculateFromTarget = Number.isFinite(parsedTargetCtc) && parsedTargetCtc > 0;

  const addRow = useCallback(() => {
    setRows((prev) => [
      ...prev,
      {
        id: newRowId(),
        label: "",
        amount: "",
        mode: "manual",
        formulaBasis: "base",
        formulaPercent: "",
      },
    ]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }, []);

  const updateRow = useCallback((id: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const handleCalculateFromTarget = useCallback(() => {
    if (!canCalculateFromTarget) return;
    const roundedTarget = Math.round(parsedTargetCtc);
    autoPopulateFromTargetCtc(roundedTarget);
    lastAutoFilledTargetRef.current = roundedTarget;
  }, [autoPopulateFromTargetCtc, canCalculateFromTarget, parsedTargetCtc]);

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/35 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/35 bg-amber-400/10 text-[var(--accent)]">
            <Calculator size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">CTC calculator</p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--text-muted)]">
              Start with a target CTC to calculate salary components, or enter salary details to add
              up the final CTC. The applied value feeds <code>{"{{ctc_lpa}}"}</code> and{" "}
              <code>{"{{compensation_breakdown}}"}</code> in the offer letter.
            </p>
          </div>
        </div>
        {targetAnnualCtc && targetAnnualCtc > 0 ? (
          <div className="rounded-full border border-amber-300/35 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200">
            Target {formatAnnualCompact(Math.round(targetAnnualCtc), currencyHint)}
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setCalculationMode("target")}
          className={`rounded-xl border px-3 py-3 text-left transition ${
            calculationMode === "target"
              ? "border-amber-300/60 bg-amber-400/10 text-[var(--text)]"
              : "border-[var(--border)] bg-[var(--bg-elevated)]/30 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]/50"
          }`}
        >
          <span className="block text-xs font-semibold text-[var(--text)]">Start from CTC</span>
          <span className="mt-1 block text-[11px] leading-relaxed">
            Enter the target annual CTC and calculate the salary component split.
          </span>
        </button>
        <button
          type="button"
          onClick={() => setCalculationMode("details")}
          className={`rounded-xl border px-3 py-3 text-left transition ${
            calculationMode === "details"
              ? "border-amber-300/60 bg-amber-400/10 text-[var(--text)]"
              : "border-[var(--border)] bg-[var(--bg-elevated)]/30 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]/50"
          }`}
        >
          <span className="block text-xs font-semibold text-[var(--text)]">
            Build from salary details
          </span>
          <span className="mt-1 block text-[11px] leading-relaxed">
            Enter fixed pay, formula lines, variable pay, and bonus to add up CTC.
          </span>
        </button>
      </div>

      {calculationMode === "target" ? (
        <div className="mt-3 rounded-xl border border-amber-300/30 bg-amber-400/[0.07] p-3">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <label className="block text-xs font-medium text-[var(--text)]">
              Target annual CTC
              <input
                className="mt-2 w-full rounded-lg border border-amber-300/35 bg-[var(--surface)]/60 px-3 py-2 text-sm text-[var(--text)] outline-none transition focus:border-amber-300/70 focus-visible:ring-2 focus-visible:ring-white/25"
                inputMode="decimal"
                value={targetCtcInput}
                onChange={(e) => setTargetCtcInput(e.target.value)}
                placeholder="e.g. 2400000"
              />
              <span className="mt-1 block text-[11px] font-normal text-[var(--text-muted)]">
                Uses current variable %, joining bonus, and formula rules to distribute manual rows.
              </span>
            </label>
            <button
              type="button"
              disabled={!canCalculateFromTarget}
              onClick={handleCalculateFromTarget}
              className="inline-flex justify-center rounded-full border border-amber-300/50 bg-amber-400/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Calculate salary split
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/35">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5">
          <div>
            <p className="text-xs font-semibold text-[var(--text)]">Annual components</p>
            <p className="text-[11px] text-[var(--text-muted)]">
              Enter full yearly amounts in {currencyHint}; for example 2400000 is{" "}
              {formatLpaShort(2_400_000)}.
            </p>
          </div>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
          >
            <Plus size={13} aria-hidden />
            Add line
          </button>
        </div>

        <div className="divide-y divide-[var(--border)]">
          {rows.map((row, rowIndex) => {
            const derivedAmount = row.mode === "formula" ? (derivedByRow[rowIndex] ?? 0) : null;
            return (
              <div
                key={row.id}
                className="grid gap-2 px-3 py-3 md:grid-cols-[minmax(150px,1fr)_132px_minmax(180px,1.25fr)_112px_36px]"
              >
                <label className="space-y-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-subtle)] sm:text-xs">
                    Label
                  </span>
                  <input
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-xs text-[var(--text)] outline-none transition focus:border-amber-300/50 focus-visible:ring-2 focus-visible:ring-white/25"
                    placeholder="Base / fixed pay"
                    value={row.label}
                    onChange={(e) => updateRow(row.id, { label: e.target.value })}
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-subtle)] sm:text-xs">
                    Type
                  </span>
                  <select
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-medium text-[var(--text)] outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                    style={{ colorScheme: "dark" }}
                    value={row.mode}
                    onChange={(e) =>
                      updateRow(row.id, { mode: e.target.value as "manual" | "formula" })
                    }
                  >
                    <option className="bg-[var(--bg)] text-[var(--text)]" value="manual">
                      Amount
                    </option>
                    <option className="bg-[var(--bg)] text-[var(--text)]" value="formula">
                      Formula
                    </option>
                  </select>
                </label>

                {row.mode === "manual" ? (
                  <label className="space-y-1">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-subtle)] sm:text-xs">
                      Annual amount
                    </span>
                    <input
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-xs text-[var(--text)] outline-none transition focus:border-amber-300/50 focus-visible:ring-2 focus-visible:ring-white/25"
                      placeholder="e.g. 1800000"
                      inputMode="decimal"
                      value={row.amount}
                      onChange={(e) => updateRow(row.id, { amount: e.target.value })}
                    />
                  </label>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-subtle)] sm:text-xs">
                        Basis
                      </span>
                      <select
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-medium text-[var(--text)] outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                        style={{ colorScheme: "dark" }}
                        value={row.formulaBasis}
                        onChange={(e) =>
                          updateRow(row.id, {
                            formulaBasis: e.target.value as "base" | "subtotal",
                          })
                        }
                      >
                        <option className="bg-[var(--bg)] text-[var(--text)]" value="base">
                          % of base
                        </option>
                        <option className="bg-[var(--bg)] text-[var(--text)]" value="subtotal">
                          % subtotal
                        </option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-subtle)] sm:text-xs">
                        Percent
                      </span>
                      <input
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-xs text-[var(--text)] outline-none transition focus:border-amber-300/50 focus-visible:ring-2 focus-visible:ring-white/25"
                        placeholder="40"
                        inputMode="decimal"
                        value={row.formulaPercent}
                        onChange={(e) => updateRow(row.id, { formulaPercent: e.target.value })}
                      />
                    </label>
                  </div>
                )}

                <div className="space-y-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-subtle)] sm:text-xs">
                    Result
                  </span>
                  <div className="flex min-h-9 items-center rounded-lg border border-[var(--border)] bg-black/10 px-3 text-xs font-medium text-[var(--text)]">
                    {row.mode === "formula"
                      ? formatAnnualCompact(derivedAmount ?? 0, currencyHint)
                      : row.amount
                        ? formatAnnualCompact(
                            Number(String(row.amount).replace(/,/g, "")),
                            currencyHint,
                          )
                        : "Not set"}
                  </div>
                </div>

                <div className="flex items-end justify-end">
                  <button
                    type="button"
                    aria-label="Remove line"
                    title="Remove line"
                    disabled={rows.length <= 1}
                    onClick={() => removeRow(row.id)}
                    className="mb-1 rounded-lg p-2 text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:opacity-30"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_1.2fr]">
        <label className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/35 p-3 text-xs text-[var(--text-muted)]">
          Variable pay
          <div className="mt-2 flex items-center gap-2">
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-sm text-[var(--text)] outline-none transition focus:border-amber-300/50 focus-visible:ring-2 focus-visible:ring-white/25"
              inputMode="decimal"
              value={variablePct}
              onChange={(e) => setVariablePct(e.target.value)}
              placeholder="e.g. 12"
            />
            <span className="text-sm font-semibold text-[var(--text)]">%</span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--text-subtle)]">
            Calculated on component subtotal.
          </p>
        </label>

        <label className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/35 p-3 text-xs text-[var(--text-muted)]">
          Joining bonus
          <input
            className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-sm text-[var(--text)] outline-none transition focus:border-amber-300/50 focus-visible:ring-2 focus-visible:ring-white/25"
            inputMode="decimal"
            value={joining}
            onChange={(e) => setJoining(e.target.value)}
            placeholder="0"
          />
          <p className="mt-1 text-[11px] text-[var(--text-subtle)]">One-time amount.</p>
        </label>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/35 p-3 text-xs text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={includeJoining}
            onChange={(e) => setIncludeJoining(e.target.checked)}
            className="rounded border-[var(--border)]"
          />
          <span>
            <span className="block font-medium text-[var(--text)]">
              Include joining bonus in annual CTC
            </span>
            <span className="mt-0.5 block text-[11px] text-[var(--text-subtle)]">
              Turn this off when the joining bonus should stay outside annual CTC.
            </span>
          </span>
        </label>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-amber-300/30 bg-amber-400/[0.08] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-200/80">
            Computed annual CTC
          </p>
          {canPreview ? (
            <>
              <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                {formatCtcLpaInr(preview.ctc)}
              </p>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-[var(--text-subtle)]">Components</dt>
                  <dd className="font-medium text-[var(--text)]">
                    {formatAnnualCompact(preview.componentSubtotal, currencyHint)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--text-subtle)]">Variable ({displayVariablePct}%)</dt>
                  <dd className="font-medium text-[var(--text)]">
                    {formatAnnualCompact(preview.variableAmount, currencyHint)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--text-subtle)]">Joining</dt>
                  <dd className="font-medium text-[var(--text)]">
                    {formatAnnualCompact(displayJoining, currencyHint)}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Enter at least one positive annual amount to preview the CTC.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]/35 p-4">
          <p className="text-xs font-semibold text-[var(--text)]">Offer breakdown preview</p>
          {canPreview ? (
            <div className="mt-3 space-y-1.5 text-xs text-[var(--text-muted)]">
              {preview.breakdownLines.map((line) => (
                <div key={line} className="flex gap-2">
                  <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-300" />
                  <span>{line}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              The breakdown will appear here and will be copied into the offer draft.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={!canPreview}
          onClick={() => {
            if (!canPreview) return;
            const vp = Number.isFinite(parsedVp) ? parsedVp : 0;
            const joiningBonus = Number.isFinite(parsedJoining) ? Math.max(0, parsedJoining) : 0;
            onApply({
              ctc: preview.ctc,
              breakdown: preview.breakdownLines.join("\n"),
              ctcLpaLabel: formatCtcLpaInr(preview.ctc),
              extras: {
                components: preview.resolvedItems.map((r) => ({
                  label: r.label,
                  annual: r.annual,
                })),
                variablePercentOfSubtotal: vp,
                joiningBonus,
                includeJoiningInAnnual: includeJoining,
              },
            });
          }}
          className="inline-flex items-center justify-center rounded-full border border-amber-300/50 bg-amber-400/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Apply to offer CTC
        </button>
      </div>
    </section>
  );
}
