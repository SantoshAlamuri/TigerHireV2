/**
 * Annual CTC helpers: line-item components + variable % of subtotal + optional joining bonus.
 * All amounts share one currency (typically INR per year).
 */

export type OfferCtcLineItem = {
  label: string;
  /** Annual amount in offer currency (same as band min/max). */
  annual: number;
};

export type OfferCtcFormula = {
  basis: "base" | "subtotal";
  percent: number;
};

export type OfferCtcConfiguredItem = {
  label: string;
  annual?: number | null;
  formula?: OfferCtcFormula | null;
};

export type OfferCtcFromLineItemsInput = {
  items: OfferCtcLineItem[];
  /** Performance / variable as % of the sum of line items (0–100). */
  variablePercentOfSubtotal: number;
  joiningBonus: number;
  includeJoiningInAnnual: boolean;
};

export type OfferCtcCalculatorInput = {
  /** Annual fixed cash (e.g. annual base). */
  fixedAnnual: number;
  /** Performance / variable as % of fixed (0–100). */
  variablePercentOfFixed: number;
  /** One-time joining bonus in same currency. */
  joiningBonus: number;
  /** When true, joining bonus is included in the annual CTC number. */
  includeJoiningInAnnual: boolean;
};

function clampPct(p: number): number {
  return Math.min(100, Math.max(0, p));
}

/**
 * Resolve configured CTC rows into concrete annual amounts.
 * - Manual rows use their annual value.
 * - Formula rows derive from base (first manual row) or manual subtotal.
 */
export function resolveConfiguredCtcItems(items: OfferCtcConfiguredItem[]): {
  resolvedItems: OfferCtcLineItem[];
  baseAnnual: number;
  manualSubtotal: number;
} {
  const normalized = (items ?? []).map((row) => ({
    label: row.label?.trim() || "Component",
    annual:
      typeof row.annual === "number" && Number.isFinite(row.annual) && row.annual > 0
        ? row.annual
        : 0,
    formula: row.formula ?? null,
  }));

  const manualRows = normalized.filter((row) => !row.formula);
  const manualSubtotal = manualRows.reduce((sum, row) => sum + row.annual, 0);
  const baseAnnual = manualRows[0]?.annual ?? 0;

  const resolvedItems = normalized
    .map((row) => {
      if (!row.formula) {
        return { label: row.label, annual: row.annual };
      }
      const pct = clampPct(row.formula.percent);
      const source = row.formula.basis === "base" ? baseAnnual : manualSubtotal;
      return {
        label: row.label,
        annual: (source * pct) / 100,
      };
    })
    .filter((row) => row.annual > 0);

  return { resolvedItems, baseAnnual, manualSubtotal };
}

/**
 * Sum labeled annual components, add variable % of that subtotal, then optional joining in CTC.
 */
export function computeAnnualCtcFromLineItems(input: OfferCtcFromLineItemsInput): {
  ctc: number;
  componentSubtotal: number;
  variableAmount: number;
  breakdownLines: string[];
  resolvedItems: OfferCtcLineItem[];
} {
  const resolvedItems = input.items
    .map((row) => ({
      label: row.label.trim() || "Component",
      annual: Number.isFinite(row.annual) && row.annual > 0 ? row.annual : 0,
    }))
    .filter((row) => row.annual > 0);

  const componentSubtotal = resolvedItems.reduce((s, r) => s + r.annual, 0);
  const vp = clampPct(input.variablePercentOfSubtotal);
  const variableAmount = (componentSubtotal * vp) / 100;
  const annualBeforeJoining = componentSubtotal + variableAmount;
  const joining = Math.max(0, Number.isFinite(input.joiningBonus) ? input.joiningBonus : 0);
  const ctc = annualBeforeJoining + (input.includeJoiningInAnnual ? joining : 0);

  const lines: string[] = [];
  for (const row of resolvedItems) {
    lines.push(`${row.label}: ${row.annual.toLocaleString()}`);
  }
  if (resolvedItems.length === 0) {
    lines.push("Components: (none)");
  }
  lines.push(`Subtotal (cash components): ${componentSubtotal.toLocaleString()}`);
  lines.push(`Variable (${vp}% of subtotal): ${variableAmount.toLocaleString()}`);
  lines.push(
    `Joining bonus (one-time): ${joining.toLocaleString()}${input.includeJoiningInAnnual ? " — included in CTC" : " — excluded from annual CTC"}`,
  );
  lines.push(`Computed annual CTC: ${ctc.toLocaleString()}`);

  return {
    ctc,
    componentSubtotal,
    variableAmount,
    breakdownLines: lines,
    resolvedItems,
  };
}

/** Legacy shape: single fixed bucket + variable % of that fixed (same math as one line item). */
export function computeAnnualCtcFromComponents(input: OfferCtcCalculatorInput): {
  ctc: number;
  variableAmount: number;
  annualBeforeJoining: number;
  breakdownLines: string[];
} {
  const fixed = Math.max(0, input.fixedAnnual);
  const out = computeAnnualCtcFromLineItems({
    items: [{ label: "Fixed (annual)", annual: fixed }],
    variablePercentOfSubtotal: input.variablePercentOfFixed,
    joiningBonus: input.joiningBonus,
    includeJoiningInAnnual: input.includeJoiningInAnnual,
  });
  return {
    ctc: out.ctc,
    variableAmount: out.variableAmount,
    annualBeforeJoining: out.componentSubtotal + out.variableAmount,
    breakdownLines: out.breakdownLines,
  };
}

/** Short LPA label for band pickers (no full INR sentence). */
export function formatLpaShort(annual: number): string {
  if (!Number.isFinite(annual) || annual <= 0) return "—";
  return `${(annual / 100_000).toFixed(1)} LPA`;
}

/** Format annual INR compact for tables (band min/max). */
export function formatAnnualCompact(annual: number, currency: string): string {
  const n = Math.round(annual);
  if (!Number.isFinite(n)) return "—";
  if (currency === "INR") {
    return `₹${n.toLocaleString("en-IN")}`;
  }
  return `${currency} ${n.toLocaleString()}`;
}

/** Format annual INR as lakhs per annum for offer copy. */
export function formatCtcLpaInr(annualInr: number): string {
  if (!Number.isFinite(annualInr) || annualInr <= 0) return "";
  const lpa = annualInr / 100_000;
  return `${lpa.toFixed(2)} LPA (₹${Math.round(annualInr).toLocaleString("en-IN")} p.a.)`;
}
