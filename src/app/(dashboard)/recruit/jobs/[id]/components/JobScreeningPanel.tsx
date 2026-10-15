"use client";

import { useEffect, useState } from "react";
import { useApiQuery } from "@/lib/hooks/use-api";
import {
  Loader2,
  ListChecks,
  Trash2,
  GripVertical,
  Pencil,
  Check,
  X,
  Eye,
  EyeOff,
} from "lucide-react";
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
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type ScreeningOption = { label: string; knockout: boolean };
type Q = {
  id: string;
  questionText: string;
  failOnYes: boolean;
  isActive: boolean;
  sortOrder: number;
  answerType?: "yes_no" | "single_select";
  options?: ScreeningOption[] | null;
};

type QPatch = Partial<Pick<Q, "questionText" | "failOnYes" | "isActive" | "sortOrder">>;

function SortableRow({
  q,
  editing,
  busy,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleActive,
  onDelete,
}: {
  q: Q;
  editing: boolean;
  busy: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (text: string, failOnYes: boolean) => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: q.id,
  });
  const [text, setText] = useState(q.questionText);
  const [failOnYes, setFailOnYes] = useState(q.failOnYes);

  useEffect(() => {
    if (editing) {
      setText(q.questionText);
      setFailOnYes(q.failOnYes);
    }
  }, [editing, q.questionText, q.failOnYes]);

  const style = { transform: CSS.Transform.toString(transform), transition };

  if (editing) {
    return (
      <li
        ref={setNodeRef}
        style={style}
        className="rounded-lg border border-[var(--accent)]/40 bg-[var(--bg)]/30 px-3 py-2"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-white/60">
            <input
              type="checkbox"
              checked={failOnYes}
              onChange={(e) => setFailOnYes(e.target.checked)}
              className="rounded border-[var(--border)]"
            />
            Fail on &quot;Yes&quot;
          </label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onCancelEdit}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-white/70 hover:bg-white/5"
            >
              <X size={13} /> Cancel
            </button>
            <button
              type="button"
              disabled={busy || !text.trim()}
              onClick={() => onSaveEdit(text.trim(), failOnYes)}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-black disabled:opacity-50"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 rounded-lg border border-[var(--border)]/80 bg-[var(--bg)]/30 px-2 py-2 text-sm ${
        isDragging ? "opacity-60" : ""
      } ${q.isActive ? "" : "opacity-60"}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="mt-0.5 shrink-0 cursor-grab touch-none rounded p-1 text-white/30 hover:text-white/60 active:cursor-grabbing"
      >
        <GripVertical size={15} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="break-words text-[var(--text)]">{q.questionText}</p>
        <p className="mt-1 text-xs text-white/55">
          {q.answerType === "single_select"
            ? `Single-select: ${(q.options ?? [])
                .map((o) => (o.knockout ? `${o.label} ✗` : o.label))
                .join(", ")}`
            : q.failOnYes
              ? "Yes fails"
              : "No fails"}
          {q.isActive ? "" : " · paused"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={onToggleActive}
          disabled={busy}
          aria-label={q.isActive ? "Pause question" : "Activate question"}
          title={q.isActive ? "Pause (stop asking)" : "Activate"}
          className="rounded p-1 text-white/50 hover:bg-white/5 hover:text-white disabled:opacity-40"
        >
          {q.isActive ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
        <button
          type="button"
          onClick={onStartEdit}
          aria-label="Edit question"
          className="rounded p-1 text-white/50 hover:bg-white/5 hover:text-white"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          aria-label="Delete question"
          className="rounded p-1 text-red-400/90 hover:bg-red-500/10 disabled:opacity-40"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={15} />}
        </button>
      </div>
    </li>
  );
}

export function JobScreeningPanel({ jobId }: { jobId: string }) {
  const { data: waSetup, loading: waLoading } = useApiQuery<{
    whatsappEnabled: boolean;
  }>(`/api/jobs/${jobId}/whatsapp-screening`);

  const { data, refetch, loading } = useApiQuery<{ questions: Q[] }>(
    waSetup?.whatsappEnabled ? null : `/api/jobs/${jobId}/screening-questions`,
  );
  const [items, setItems] = useState<Q[]>([]);
  const [text, setText] = useState("");
  const [failOnYes, setFailOnYes] = useState(true);
  const [answerType, setAnswerType] = useState<"yes_no" | "single_select">("yes_no");
  const [options, setOptions] = useState<ScreeningOption[]>([
    { label: "", knockout: false },
    { label: "", knockout: true },
  ]);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Keep a local copy so reorder / toggle feel instant; resync when the query refetches.
  useEffect(() => {
    if (data?.questions) setItems(data.questions);
  }, [data?.questions]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function patchQuestion(id: string, patch: QPatch) {
    await fetch(`/api/jobs/${jobId}/screening-questions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(patch),
    });
  }

  const cleanOptions = options.map((o) => ({ ...o, label: o.label.trim() })).filter((o) => o.label);
  const canAdd =
    text.trim().length > 0 &&
    (answerType === "yes_no" || (cleanOptions.length >= 2 && cleanOptions.some((o) => o.knockout)));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!canAdd) return;
    setSaving(true);
    try {
      const body =
        answerType === "single_select"
          ? {
              questionText: text.trim(),
              answerType,
              options: cleanOptions,
              sortOrder: items.length,
            }
          : { questionText: text.trim(), failOnYes, sortOrder: items.length };
      const res = await fetch(`/api/jobs/${jobId}/screening-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (res.ok) {
        setText("");
        setFailOnYes(true);
        setAnswerType("yes_no");
        setOptions([
          { label: "", knockout: false },
          { label: "", knockout: true },
        ]);
        await refetch();
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id: string, questionText: string, nextFailOnYes: boolean) {
    setBusyId(id);
    try {
      await patchQuestion(id, { questionText, failOnYes: nextFailOnYes });
      setEditingId(null);
      await refetch();
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(q: Q) {
    setBusyId(q.id);
    setItems((prev) => prev.map((i) => (i.id === q.id ? { ...i, isActive: !i.isActive } : i)));
    try {
      await patchQuestion(q.id, { isActive: !q.isActive });
      await refetch();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this screening question?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/jobs/${jobId}/screening-questions/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) await refetch();
    } finally {
      setBusyId(null);
    }
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    // Persist new positions (only the rows whose index actually changed).
    await Promise.all(
      next
        .map((q, idx) => ({ q, idx }))
        .filter(({ q, idx }) => q.sortOrder !== idx)
        .map(({ q, idx }) => patchQuestion(q.id, { sortOrder: idx })),
    );
    await refetch();
  }

  if (waLoading) {
    return (
      <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 px-4 py-3">
        <div className="flex justify-center py-4 text-white/60">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </div>
    );
  }

  if (waSetup?.whatsappEnabled) {
    return (
      <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 px-4 py-3 text-sm text-white/65">
        <h3 className="mb-1 flex items-center gap-2 font-medium text-[var(--text)]">
          <ListChecks size={16} className="text-[var(--accent)]" />
          Pre-screening questions
        </h3>
        <p>
          This job uses WhatsApp screening. Configure pre-screen and post-shortlist questions on the{" "}
          <a href={`/recruit/jobs/${jobId}/plan`} className="text-[var(--accent)] hover:underline">
            Recruitment plan
          </a>{" "}
          page, and review answers on the Screening tab.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 px-4 py-3">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-medium text-[var(--text)]">
        <ListChecks size={16} className="text-[var(--accent)]" />
        Pre-screening questions
      </h3>
      <p className="mb-3 text-xs text-white/60">
        Candidates answer these before their CV is scored (on the apply page and over WhatsApp). Use
        Yes/No knockouts or single-select choices; the marked answers remove the candidate. Drag to
        reorder, pause to stop asking without deleting.
      </p>
      {loading && !data ? (
        <div className="flex justify-center py-4 text-white/60">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="mb-3 text-sm text-white/60">No knockout questions yet.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((q) => q.id)} strategy={verticalListSortingStrategy}>
            <ul className="mb-3 space-y-2">
              {items.map((q) => (
                <SortableRow
                  key={q.id}
                  q={q}
                  editing={editingId === q.id}
                  busy={busyId === q.id}
                  onStartEdit={() => setEditingId(q.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={(t, f) => void saveEdit(q.id, t, f)}
                  onToggleActive={() => void toggleActive(q)}
                  onDelete={() => void remove(q.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <form onSubmit={add} className="space-y-2 border-t border-[var(--border)]/60 pt-3">
        <label htmlFor={`screen-q-${jobId}`} className="text-xs font-medium text-white/60">
          New question
        </label>
        <textarea
          id={`screen-q-${jobId}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="e.g. Do you have the legal right to work in India for this role?"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-white/60"
        />
        <div className="flex items-center gap-2 text-xs text-white/60">
          <span>Answer type</span>
          <select
            value={answerType}
            onChange={(e) => setAnswerType(e.target.value as "yes_no" | "single_select")}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text)]"
          >
            <option value="yes_no">Yes / No</option>
            <option value="single_select">Single-select</option>
          </select>
        </div>
        {answerType === "yes_no" ? (
          <label className="flex items-center gap-2 text-xs text-white/60">
            <input
              type="checkbox"
              checked={failOnYes}
              onChange={(e) => setFailOnYes(e.target.checked)}
              className="rounded border-[var(--border)]"
            />
            Fail the candidate on &quot;Yes&quot; (uncheck to fail on &quot;No&quot;)
          </label>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs text-white/60">
              Options — tick the ones that knock the candidate out.
            </p>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={opt.label}
                  onChange={(e) =>
                    setOptions((prev) =>
                      prev.map((o, j) => (j === i ? { ...o, label: e.target.value } : o)),
                    )
                  }
                  placeholder={`Option ${i + 1} — e.g. Needs sponsorship`}
                  className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text)] placeholder:text-white/50"
                />
                <label className="flex items-center gap-1 text-[11px] text-white/60">
                  <input
                    type="checkbox"
                    checked={opt.knockout}
                    onChange={(e) =>
                      setOptions((prev) =>
                        prev.map((o, j) => (j === i ? { ...o, knockout: e.target.checked } : o)),
                      )
                    }
                    className="rounded border-[var(--border)]"
                  />
                  Knockout
                </label>
                <button
                  type="button"
                  onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                  disabled={options.length <= 2}
                  aria-label="Remove option"
                  className="rounded p-1 text-red-400/80 hover:bg-red-500/10 disabled:opacity-30"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setOptions((prev) => [...prev, { label: "", knockout: false }])}
              disabled={options.length >= 10}
              className="text-[11px] font-medium text-[var(--accent)] hover:underline disabled:opacity-40"
            >
              + Add option
            </button>
          </div>
        )}
        <button
          type="submit"
          disabled={saving || !canAdd}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add question"}
        </button>
      </form>
    </div>
  );
}
