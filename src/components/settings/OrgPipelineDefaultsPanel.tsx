"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Plus,
  Trash2,
  GripVertical,
  Save,
  Lock,
  ChevronUp,
  ChevronDown,
  Pencil,
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
import { nanoid } from "nanoid";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { SettingsReadOnlyBanner } from "@/components/settings/SettingsReadOnlyBanner";
import { canEditOrgHiringSettings } from "@/lib/settings/org-hiring-settings-auth";
import type { PipelineStage } from "@/types";
import { PIPELINE_STAGE_TYPES, type PipelineStageType } from "@/lib/pipeline/stage-types";
import { StageNotificationEditor } from "@/components/dashboard/StageNotificationEditor";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";

type StageInput = {
  /** Stable React / DnD id (server rows use real `id`). */
  clientKey: string;
  id?: string;
  stage_name: string;
  stage_order: number;
  stage_type: PipelineStageType;
  sla_days: number | null;
  is_locked?: boolean;
  notify_candidate: boolean;
  color: string;
  notify_email_body: string;
  interviewer_email: string;
};

function mapFromApi(s: PipelineStage): StageInput {
  return {
    clientKey: s.id ?? nanoid(12),
    id: s.id,
    stage_name: s.stage_name,
    stage_order: s.stage_order,
    stage_type: (s.stage_type as PipelineStageType) ?? "screening",
    sla_days: s.sla_days ?? null,
    is_locked: s.is_locked,
    notify_candidate: Boolean(s.notify_candidate),
    color: s.color ?? "#6366f1",
    notify_email_body: s.notify_email_body ?? "",
    interviewer_email: s.interviewer_email ?? "",
  };
}

function getInsertIndexForNewStage(stages: StageInput[]): number {
  const firstTerminalLocked = stages.findIndex((stage, index) => index > 1 && stage.is_locked);
  return firstTerminalLocked === -1 ? stages.length : firstTerminalLocked;
}

function splitLeadingLocked(stages: StageInput[]): {
  locked: StageInput[];
  unlocked: StageInput[];
} {
  let i = 0;
  while (i < stages.length && stages[i]?.is_locked) i += 1;
  return { locked: stages.slice(0, i), unlocked: stages.slice(i) };
}

function findPrevUnlockedIndex(stages: StageInput[], from: number): number {
  for (let i = from - 1; i >= 0; i--) {
    if (!stages[i]?.is_locked) return i;
  }
  return -1;
}

function findNextUnlockedIndex(stages: StageInput[], from: number): number {
  for (let i = from + 1; i < stages.length; i++) {
    if (!stages[i]?.is_locked) return i;
  }
  return -1;
}

function stageToPayload(s: StageInput): Record<string, unknown> {
  return {
    id: s.id,
    stage_name: s.stage_name,
    stage_order: s.stage_order,
    stage_type: s.stage_type,
    sla_days: s.sla_days,
    is_locked: s.is_locked,
    notify_candidate: s.notify_candidate,
    color: s.color,
    notify_email_body: s.notify_email_body || null,
    interviewer_email: s.interviewer_email || null,
  };
}

function SortableStageRow({
  stage,
  canEdit,
  onUpdate,
  onRemove,
  onMove,
  nameInputId,
  disableMoveUp,
  disableMoveDown,
}: {
  stage: StageInput;
  canEdit: boolean;
  onUpdate: (patch: Partial<StageInput>) => void;
  onRemove: () => void;
  onMove: (dir: "up" | "down") => void;
  nameInputId: string;
  disableMoveUp: boolean;
  disableMoveDown: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage.clientKey,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 ${canEdit ? "" : "opacity-60"}`}
    >
      {canEdit ? (
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            className="cursor-grab touch-none rounded p-0.5 text-[var(--muted)] hover:bg-white/[0.06] hover:text-[var(--text)] active:cursor-grabbing"
            aria-label="Drag to reorder stage"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              className="rounded p-0.5 text-[var(--muted)] hover:bg-white/[0.06] hover:text-[var(--text)] disabled:opacity-25"
              disabled={disableMoveUp}
              onClick={() => onMove("up")}
              aria-label="Move stage up"
              title="Move up"
            >
              <ChevronUp className="h-3.5 w-4" />
            </button>
            <button
              type="button"
              className="rounded p-0.5 text-[var(--muted)] hover:bg-white/[0.06] hover:text-[var(--text)] disabled:opacity-25"
              disabled={disableMoveDown}
              onClick={() => onMove("down")}
              aria-label="Move stage down"
              title="Move down"
            >
              <ChevronDown className="h-3.5 w-4" />
            </button>
          </div>
        </div>
      ) : null}
      <span
        className="h-8 w-8 shrink-0 rounded-full border border-[var(--border)]"
        style={{ backgroundColor: stage.color }}
        title="Stage color"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <label htmlFor={nameInputId} className="sr-only">
            Stage name
          </label>
          <input
            id={nameInputId}
            type="text"
            value={stage.stage_name}
            disabled={!canEdit}
            onChange={(e) => onUpdate({ stage_name: e.target.value })}
            className="min-w-[120px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-70"
          />
          {canEdit ? (
            <button
              type="button"
              onClick={() => document.getElementById(nameInputId)?.focus()}
              className="shrink-0 rounded-lg border border-[var(--border)] bg-white/[0.04] p-1.5 text-[var(--muted)] hover:bg-white/[0.08] hover:text-[var(--text)]"
              title="Focus stage name to edit"
              aria-label="Edit stage name"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <select
          value={stage.stage_type}
          disabled={!canEdit}
          onChange={(e) => onUpdate({ stage_type: e.target.value as PipelineStageType })}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
        >
          {PIPELINE_STAGE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-1 text-xs text-[var(--muted)]">
        SLA days
        <input
          type="number"
          min={0}
          max={365}
          disabled={!canEdit}
          value={stage.sla_days ?? ""}
          onChange={(e) =>
            onUpdate({
              sla_days: e.target.value === "" ? null : Number(e.target.value),
            })
          }
          className="w-16 rounded border border-[var(--border)] bg-[var(--bg)] px-1 py-1 text-sm"
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-[var(--muted)]">
        <input
          type="checkbox"
          disabled={!canEdit}
          checked={stage.notify_candidate}
          onChange={(e) => onUpdate({ notify_candidate: e.target.checked })}
        />
        Notify
      </label>
      <StageNotificationEditor
        stageName={stage.stage_name}
        notifyCandidate={stage.notify_candidate}
        disabled={!canEdit}
        message={stage.notify_email_body}
        onChange={(message) => onUpdate({ notify_email_body: message })}
      />
      <input
        type="color"
        disabled={!canEdit}
        value={stage.color?.length === 7 ? stage.color : "#6366f1"}
        onChange={(e) => onUpdate({ color: e.target.value })}
        className="h-8 w-10 cursor-pointer rounded border border-[var(--border)] bg-transparent"
      />
      {canEdit ? (
        <button
          type="button"
          onClick={() => void onRemove()}
          className="ml-auto rounded p-2 text-[var(--muted)] hover:bg-red-500/10 hover:text-red-400"
          aria-label="Delete stage"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export function OrgPipelineDefaultsPanel({ jobsHref }: { jobsHref: string }) {
  const { user } = useAuth();
  const canEdit = canEditOrgHiringSettings(user);

  const { data, loading, error, refetch } = useApiQuery<{ stages: PipelineStage[] }>(
    "/api/org/pipeline-defaults",
  );

  const [localStages, setLocalStages] = useState<StageInput[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const stagesFromApi = data?.stages;

  useEffect(() => {
    if (dirty) return;
    setLocalStages((stagesFromApi ?? []).map(mapFromApi));
  }, [stagesFromApi, dirty]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { locked, unlocked } = useMemo(() => splitLeadingLocked(localStages), [localStages]);

  const handleDragEnd = (event: DragEndEvent) => {
    if (!canEdit) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = unlocked.findIndex((s) => s.clientKey === active.id);
    const newIndex = unlocked.findIndex((s) => s.clientKey === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(unlocked, oldIndex, newIndex);
    setLocalStages([...locked, ...reordered].map((s, i) => ({ ...s, stage_order: i })));
    setDirty(true);
  };

  const moveUnlockedGlobal = (globalIndex: number, dir: "up" | "down") => {
    setLocalStages((prev) => {
      const j =
        dir === "up"
          ? findPrevUnlockedIndex(prev, globalIndex)
          : findNextUnlockedIndex(prev, globalIndex);
      if (j < 0) return prev;
      const next = [...prev];
      [next[globalIndex], next[j]] = [next[j], next[globalIndex]];
      return next.map((s, i) => ({ ...s, stage_order: i }));
    });
    setDirty(true);
  };

  const addStage = () => {
    setLocalStages((prev) => {
      const insertAt = getInsertIndexForNewStage(prev);
      const next = [...prev];
      next.splice(insertAt, 0, {
        clientKey: nanoid(12),
        stage_name: "New stage",
        stage_order: insertAt,
        stage_type: "screening",
        sla_days: 3,
        notify_candidate: true,
        color: "#6366f1",
        notify_email_body: "",
        interviewer_email: "",
      });
      return next.map((stage, index) => ({ ...stage, stage_order: index }));
    });
    setDirty(true);
    setSaveError(null);
  };

  const updateStage = (index: number, patch: Partial<StageInput>) => {
    setLocalStages((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    setDirty(true);
  };

  const removeAt = useCallback(
    async (index: number) => {
      const row = localStages[index];
      if (!row || row.is_locked) return;
      if (!row.id) {
        setLocalStages((prev) =>
          prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, stage_order: i })),
        );
        setDirty(true);
        return;
      }
      if (!window.confirm("Delete this default stage?")) return;
      const res = await fetch(`/api/org/pipeline-defaults/${row.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        window.alert(j.error ?? "Delete failed");
        return;
      }
      setDirty(false);
      await refetch();
    },
    [localStages, refetch],
  );

  const handleSave = async () => {
    if (!canEdit) return;
    if (!localStages.every((s) => s.stage_name.trim())) {
      setSaveError("Every stage needs a name before saving.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const csrf = await buildCsrfHeaders();
      const res = await fetch("/api/org/pipeline-defaults", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...csrf },
        body: JSON.stringify({ stages: localStages.map(stageToPayload) }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        stages?: PipelineStage[];
      };
      if (!res.ok) {
        setSaveError(json.error ?? `Save failed (${res.status})`);
        return;
      }
      setDirty(false);
      await refetch();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-4 text-sm text-[var(--text-muted)]">
        <Link href={jobsHref} className="text-[var(--accent)] hover:underline">
          Back to jobs
        </Link>
        {!canEdit ? (
          <div className="mt-2">
            <SettingsReadOnlyBanner />
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--muted)]" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-400">
          {error}
        </div>
      ) : (
        <fieldset
          disabled={!canEdit}
          className={`min-w-0 space-y-4 border-0 p-0 ${!canEdit ? "opacity-60 [&_*]:cursor-not-allowed" : ""}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="max-w-xl text-sm text-[var(--muted)]">
              Drag the grip on unlocked stages to reorder them. Applied and FitScore Review stay
              fixed at the top. Use the arrows for small moves, or the pencil to focus the stage
              name.
            </p>
            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <button
                  type="button"
                  onClick={addStage}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white"
                >
                  <Plus className="h-4 w-4" />
                  Add stage
                </button>
              )}
              {canEdit && dirty && (
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save
                </button>
              )}
            </div>
          </div>

          {saveError ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {saveError}
            </div>
          ) : null}

          <div className="space-y-2">
            {locked.map((s, i) => (
              <div
                key={s.clientKey}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 p-3"
              >
                <div className="flex flex-col">
                  <Lock className="h-4 w-4 text-[var(--muted)]" aria-label="Locked system stage" />
                </div>
                <span
                  className="h-8 w-8 shrink-0 rounded-full border border-[var(--border)]"
                  style={{ backgroundColor: s.color }}
                  title="Stage color"
                />
                <input
                  type="text"
                  value={s.stage_name}
                  disabled
                  className="min-w-[120px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm opacity-80"
                />
                <select
                  value={s.stage_type}
                  disabled
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm opacity-80"
                >
                  {PIPELINE_STAGE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs text-[var(--muted)]">
                  SLA days
                  <input
                    type="number"
                    disabled
                    value={s.sla_days ?? ""}
                    className="w-16 rounded border border-[var(--border)] bg-[var(--bg)] px-1 py-1 text-sm opacity-80"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-[var(--muted)]">
                  <input type="checkbox" disabled checked={s.notify_candidate} />
                  Notify
                </label>
                <StageNotificationEditor
                  stageName={s.stage_name}
                  notifyCandidate={s.notify_candidate}
                  disabled
                  message={s.notify_email_body}
                  onChange={() => {}}
                />
              </div>
            ))}

            {unlocked.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={unlocked.map((s) => s.clientKey)}
                  strategy={verticalListSortingStrategy}
                >
                  {unlocked.map((s) => {
                    const globalIndex = localStages.findIndex((x) => x.clientKey === s.clientKey);
                    const nameInputId = `org-pipeline-stage-name-${s.clientKey}`;
                    return (
                      <SortableStageRow
                        key={s.clientKey}
                        stage={s}
                        canEdit={canEdit}
                        nameInputId={nameInputId}
                        disableMoveUp={
                          !canEdit || findPrevUnlockedIndex(localStages, globalIndex) < 0
                        }
                        disableMoveDown={
                          !canEdit || findNextUnlockedIndex(localStages, globalIndex) < 0
                        }
                        onUpdate={(patch) => updateStage(globalIndex, patch)}
                        onRemove={() => void removeAt(globalIndex)}
                        onMove={(dir) => moveUnlockedGlobal(globalIndex, dir)}
                      />
                    );
                  })}
                </SortableContext>
              </DndContext>
            ) : null}
          </div>

          {canEdit && (
            <p className="rounded-lg border border-[var(--border)] bg-white/[0.02] px-3 py-2 text-xs text-[var(--muted)]">
              Candidate emails use a standard TigerHire update by default. Use each row&apos;s
              message button only when a stage needs extra instructions.
            </p>
          )}
        </fieldset>
      )}
    </>
  );
}
