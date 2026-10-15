"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { inputClass } from "@/lib/styles/form";

interface BulletListInputProps {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}

export function BulletListInput({ value, onChange, placeholder }: BulletListInputProps) {
  const [input, setInput] = useState("");

  function addItem() {
    const trimmed = input.trim();
    if (trimmed) {
      onChange([...value, trimmed]);
      setInput("");
    }
  }

  return (
    <div>
      <ul className="mb-2 space-y-1.5">
        {value.map((item, i) => (
          <li key={i} className="group flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--accent)]" />
            <input
              type="text"
              value={item}
              aria-label={`Edit item ${i + 1}`}
              onChange={(e) => {
                const updated = [...value];
                updated[i] = e.target.value;
                onChange(updated);
              }}
              className="flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-[var(--text)] hover:border-[var(--border)] focus:border-[var(--accent)]/50 focus:outline-none"
            />
            <button
              type="button"
              aria-label={`Remove item ${i + 1}`}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="mt-1 text-[var(--text-subtle)] opacity-0 transition hover:text-red-400 group-hover:opacity-100"
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          placeholder={placeholder}
          className={inputClass}
        />
        <button
          type="button"
          aria-label="Add item"
          onClick={addItem}
          className="flex-shrink-0 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-muted)] transition hover:bg-[var(--surface)]"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
