"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X, ChevronDown, ChevronRight, Pencil, Check } from "lucide-react";
import { TagInput } from "@/components/dashboard/TagInput";
import { BulletListInput } from "@/components/dashboard/BulletListInput";
import { inputClass } from "@/lib/styles/form";
import type { JdSection, SectionType } from "./types";

interface SectionCardProps {
  section: JdSection;
  onChange: (updated: JdSection) => void;
  onRemove: () => void;
}

const TYPE_LABELS: Record<SectionType, string> = {
  text: "Text",
  list: "List",
  tags: "Tags",
};

const TYPE_COLORS: Record<SectionType, string> = {
  text: "bg-blue-500/15 text-blue-400",
  list: "bg-amber-500/15 text-amber-400",
  tags: "bg-emerald-500/15 text-emerald-400",
};

export function SectionCard({ section, onChange, onRemove }: SectionCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(section.label);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function commitLabel() {
    const trimmed = labelDraft.trim();
    if (trimmed) onChange({ ...section, label: trimmed });
    else setLabelDraft(section.label);
    setEditingLabel(false);
  }

  function updateValue(value: string | string[]) {
    onChange({ ...section, value });
  }

  function cycleType() {
    const types: SectionType[] = ["text", "list", "tags"];
    const idx = types.indexOf(section.type);
    const next = types[(idx + 1) % types.length];
    const newValue =
      next === "text"
        ? Array.isArray(section.value)
          ? section.value.join("\n")
          : section.value
        : typeof section.value === "string"
          ? section.value
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
          : section.value;
    onChange({ ...section, type: next, value: newValue });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group rounded-xl border border-[var(--border)] bg-[var(--surface)]/30 transition-shadow hover:shadow-md"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          className="cursor-grab touch-none text-[var(--text-subtle)] hover:text-[var(--text-muted)] active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical size={16} />
        </button>

        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="text-[var(--text-muted)]"
          aria-label={collapsed ? "Expand section" : "Collapse section"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>

        {editingLabel ? (
          <div className="flex items-center gap-1.5 flex-1">
            <input
              type="text"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitLabel();
                if (e.key === "Escape") {
                  setLabelDraft(section.label);
                  setEditingLabel(false);
                }
              }}
              autoFocus
              className="flex-1 rounded-lg border border-[var(--accent)]/50 bg-transparent px-2 py-0.5 text-sm font-semibold text-[var(--text)] focus:outline-none"
            />
            <button type="button" onClick={commitLabel} className="text-emerald-400">
              <Check size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setLabelDraft(section.label);
              setEditingLabel(true);
            }}
            className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text)] hover:text-[var(--accent)] transition"
          >
            {section.label}
            <Pencil size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}

        <button
          type="button"
          onClick={cycleType}
          className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TYPE_COLORS[section.type]}`}
          title="Click to change type"
        >
          {TYPE_LABELS[section.type]}
        </button>

        <button
          type="button"
          onClick={onRemove}
          className="text-[var(--text-subtle)] hover:text-red-400 transition opacity-0 group-hover:opacity-100"
          aria-label="Remove section"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="px-4 pb-4">
          {section.type === "text" && (
            <textarea
              value={typeof section.value === "string" ? section.value : ""}
              onChange={(e) => updateValue(e.target.value)}
              rows={3}
              className={`${inputClass} resize-y`}
              placeholder={`Enter ${section.label.toLowerCase()}...`}
            />
          )}
          {section.type === "list" && (
            <BulletListInput
              value={Array.isArray(section.value) ? section.value : []}
              onChange={(v) => updateValue(v)}
              placeholder={`Add ${section.label.toLowerCase()} item...`}
            />
          )}
          {section.type === "tags" && (
            <TagInput
              value={Array.isArray(section.value) ? section.value : []}
              onChange={(v) => updateValue(v)}
              placeholder={`Add ${section.label.toLowerCase()}...`}
            />
          )}
        </div>
      )}
    </div>
  );
}
