type CompensationTableProps = {
  compensation: Record<string, unknown> | null | undefined;
};

type CompensationComponentRow = {
  label: string;
  annual: number;
};

function coerceMoney(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatMoney(amount: number | null, currency: string): string {
  if (amount === null) return "-";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount);
  }
}

function toTitleCaseKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseComponents(raw: unknown): CompensationComponentRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: CompensationComponentRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const label =
      typeof row.label === "string" && row.label.trim().length > 0 ? row.label.trim() : "Component";
    const annual = coerceMoney(row.annual);
    if (annual === null) continue;
    rows.push({ label, annual });
  }
  return rows;
}

function readStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(/\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

export function CompensationTable({ compensation }: CompensationTableProps) {
  if (!compensation || typeof compensation !== "object") return null;
  const entries = Object.entries(compensation);
  if (entries.length === 0) return null;

  const currencyRaw = compensation.currency;
  const currency =
    typeof currencyRaw === "string" && /^[A-Z]{3}$/.test(currencyRaw.trim().toUpperCase())
      ? currencyRaw.trim().toUpperCase()
      : "INR";

  const rows: Array<{ label: string; value: string }> = [];
  const consumedKeys = new Set<string>();

  const ctc = coerceMoney(compensation.ctc);
  if (ctc !== null) {
    rows.push({ label: "Annual CTC", value: `${formatMoney(Math.round(ctc), currency)} / year` });
    consumedKeys.add("ctc");
  }

  const joiningBonus = coerceMoney(compensation.joining_bonus);
  if (joiningBonus !== null) {
    rows.push({ label: "Joining Bonus", value: formatMoney(Math.round(joiningBonus), currency) });
    consumedKeys.add("joining_bonus");
  }

  const variablePercent = coerceMoney(compensation.variable_percent_of_components);
  if (variablePercent !== null) {
    rows.push({
      label: "Variable Pay",
      value: `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(variablePercent)}% of components`,
    });
    consumedKeys.add("variable_percent_of_components");
  }

  if (typeof compensation.include_joining_in_ctc === "boolean") {
    rows.push({
      label: "Joining Bonus in CTC",
      value: compensation.include_joining_in_ctc ? "Included" : "Excluded",
    });
    consumedKeys.add("include_joining_in_ctc");
  }

  if (typeof compensation.currency === "string" && compensation.currency.trim()) {
    rows.push({ label: "Currency", value: currency });
    consumedKeys.add("currency");
  }

  const components = parseComponents(compensation.components);
  if (components.length > 0) {
    consumedKeys.add("components");
  }

  const breakdown =
    typeof compensation.breakdown === "string" && compensation.breakdown.trim()
      ? compensation.breakdown.trim()
      : typeof compensation.breakdown_text === "string" && compensation.breakdown_text.trim()
        ? compensation.breakdown_text.trim()
        : "";
  if (breakdown) {
    consumedKeys.add("breakdown");
    consumedKeys.add("breakdown_text");
  }

  const benefits = readStringArray(compensation.benefits);
  if (benefits.length > 0) {
    consumedKeys.add("benefits");
  }

  const compNotes =
    typeof compensation.notes === "string" && compensation.notes.trim()
      ? compensation.notes.trim()
      : "";
  if (compNotes) {
    consumedKeys.add("notes");
  }

  for (const [key, value] of entries) {
    if (consumedKeys.has(key)) continue;
    if (value === null || value === undefined || value === "") continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      rows.push({ label: toTitleCaseKey(key), value: formatMoney(value, currency) });
      continue;
    }
    if (typeof value === "string") {
      rows.push({ label: toTitleCaseKey(key), value });
      continue;
    }
    if (typeof value === "boolean") {
      rows.push({ label: toTitleCaseKey(key), value: value ? "Yes" : "No" });
    }
  }

  if (
    rows.length === 0 &&
    components.length === 0 &&
    !breakdown &&
    benefits.length === 0 &&
    !compNotes
  ) {
    return null;
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Compensation
      </p>

      {rows.length > 0 ? (
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-[var(--border)] last:border-0">
                  <th className="py-2 pr-3 text-left text-xs font-medium text-[var(--text-muted)]">
                    {row.label}
                  </th>
                  <td className="py-2 text-sm text-[var(--text)]">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {components.length > 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-[var(--text-muted)]">Components</p>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <tbody>
                {components.map((component, index) => (
                  <tr
                    key={`${component.label}-${index}`}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <th className="py-2 pr-3 text-left text-xs font-medium text-[var(--text-muted)]">
                      {component.label}
                    </th>
                    <td className="py-2 text-sm text-[var(--text)]">
                      {formatMoney(Math.round(component.annual), currency)} / year
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {benefits.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-[var(--text-muted)]">Benefits</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-[var(--text)]">
            {benefits.map((benefit) => (
              <li key={benefit}>{benefit}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {breakdown ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-[var(--text-muted)]">Breakdown</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text)]">{breakdown}</p>
        </div>
      ) : null}

      {compNotes ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-[var(--text-muted)]">Notes</p>
          <p className="mt-1 text-sm text-[var(--text)]">{compNotes}</p>
        </div>
      ) : null}
    </div>
  );
}
