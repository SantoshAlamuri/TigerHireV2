"use client";

import { useId, useState } from "react";
import s from "./profile.module.css";

/**
 * A short list edited in place: each item a removable line, a field to add
 * more (Enter adds; pasting several lines adds them all).
 */
export function ListField({
  label,
  hint,
  items,
  onChange,
  placeholder,
  tone,
  max = 20,
}: {
  label: string;
  hint?: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  tone?: "must" | "should" | "nice";
  max?: number;
}) {
  const [text, setText] = useState("");
  const id = useId();

  function add(raw: string) {
    const parts = raw
      .split(/\n|;/)
      .map((p) => p.replace(/^[-*•\d.)\s]+/, "").trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...items];
    for (const p of parts) {
      if (next.length >= max) break;
      if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p);
    }
    onChange(next);
    setText("");
  }

  return (
    <div className={s.field}>
      <label htmlFor={id} className={s.fieldLabel}>
        {label}
        <span className={s.fieldCount}>{items.length || ""}</span>
      </label>
      {hint && <span className={s.fieldHint}>{hint}</span>}
      {items.length > 0 && (
        <ul className={s.items} data-tone={tone}>
          {items.map((it, i) => (
            <li key={`${it}-${i}`} className={s.item}>
              <span>{it}</span>
              <button
                type="button"
                className={s.remove}
                aria-label={`Remove ${it}`}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {items.length < max && (
        <input
          id={id}
          className={s.addInput}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(text);
            }
          }}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text");
            if (t.includes("\n")) {
              e.preventDefault();
              add(t);
            }
          }}
          onBlur={() => add(text)}
        />
      )}
    </div>
  );
}
