"use client";

import { useState } from "react";

type EditableStringListProps = {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  addLabel: string;
  variant?: "must" | "nice" | "cert";
};

export function EditableStringList({
  items,
  onChange,
  placeholder,
  addLabel,
  variant = "must",
}: EditableStringListProps) {
  const [draft, setDraft] = useState("");
  const icon = variant === "must" ? "✓" : variant === "cert" ? "◉" : "○";
  const chipClass =
    variant === "must"
      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
      : variant === "cert"
        ? "border-violet-500/30 bg-violet-500/15 text-violet-200"
        : "border-zinc-500/30 bg-zinc-500/15 text-zinc-200";

  const add = () => {
    const val = draft.trim();
    if (!val || items.includes(val)) return;
    onChange([...items, val]);
    setDraft("");
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const next = [...items];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li
            key={`${item}-${i}`}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${chipClass}`}
          >
            <span className="shrink-0 opacity-80">{icon}</span>
            <span className="flex-1">{item}</span>
            {i > 0 && (
              <button
                type="button"
                onClick={() => moveUp(i)}
                className="text-xs text-white/50 hover:text-white/80"
                title="Move up"
              >
                ↑
              </button>
            )}
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="text-xs text-white/50 hover:text-red-300"
              aria-label={`Remove ${item}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-[var(--text)]"
        />
        <button
          type="button"
          onClick={add}
          className="rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/10"
        >
          {addLabel}
        </button>
      </div>
    </div>
  );
}
