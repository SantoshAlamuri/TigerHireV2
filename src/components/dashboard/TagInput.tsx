"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { inputClass } from "@/lib/styles/form";

interface TagInputProps {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}

export function TagInput({ value, onChange, placeholder }: TagInputProps) {
  const [input, setInput] = useState("");

  function addTag() {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setInput("");
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {value.map((tag, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)]/10 px-2.5 py-1 text-xs font-medium text-[var(--accent)]"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="transition hover:text-red-400"
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={placeholder}
          className={inputClass}
        />
        <button
          type="button"
          aria-label="Add tag"
          onClick={addTag}
          className="flex-shrink-0 rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-muted)] transition hover:bg-[var(--surface)]"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
