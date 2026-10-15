/**
 * Normalize offer `compensation_json` for storage, band checks, and PDF merge fields.
 */

export function parseOfferCtcValue(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isComponentRow(row: unknown): row is { label?: unknown; annual?: unknown } {
  return Boolean(row) && typeof row === "object" && !Array.isArray(row);
}

/** Human-readable multi-line breakdown from structured calculator fields. */
export function buildBreakdownFromCompensationParts(
  compensation: Record<string, unknown>,
): string | null {
  const comps = compensation.components;
  if (!Array.isArray(comps) || comps.length === 0) return null;
  const lines: string[] = [];
  let subtotal = 0;
  for (const row of comps) {
    if (!isComponentRow(row)) continue;
    const label =
      typeof row.label === "string" && row.label.trim() ? row.label.trim() : "Component";
    const annual =
      typeof row.annual === "number" && Number.isFinite(row.annual)
        ? row.annual
        : Number(row.annual as string);
    if (!Number.isFinite(annual) || annual <= 0) continue;
    subtotal += annual;
    lines.push(`${label}: ${Math.round(annual).toLocaleString()}`);
  }
  if (lines.length === 0) return null;
  lines.push(`Subtotal (components): ${Math.round(subtotal).toLocaleString()}`);

  const vpRaw = compensation.variable_percent_of_components;
  const vp =
    typeof vpRaw === "number" && Number.isFinite(vpRaw)
      ? vpRaw
      : typeof vpRaw === "string"
        ? Number(vpRaw)
        : 0;
  const vpClamped = Math.min(100, Math.max(0, Number.isFinite(vp) ? vp : 0));
  const variable = (subtotal * vpClamped) / 100;
  lines.push(`Variable (${vpClamped}% of subtotal): ${Math.round(variable).toLocaleString()}`);

  const jbRaw = compensation.joining_bonus;
  const joining =
    typeof jbRaw === "number" && Number.isFinite(jbRaw)
      ? jbRaw
      : typeof jbRaw === "string"
        ? Number(jbRaw)
        : 0;
  const joiningClamped = Math.max(0, Number.isFinite(joining) ? joining : 0);
  const incl =
    compensation.include_joining_in_ctc === true ||
    compensation.include_joining_in_ctc === "true" ||
    compensation.include_joining_in_ctc === 1;
  lines.push(
    `Joining bonus (one-time): ${Math.round(joiningClamped).toLocaleString()}${incl ? " — included in CTC" : " — excluded from annual CTC"}`,
  );

  const ctc = parseOfferCtcValue(compensation.ctc);
  if (ctc !== null && ctc > 0) {
    lines.push(`Annual CTC: ${Math.round(ctc).toLocaleString()}`);
  }
  return lines.join("\n");
}

/** Prefer explicit breakdown; otherwise synthesize from `components` / calculator fields. */
export function resolveCompensationBreakdownForTemplate(
  compensation: Record<string, unknown>,
): string {
  const direct =
    typeof compensation.breakdown === "string"
      ? compensation.breakdown.trim()
      : typeof compensation.breakdown_text === "string"
        ? compensation.breakdown_text.trim()
        : "";
  if (direct) return direct;
  const built = buildBreakdownFromCompensationParts(compensation);
  return built ?? "";
}

/**
 * Coerce `ctc` to a number when possible; fill `breakdown` from components when missing.
 * Returns a new object (does not mutate input).
 */
export function normalizeCompensationForStorage(
  compensation: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...compensation };
  const ctc = parseOfferCtcValue(out.ctc);
  if (ctc !== null) {
    out.ctc = Math.round(ctc);
  }
  const hasBreakdown =
    (typeof out.breakdown === "string" && out.breakdown.trim().length > 0) ||
    (typeof out.breakdown_text === "string" && out.breakdown_text.trim().length > 0);
  if (!hasBreakdown) {
    const built = buildBreakdownFromCompensationParts(out);
    if (built) out.breakdown = built;
  }
  return out;
}
