"use client";

import {
  PipelineCard,
  PIPELINE_STATUS_META,
  STATUS_ORDER,
  type PipelineCandidate,
} from "@/app/(dashboard)/recruit/pipeline/components/RecruitPipelineCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getPipelineStatusTone } from "@/lib/status-tones";
import { useMemo, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

/** A column drop target. Highlights while a card is dragged over it. */
function DroppableColumn({
  id,
  disabled,
  className,
  children,
}: {
  id: string;
  disabled: boolean;
  className: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      className={`${className} transition ${
        isOver && !disabled ? "ring-2 ring-[var(--accent)]/50 bg-[var(--accent)]/[0.05]" : ""
      }`}
    >
      {children}
    </div>
  );
}

/** Wraps a candidate card with a drag grip (keeps the card's own buttons/clicks intact). */
function DraggableCard({
  id,
  data,
  disabled,
  children,
}: {
  id: string;
  data: { jobId: string };
  disabled: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id, data, disabled });
  return (
    <div ref={setNodeRef} className={`flex gap-1 ${isDragging ? "opacity-40" : ""}`}>
      {!disabled ? (
        <button
          type="button"
          {...listeners}
          {...attributes}
          aria-label="Drag candidate to another stage"
          className="mt-1 flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-white/25 transition hover:text-white/60 active:cursor-grabbing"
        >
          <GripVertical size={15} />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

interface PipelineKanbanBoardProps {
  candidates: PipelineCandidate[];
  stageCatalog?: Array<{ id?: string; stage_name: string; stage_order: number }>;
  updating: string | null;
  outcomeLogging?: string | null;
  outcomeLogged?: string | null;
  interviewRequesting?: string | null;
  interviewSuccess?: string | null;
  schedulingLinkSending?: string | null;
  schedulingLinkSuccess?: string | null;
  allowReferrerMessage?: boolean;
  readOnly?: boolean;
  onStatusChange: (pcId: string, jobId: string, status: string) => void;
  onMoveStage?: (jobId: string, pipelineCandidateId: string, stageId: string) => Promise<void>;
  onOutcomeLog?: (
    jobId: string,
    candidateId: string,
    outcome: "hired" | "rejected",
    pcId: string,
  ) => void;
  onRequestInterview?: (
    jobId: string,
    candidateId: string,
    stageId: string | undefined,
    pcId: string,
  ) => Promise<void>;
  onSendSchedulingLink?: (jobId: string, pcId: string) => Promise<void>;
  selectedIds?: Set<string>;
  selectionMode?: boolean;
  onToggleSelect?: (pipelineCandidateId: string, selected: boolean) => void;
}

export function PipelineKanbanBoard({
  candidates,
  stageCatalog = [],
  updating,
  outcomeLogging,
  outcomeLogged,
  interviewRequesting,
  interviewSuccess,
  schedulingLinkSending,
  schedulingLinkSuccess,
  allowReferrerMessage,
  readOnly = false,
  onStatusChange,
  onMoveStage,
  onOutcomeLog,
  onRequestInterview,
  onSendSchedulingLink,
  selectedIds,
  selectionMode = false,
  onToggleSelect,
}: PipelineKanbanBoardProps) {
  const stageNameById = new Map(
    stageCatalog
      .filter((stage) => stage.id && stage.stage_name)
      .map((stage) => [String(stage.id), String(stage.stage_name)]),
  );

  const columnKeyForStage = (stage: { id?: string; stage_name?: string | null }) => {
    return `catalog-name:${String(stage.stage_name ?? "")
      .trim()
      .toLowerCase()}`;
  };

  const columnKeyForCandidate = (pc: PipelineCandidate) => {
    const stageName =
      pc.stageName?.trim() ||
      (pc.stage_id ? stageNameById.get(pc.stage_id)?.trim() : undefined) ||
      "";
    if (stageName) return `catalog-name:${stageName.toLowerCase()}`;
    if (pc.stage_id) return `catalog:${pc.stage_id}`;
    return `status:${pc.status}`;
  };

  const columns = useMemo(() => {
    const stageColumns = new Map<
      string,
      { key: string; label: string; displayLabel: string; order: number; statusForTone: string }
    >();

    for (const stage of stageCatalog) {
      const label = String(stage.stage_name ?? "").trim();
      if (!label) continue;
      const key = columnKeyForStage(stage);
      const order = Number(stage.stage_order ?? Number.MAX_SAFE_INTEGER / 2);
      const existing = stageColumns.get(key);
      if (existing) {
        if (order < existing.order) existing.order = order;
        continue;
      }
      stageColumns.set(key, {
        key,
        label,
        displayLabel: label,
        order,
        statusForTone: "in_progress",
      });
    }

    for (const pc of candidates) {
      const resolvedStageName =
        pc.stageName?.trim() ||
        (pc.stage_id ? stageNameById.get(pc.stage_id)?.trim() : undefined) ||
        "";
      const hasStage = Boolean(resolvedStageName);
      const key = columnKeyForCandidate(pc);
      const existing = stageColumns.get(key);
      if (existing) {
        if (hasStage && typeof pc.stageOrder === "number" && pc.stageOrder < existing.order) {
          existing.order = pc.stageOrder;
        }
        continue;
      }

      const stageLabel = hasStage
        ? resolvedStageName
        : (PIPELINE_STATUS_META[pc.status]?.label ?? pc.status);
      const fallbackOrder = STATUS_ORDER.indexOf(pc.status as (typeof STATUS_ORDER)[number]);
      const baseOrder = hasStage
        ? (pc.stageOrder ?? Number.MAX_SAFE_INTEGER / 2)
        : fallbackOrder >= 0
          ? 10_000 + fallbackOrder
          : Number.MAX_SAFE_INTEGER;

      stageColumns.set(key, {
        key,
        label: stageLabel,
        displayLabel: stageLabel,
        order: baseOrder,
        statusForTone: pc.status,
      });
    }

    return Array.from(stageColumns.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.label.localeCompare(b.label);
    });
  }, [candidates, stageCatalog, stageNameById]);

  // Resolve a column (by stage name) to a stage id, so a drop knows where to move the candidate.
  const stageIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const stage of stageCatalog) {
      const name = String(stage.stage_name ?? "")
        .trim()
        .toLowerCase();
      if (stage.id && name && !map.has(name)) map.set(name, String(stage.id));
    }
    return map;
  }, [stageCatalog]);

  // Drag only where a drop is unambiguous: a stage-backed board, not read-only, not selecting.
  const dragEnabled = Boolean(onMoveStage) && !readOnly && !selectionMode && stageIdByName.size > 0;

  const [activeId, setActiveId] = useState<string | null>(null);
  const activePc = activeId ? (candidates.find((pc) => pc.id === activeId) ?? null) : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || !onMoveStage) return;
    const pc = candidates.find((c) => c.id === String(active.id));
    if (!pc) return;
    const targetKey = String(over.id);
    if (columnKeyForCandidate(pc) === targetKey) return;
    const targetColumn = columns.find((c) => c.key === targetKey);
    if (!targetColumn) return;
    const stageId = stageIdByName.get(targetColumn.label.trim().toLowerCase());
    if (!stageId || stageId === pc.stage_id) return;
    void onMoveStage(pc.job_id, pc.id, stageId);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="overflow-x-auto pb-4">
        <div className="inline-flex min-w-max gap-4">
          {columns.map((column) => {
            const columnCandidates = candidates.filter((pc) => {
              return columnKeyForCandidate(pc) === column.key;
            });
            const tone = getPipelineStatusTone(column.statusForTone);
            return (
              <DroppableColumn
                key={column.key}
                id={column.key}
                disabled={!dragEnabled}
                className="flex h-[70vh] w-[320px] shrink-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)]/40 backdrop-blur-sm"
              >
                <div className="border-b border-[var(--border)] px-4 py-3">
                  <div className="flex items-center justify-between">
                    <h3 className="heading-card text-sm text-[var(--text)]">
                      {column.displayLabel}
                    </h3>
                    <span className="flex h-6 min-w-6 items-center justify-center">
                      <StatusBadge tone={tone} size="sm">
                        {columnCandidates.length}
                      </StatusBadge>
                    </span>
                  </div>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
                  {columnCandidates.length === 0 ? (
                    <p className="py-4 text-center text-xs text-[var(--text-subtle)]">
                      No candidates
                    </p>
                  ) : (
                    columnCandidates.map((pc) => (
                      <DraggableCard
                        key={pc.id}
                        id={pc.id}
                        data={{ jobId: pc.job_id }}
                        disabled={!dragEnabled}
                      >
                        <PipelineCard
                          pc={pc}
                          onStatusChange={onStatusChange}
                          onMoveStage={onMoveStage}
                          onOutcomeLog={
                            onOutcomeLog
                              ? (jobId, candidateId, outcome) =>
                                  onOutcomeLog(jobId, candidateId, outcome, pc.id)
                              : undefined
                          }
                          onRequestInterview={
                            onRequestInterview
                              ? (jobId, candidateId, stageId) =>
                                  onRequestInterview(jobId, candidateId, stageId, pc.id)
                              : undefined
                          }
                          updating={updating}
                          outcomeLogging={outcomeLogging}
                          outcomeLogged={outcomeLogged}
                          interviewRequesting={interviewRequesting}
                          interviewSuccess={interviewSuccess}
                          schedulingLinkSending={schedulingLinkSending}
                          schedulingLinkSuccess={schedulingLinkSuccess}
                          onSendSchedulingLink={
                            onSendSchedulingLink
                              ? (jobId, pipelineCandidateId) =>
                                  onSendSchedulingLink(jobId, pipelineCandidateId)
                              : undefined
                          }
                          allowReferrerMessage={allowReferrerMessage}
                          readOnly={readOnly}
                          selected={selectedIds?.has(pc.id) ?? false}
                          selectionMode={selectionMode}
                          onToggleSelect={
                            onToggleSelect
                              ? (selected) => onToggleSelect(pc.id, selected)
                              : undefined
                          }
                        />
                      </DraggableCard>
                    ))
                  )}
                </div>
              </DroppableColumn>
            );
          })}
        </div>
      </div>
      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.2, 0.7, 0.4, 1)" }}>
        {activePc ? (
          <div className="w-[300px] rotate-2 cursor-grabbing rounded-xl border border-[var(--accent)]/50 bg-[var(--surface)] px-3 py-2.5 shadow-2xl">
            <p className="truncate text-sm font-semibold text-[var(--text)]">
              {activePc.candidates?.name ?? "Candidate"}
            </p>
            <p className="truncate text-xs text-white/55">{activePc.jobTitle}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
