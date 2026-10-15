"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, Loader2, Plus, Trash2 } from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { SettingsEditableForm } from "@/components/settings/SettingsEditableForm";
import { canEditOrgHiringSettings } from "@/lib/settings/org-hiring-settings-auth";
import { formatAnnualCompact, resolveConfiguredCtcItems } from "@/lib/offers/offer-ctc-calculator";

type FlowStep = string;
type CtcComponent = {
  label: string;
  annual: number | null;
  formula?: { basis: "base" | "subtotal"; percent: number } | null;
};
type CtcCalculator = {
  key: string;
  name: string;
  components: CtcComponent[];
};
type FlowResponse = {
  flow: {
    steps: FlowStep[];
    ctcCalculators: CtcCalculator[];
    defaultCalculatorKey: string;
  };
  canEdit: boolean;
};
type CalculatorMode = "target" | "details";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function parseMoney(value: string): number {
  return Number(String(value).replace(/,/g, ""));
}

function formatMonthlyCompact(annual: number, currency: string): string {
  if (!Number.isFinite(annual) || annual <= 0) return "—";
  return formatAnnualCompact(annual / 12, currency);
}

function distributeTargetCtc(components: CtcComponent[], target: number): CtcComponent[] {
  if (!Number.isFinite(target) || target <= 0) return components;

  const manualIndices: number[] = [];
  let sumBasePct = 0;
  let sumSubtotalPct = 0;

  components.forEach((component, index) => {
    if (!component.formula) {
      manualIndices.push(index);
      return;
    }
    const pct = Number.isFinite(component.formula.percent)
      ? Math.max(0, Math.min(100, component.formula.percent)) / 100
      : 0;
    if (component.formula.basis === "base") sumBasePct += pct;
    else sumSubtotalPct += pct;
  });

  if (manualIndices.length === 0) return components;

  const weights = manualIndices.map((index) => {
    const amount = components[index]?.annual ?? 0;
    return Number.isFinite(amount) && amount > 0 ? amount : 1;
  });
  const denominator = manualIndices.reduce((sum, _index, position) => {
    const isBaseRow = position === 0;
    const coefficient = 1 + sumSubtotalPct + (isBaseRow ? sumBasePct : 0);
    return sum + (weights[position] ?? 0) * coefficient;
  }, 0);
  if (!Number.isFinite(denominator) || denominator <= 0) return components;

  const scale = target / denominator;
  return components.map((component, index) => {
    const manualPosition = manualIndices.indexOf(index);
    if (manualPosition === -1) return component;
    return {
      ...component,
      annual: Math.max(0, Math.round((weights[manualPosition] ?? 0) * scale)),
    };
  });
}

export function OfferLetterFlowSettingsPanel() {
  const { user } = useAuth();
  const { data, loading, error, refetch } = useApiQuery<FlowResponse>(
    "/api/settings/offer-letter-flow",
  );
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [ctcCalculators, setCtcCalculators] = useState<CtcCalculator[]>([]);
  const [activeCalculatorKey, setActiveCalculatorKey] = useState<string>("");
  const [defaultCalculatorKey, setDefaultCalculatorKey] = useState<string>("");
  const [calculatorMode, setCalculatorMode] = useState<CalculatorMode>("target");
  const [targetCtc, setTargetCtc] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canEdit = canEditOrgHiringSettings(user);

  useEffect(() => {
    setSteps(data?.flow.steps ?? []);
    const calculators = data?.flow.ctcCalculators ?? [];
    setCtcCalculators(calculators);
    const safeDefault =
      data?.flow.defaultCalculatorKey &&
      calculators.some((c) => c.key === data.flow.defaultCalculatorKey)
        ? data.flow.defaultCalculatorKey
        : (calculators[0]?.key ?? "");
    setDefaultCalculatorKey(safeDefault);
    setActiveCalculatorKey((prev) =>
      calculators.some((c) => c.key === prev) ? prev : safeDefault,
    );
  }, [data?.flow.ctcCalculators, data?.flow.defaultCalculatorKey, data?.flow.steps]);

  const activeCalculator =
    ctcCalculators.find((calc) => calc.key === activeCalculatorKey) ?? ctcCalculators[0] ?? null;
  const activeCalculatorPreview = useMemo(() => {
    if (!activeCalculator) return null;
    const resolved = resolveConfiguredCtcItems(activeCalculator.components);
    return {
      ...resolved,
      total: resolved.resolvedItems.reduce((sum, item) => sum + item.annual, 0),
    };
  }, [activeCalculator]);
  const parsedTargetCtc = parseMoney(targetCtc);
  const canCalculateSplit = canEdit && Number.isFinite(parsedTargetCtc) && parsedTargetCtc > 0;

  const calculateSalarySplit = useCallback(() => {
    if (!activeCalculator || !canCalculateSplit) return;
    const target = Math.round(parsedTargetCtc);
    setCtcCalculators((prev) =>
      prev.map((calc) =>
        calc.key === activeCalculator.key
          ? { ...calc, components: distributeTargetCtc(calc.components, target) }
          : calc,
      ),
    );
  }, [activeCalculator, canCalculateSplit, parsedTargetCtc]);

  async function save() {
    setSaving(true);
    setNotice(null);
    setSaveError(null);
    try {
      const payload = {
        steps: steps.map((s) => s.trim()).filter(Boolean),
        ctcCalculators: ctcCalculators.map((calc, idx) => ({
          key: slugify(calc.key || calc.name) || `calculator_${idx + 1}`,
          name: calc.name.trim() || `Calculator ${idx + 1}`,
          components: calc.components.map((row) => ({
            label: row.label.trim(),
            annual: row.annual,
            formula: row.formula ?? null,
          })),
        })),
        defaultCalculatorKey,
      };
      const res = await fetch("/api/settings/offer-letter-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSaveError(json.error ?? "Could not save flow settings.");
        return;
      }
      await refetch();
      setNotice("Offer flow saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text)]">Offer letter flow</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Define one connected step-by-step flow for drafting offers. Company admins design the
          flow; recruiters and other roles with offer-create access can execute it.
        </p>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 size={14} className="animate-spin" /> Loading flow settings…
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      ) : null}
      {saveError ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {saveError}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {notice}
        </p>
      ) : null}

      {!loading ? (
        <SettingsEditableForm>
          <div className="flex flex-col gap-5">
            <div className="order-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/30 p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
                  Flow steps shown in offer draft
                </p>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setSteps((prev) => [...prev, `Step ${prev.length + 1}`])}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text)] hover:bg-[var(--surface)]"
                  >
                    <Plus size={12} /> Add step
                  </button>
                ) : null}
              </div>
              <div className="space-y-2">
                {steps.map((step, idx) => (
                  <div key={`${idx}-${step}`} className="flex items-center gap-2">
                    <span className="w-7 text-center text-xs font-semibold text-[var(--accent)]">
                      {idx + 1}
                    </span>
                    <input
                      disabled={!canEdit}
                      value={step}
                      onChange={(e) =>
                        setSteps((prev) => prev.map((s, i) => (i === idx ? e.target.value : s)))
                      }
                      className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-70"
                    />
                    {canEdit ? (
                      <button
                        type="button"
                        disabled={steps.length <= 3}
                        onClick={() => setSteps((prev) => prev.filter((_, i) => i !== idx))}
                        className="rounded-md p-2 text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-red-400 disabled:opacity-40"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="order-1 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/30 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 text-[var(--accent)]">
                    <Calculator size={15} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">CTC calculator</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Calculate from CTC or build from monthly/annual salary details.
                    </p>
                  </div>
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => {
                      const newKey = `calculator_${ctcCalculators.length + 1}`;
                      setCtcCalculators((prev) => [
                        ...prev,
                        {
                          key: newKey,
                          name: `Calculator ${ctcCalculators.length + 1}`,
                          components: [{ label: "Base / fixed pay", annual: null, formula: null }],
                        },
                      ]);
                      setActiveCalculatorKey(newKey);
                      if (!defaultCalculatorKey) setDefaultCalculatorKey(newKey);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text)] hover:bg-[var(--surface)]"
                  >
                    <Plus size={12} /> Add calculator
                  </button>
                ) : null}
              </div>

              {activeCalculator ? (
                <div className="mb-4 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/35 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.9fr)]">
                  <div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setCalculatorMode("target")}
                        className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                          calculatorMode === "target"
                            ? "border-amber-300/70 bg-[var(--surface)] text-[var(--text)]"
                            : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface)]"
                        }`}
                      >
                        <span className="block font-semibold text-[var(--text)]">
                          CTC to salary
                        </span>
                        <span className="mt-0.5 block">Enter annual CTC and split it.</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCalculatorMode("details")}
                        className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                          calculatorMode === "details"
                            ? "border-amber-300/70 bg-[var(--surface)] text-[var(--text)]"
                            : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface)]"
                        }`}
                      >
                        <span className="block font-semibold text-[var(--text)]">
                          Salary to CTC
                        </span>
                        <span className="mt-0.5 block">Enter details and total it.</span>
                      </button>
                    </div>

                    {calculatorMode === "target" ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                        <label className="block text-xs font-medium text-[var(--text)]">
                          Annual CTC
                          <input
                            disabled={!canEdit}
                            value={targetCtc}
                            onChange={(e) => setTargetCtc(e.target.value)}
                            inputMode="decimal"
                            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-70"
                            placeholder="e.g. 2400000"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={!canCalculateSplit}
                          onClick={calculateSalarySplit}
                          className="rounded-full border border-amber-300/60 px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Calculate split
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--border)] bg-black/10 p-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">
                        Per month
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                        {formatMonthlyCompact(activeCalculatorPreview?.total ?? 0, "INR")}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">
                        Per annum
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                        {formatAnnualCompact(activeCalculatorPreview?.total ?? 0, "INR")}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mb-3 flex flex-wrap gap-2">
                {ctcCalculators.map((calc) => {
                  const isActive = calc.key === (activeCalculator?.key ?? "");
                  const isDefault = calc.key === defaultCalculatorKey;
                  return (
                    <button
                      key={calc.key}
                      type="button"
                      onClick={() => setActiveCalculatorKey(calc.key)}
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${
                        isActive
                          ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text)]"
                          : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface)]"
                      }`}
                    >
                      {calc.name}
                      {isDefault ? " • default" : ""}
                    </button>
                  );
                })}
              </div>
              {activeCalculator ? (
                <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <input
                    disabled={!canEdit}
                    value={activeCalculator.name}
                    onChange={(e) =>
                      setCtcCalculators((prev) =>
                        prev.map((calc) =>
                          calc.key === activeCalculator.key
                            ? { ...calc, name: e.target.value }
                            : calc,
                        ),
                      )
                    }
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-70"
                    placeholder="Calculator name"
                  />
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => setDefaultCalculatorKey(activeCalculator.key)}
                      className={`rounded-md border px-3 py-2 text-xs ${
                        defaultCalculatorKey === activeCalculator.key
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                          : "border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface)]"
                      }`}
                    >
                      {defaultCalculatorKey === activeCalculator.key
                        ? "Default calculator"
                        : "Make default"}
                    </button>
                  ) : null}
                  {canEdit ? (
                    <button
                      type="button"
                      disabled={ctcCalculators.length <= 1}
                      onClick={() => {
                        const keep = ctcCalculators.filter(
                          (calc) => calc.key !== activeCalculator.key,
                        );
                        setCtcCalculators(keep);
                        const nextKey = keep[0]?.key ?? "";
                        if (defaultCalculatorKey === activeCalculator.key)
                          setDefaultCalculatorKey(nextKey);
                        setActiveCalculatorKey(nextKey);
                      }}
                      className="rounded-md p-2 text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-red-400 disabled:opacity-40"
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-2">
                {(activeCalculator?.components ?? []).map((row, idx) => (
                  <div
                    key={`${row.label}-${idx}`}
                    className="grid gap-2 sm:grid-cols-[1fr_180px_180px_auto]"
                  >
                    <input
                      disabled={!canEdit}
                      value={row.label}
                      onChange={(e) =>
                        setCtcCalculators((prev) =>
                          prev.map((calc) =>
                            calc.key === activeCalculator?.key
                              ? {
                                  ...calc,
                                  components: calc.components.map((r, i) =>
                                    i === idx ? { ...r, label: e.target.value } : r,
                                  ),
                                }
                              : calc,
                          ),
                        )
                      }
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-70"
                      placeholder="Component label"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        disabled={!canEdit}
                        value={row.formula ? "formula" : "manual"}
                        onChange={(e) =>
                          setCtcCalculators((prev) =>
                            prev.map((calc) =>
                              calc.key === activeCalculator?.key
                                ? {
                                    ...calc,
                                    components: calc.components.map((r, i) =>
                                      i === idx
                                        ? {
                                            ...r,
                                            formula:
                                              e.target.value === "formula"
                                                ? (r.formula ?? { basis: "base", percent: 40 })
                                                : null,
                                          }
                                        : r,
                                    ),
                                  }
                                : calc,
                            ),
                          )
                        }
                        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-70"
                      >
                        <option value="manual">Manual</option>
                        <option value="formula">Formula</option>
                      </select>
                      <input
                        disabled={!canEdit || Boolean(row.formula)}
                        type="number"
                        value={row.annual ?? ""}
                        onChange={(e) =>
                          setCtcCalculators((prev) =>
                            prev.map((calc) =>
                              calc.key === activeCalculator?.key
                                ? {
                                    ...calc,
                                    components: calc.components.map((r, i) =>
                                      i === idx
                                        ? {
                                            ...r,
                                            annual:
                                              e.target.value.trim() === ""
                                                ? null
                                                : Number.isFinite(Number(e.target.value))
                                                  ? Math.max(0, Number(e.target.value))
                                                  : null,
                                          }
                                        : r,
                                    ),
                                  }
                                : calc,
                            ),
                          )
                        }
                        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-70"
                        placeholder="Annual default"
                      />
                    </div>
                    {row.formula ? (
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          disabled={!canEdit}
                          value={row.formula.basis}
                          onChange={(e) =>
                            setCtcCalculators((prev) =>
                              prev.map((calc) =>
                                calc.key === activeCalculator?.key
                                  ? {
                                      ...calc,
                                      components: calc.components.map((r, i) =>
                                        i === idx
                                          ? {
                                              ...r,
                                              formula: {
                                                basis: e.target.value as "base" | "subtotal",
                                                percent: r.formula?.percent ?? 0,
                                              },
                                            }
                                          : r,
                                      ),
                                    }
                                  : calc,
                              ),
                            )
                          }
                          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-70"
                        >
                          <option value="base">% of base</option>
                          <option value="subtotal">% of subtotal</option>
                        </select>
                        <input
                          disabled={!canEdit}
                          type="number"
                          value={row.formula.percent}
                          onChange={(e) =>
                            setCtcCalculators((prev) =>
                              prev.map((calc) =>
                                calc.key === activeCalculator?.key
                                  ? {
                                      ...calc,
                                      components: calc.components.map((r, i) =>
                                        i === idx
                                          ? {
                                              ...r,
                                              formula: {
                                                basis: r.formula?.basis ?? "base",
                                                percent: Number.isFinite(Number(e.target.value))
                                                  ? Math.max(
                                                      0,
                                                      Math.min(100, Number(e.target.value)),
                                                    )
                                                  : 0,
                                              },
                                            }
                                          : r,
                                      ),
                                    }
                                  : calc,
                              ),
                            )
                          }
                          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-70"
                          placeholder="Percent"
                        />
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-[var(--border)]/60 px-3 py-2 text-xs text-[var(--text-muted)]">
                        Manual amount line
                      </div>
                    )}
                    {canEdit ? (
                      <button
                        type="button"
                        disabled={(activeCalculator?.components.length ?? 0) <= 1}
                        onClick={() =>
                          setCtcCalculators((prev) =>
                            prev.map((calc) =>
                              calc.key === activeCalculator?.key
                                ? {
                                    ...calc,
                                    components: calc.components.filter((_, i) => i !== idx),
                                  }
                                : calc,
                            ),
                          )
                        }
                        className="rounded-md p-2 text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-red-400 disabled:opacity-40"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              {activeCalculatorPreview && activeCalculatorPreview.resolvedItems.length > 0 ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)]">
                  <div className="grid grid-cols-[1fr_140px_140px] bg-[var(--surface)]/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
                    <span>Component</span>
                    <span className="text-right">Per month</span>
                    <span className="text-right">Per annum</span>
                  </div>
                  {activeCalculatorPreview.resolvedItems.map((item) => (
                    <div
                      key={`${item.label}-${item.annual}`}
                      className="grid grid-cols-[1fr_140px_140px] border-t border-[var(--border)] px-3 py-2 text-xs"
                    >
                      <span className="text-[var(--text)]">{item.label}</span>
                      <span className="text-right text-[var(--text-muted)]">
                        {formatMonthlyCompact(item.annual, "INR")}
                      </span>
                      <span className="text-right font-medium text-[var(--text)]">
                        {formatAnnualCompact(item.annual, "INR")}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-[var(--border)] px-3 py-3 text-xs text-[var(--text-muted)]">
                  Add salary values or enter a CTC above to see per-month and per-annum
                  calculations.
                </p>
              )}
              {canEdit && activeCalculator ? (
                <button
                  type="button"
                  onClick={() =>
                    setCtcCalculators((prev) =>
                      prev.map((calc) =>
                        calc.key === activeCalculator.key
                          ? {
                              ...calc,
                              components: [
                                ...calc.components,
                                { label: "New component", annual: null, formula: null },
                              ],
                            }
                          : calc,
                      ),
                    )
                  }
                  className="mt-3 inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text)] hover:bg-[var(--surface)]"
                >
                  <Plus size={12} /> Add line
                </button>
              ) : null}
            </div>

            {canEdit ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  Save flow
                </button>
              </div>
            ) : null}
          </div>
        </SettingsEditableForm>
      ) : null}
    </div>
  );
}
