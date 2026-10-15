"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { nanoid } from "nanoid";
import { inputClass, labelClass } from "@/lib/styles/form";
import { SectionCard } from "./SectionCard";
import type { JdSection, SectionType, WizardMetadata } from "./types";

interface Step2SectionsProps {
  metadata: WizardMetadata;
  onMetadataChange: (m: WizardMetadata) => void;
  sections: JdSection[];
  onSectionsChange: (s: JdSection[]) => void;
  onNext: () => void;
  onBack: () => void;
}

const ROLE_FUNCTIONS = [
  "Engineering",
  "Product",
  "Design",
  "Sales",
  "HR",
  "Finance",
  "Operations",
  "Marketing",
];

const SENIORITY_LEVELS = [
  "Intern",
  "Junior",
  "Mid",
  "Senior",
  "Lead",
  "Manager",
  "Director",
  "VP",
  "C-Suite",
];

export function Step2Sections({
  metadata,
  onMetadataChange,
  sections,
  onSectionsChange,
  onNext,
  onBack,
}: Step2SectionsProps) {
  const [showAddSection, setShowAddSection] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<SectionType>("text");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    onSectionsChange(arrayMove(sections, oldIndex, newIndex));
  }

  function updateSection(id: string, updated: JdSection) {
    onSectionsChange(sections.map((s) => (s.id === id ? updated : s)));
  }

  function removeSection(id: string) {
    onSectionsChange(sections.filter((s) => s.id !== id));
  }

  function addSection() {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    const section: JdSection = {
      id: nanoid(8),
      label: trimmed,
      type: newType,
      value: newType === "text" ? "" : [],
    };
    onSectionsChange([...sections, section]);
    setNewLabel("");
    setNewType("text");
    setShowAddSection(false);
  }

  function updateMeta<K extends keyof WizardMetadata>(key: K, value: WizardMetadata[K]) {
    onMetadataChange({ ...metadata, [key]: value });
  }

  return (
    <div className="space-y-6">
      {/* Metadata */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/30 p-5 space-y-4">
        <h3 className="text-base font-semibold text-[var(--text)]">Job Details</h3>

        <div>
          <label htmlFor="wiz-title" className={labelClass}>
            Job Title
          </label>
          <input
            id="wiz-title"
            type="text"
            required
            placeholder="e.g. Senior Backend Engineer"
            className={inputClass}
            value={metadata.title}
            onChange={(e) => updateMeta("title", e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="wiz-location" className={labelClass}>
              Location
            </label>
            <input
              id="wiz-location"
              type="text"
              placeholder="e.g. Bengaluru"
              className={inputClass}
              value={metadata.location}
              onChange={(e) => updateMeta("location", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="wiz-function" className={labelClass}>
              Role Function
            </label>
            <select
              id="wiz-function"
              className={inputClass}
              value={metadata.roleFunction}
              onChange={(e) => updateMeta("roleFunction", e.target.value)}
            >
              <option value="">Select function</option>
              {ROLE_FUNCTIONS.map((rf) => (
                <option key={rf} value={rf}>
                  {rf}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="wiz-seniority" className={labelClass}>
              Seniority Level
            </label>
            <select
              id="wiz-seniority"
              className={inputClass}
              value={metadata.seniorityLevel}
              onChange={(e) => updateMeta("seniorityLevel", e.target.value)}
            >
              <option value="">Select level</option>
              {SENIORITY_LEVELS.map((sl) => (
                <option key={sl} value={sl}>
                  {sl}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            id="wiz-remote"
            type="checkbox"
            className="h-4 w-4 accent-[var(--accent)]"
            checked={metadata.remoteAllowed}
            onChange={(e) => updateMeta("remoteAllowed", e.target.checked)}
          />
          <label htmlFor="wiz-remote" className="text-sm text-[var(--text-muted)]">
            Remote Allowed
          </label>
        </div>
      </div>

      {/* Dynamic Sections */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--text)]">
            JD Sections ({sections.length})
          </h3>
          <p className="text-xs text-[var(--text-subtle)]">Drag to reorder sections</p>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {sections.map((section) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  onChange={(updated) => updateSection(section.id, updated)}
                  onRemove={() => removeSection(section.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {sections.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]">
            No sections yet. Add one below or go back to parse a JD.
          </div>
        )}

        {/* Add section */}
        {showAddSection ? (
          <div className="flex items-end gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/30 p-4">
            <div className="flex-1">
              <label className={labelClass}>Section Label</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSection();
                  }
                }}
                placeholder="e.g. Certifications Required"
                className={inputClass}
                autoFocus
              />
            </div>
            <div className="w-28">
              <label className={labelClass}>Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as SectionType)}
                className={inputClass}
              >
                <option value="text">Text</option>
                <option value="list">List</option>
                <option value="tags">Tags</option>
              </select>
            </div>
            <button
              type="button"
              onClick={addSection}
              disabled={!newLabel.trim()}
              className="rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddSection(false);
                setNewLabel("");
              }}
              className="rounded-full border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--text-muted)] hover:bg-[var(--surface)]"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddSection(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] py-3 text-sm text-[var(--text-muted)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
          >
            <Plus size={16} /> Add Section
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-[var(--border)] px-6 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface)]"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!metadata.title.trim()}
          className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          Next: Compensation & Publish
        </button>
      </div>
    </div>
  );
}
