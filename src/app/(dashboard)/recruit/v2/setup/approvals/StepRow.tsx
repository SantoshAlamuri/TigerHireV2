"use client";

import type { ChainStepDef } from "@/lib/workflows/requisition-chain";
import { ROLES } from "./roles";

/**
 * One step of the approval chain: who signs, how long they get, and the raiser
 * roles that skip it. Extracted from the builder page to keep that file under
 * the 250-line size gate; behaviour is unchanged.
 */
export function StepRow({
  step,
  onChange,
  onRemove,
}: {
  step: ChainStepDef;
  onChange: (patch: Partial<ChainStepDef>) => void;
  onRemove: () => void;
}) {
  const skip = step.skipWhenRaiserRole ?? [];

  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-white/50">
          Step
          <input
            type="number"
            min={1}
            value={step.stepOrder}
            onChange={(e) => onChange({ stepOrder: Number(e.target.value) || 1 })}
            className="w-14 rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm text-[var(--text)]"
          />
        </label>
        <select
          value={step.approverRole}
          onChange={(e) => onChange({ approverRole: e.target.value })}
          className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text)]"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-white/50">
          within
          <input
            type="number"
            min={1}
            value={step.slaHours}
            onChange={(e) => onChange({ slaHours: Number(e.target.value) || 8 })}
            className="w-16 rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm text-[var(--text)]"
          />
          hours
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto text-xs font-semibold text-red-300/80 hover:text-red-300"
        >
          Remove
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-white/40">Skip this step when raised by:</span>
        {ROLES.map((r) => {
          const on = skip.includes(r.value);
          return (
            <button
              key={r.value}
              type="button"
              onClick={() =>
                onChange({
                  skipWhenRaiserRole: on ? skip.filter((x) => x !== r.value) : [...skip, r.value],
                })
              }
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                on
                  ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "border-[var(--border)] text-white/50"
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>
    </li>
  );
}
