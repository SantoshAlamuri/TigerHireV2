"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Settings2 } from "lucide-react";
import type { PlanStageRow } from "@/lib/recruitment-plan/types";
import {
  countStagesNeedingSetup,
  getPlanStageConfigProfile,
  getStageSetupStatus,
  getStageSetupSummary,
} from "@/lib/recruitment-plan/plan-stage-config-profile";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PlanStageActions } from "@/components/recruit/plan/PlanStageActions";
import { PlanStageEditPanel } from "@/app/(dashboard)/recruit/jobs/[id]/components/PlanStageEditPanel";

type InterviewerOption = { id: string; full_name: string | null; email: string };

type Props = {
  jobId: string;
  stages: PlanStageRow[];
  interviewerOptions: InterviewerOption[];
  templateOptions: Array<{ id: string; name: string }>;
  countForStage: (stage: PlanStageRow) => number;
  sampleIdsForStage: (stage: PlanStageRow) => {
    candidateId: string | null;
    applicationId: string | null;
  };
  pipelineColumnLabelForStage?: (stage: PlanStageRow) => string | null;
  onPlanRefetch: () => void;
  onHistoryRefetch: () => void;
};

export function PlanConfigureProcessSection({
  jobId,
  stages,
  interviewerOptions,
  templateOptions,
  countForStage,
  sampleIdsForStage,
  pipelineColumnLabelForStage,
  onPlanRefetch,
  onHistoryRefetch,
}: Props) {
  const setupCounts = useMemo(() => countStagesNeedingSetup(stages), [stages]);
  const [sectionOpen, setSectionOpen] = useState(setupCounts.needsSetup > 0);
  const [expandedStageId, setExpandedStageId] = useState<string | null>(null);
  const [configuringStageId, setConfiguringStageId] = useState<string | null>(null);

  return (
    <section>
      <button
        type="button"
        className="mb-3 flex w-full items-center gap-2 text-left"
        onClick={() => setSectionOpen((o) => !o)}
      >
        {sectionOpen ? (
          <ChevronDown className="h-4 w-4 text-white/50" />
        ) : (
          <ChevronRight className="h-4 w-4 text-white/50" />
        )}
        <h2 className="heading-section flex flex-1 flex-wrap items-center gap-2 text-lg font-semibold text-[var(--text)]">
          Stage setup
          {stages.length > 0 ? (
            <StatusBadge tone={setupCounts.needsSetup > 0 ? "warning" : "success"} size="sm">
              {setupCounts.ready}/{stages.length} ready
            </StatusBadge>
          ) : null}
        </h2>
      </button>

      {sectionOpen ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-[color:var(--status-info-border)] bg-[color:var(--status-info-bg)] px-4 py-3 text-sm text-[color:var(--status-info-fg)]">
            <p className="font-medium">One-time setup per stage</p>
            <p className="mt-1 text-xs opacity-90">
              Each round (Phone screen, Technical, HM round, etc.) has its own settings. Configure
              once here — when candidates reach that step, scheduling, invites, and scorecards use
              these defaults. Day-to-day work stays in Tasks and the pipeline.
            </p>
          </div>

          {stages.length === 0 ? (
            <p className="text-sm text-white/50">No stages on this plan yet.</p>
          ) : (
            <ul className="space-y-2">
              {stages.map((stage) => {
                const profile = getPlanStageConfigProfile(stage.stage_type);
                const setupStatus = getStageSetupStatus(stage);
                const expanded = expandedStageId === stage.id;
                const configuring = configuringStageId === stage.id;
                const count = countForStage(stage);
                const sampleIds = sampleIdsForStage(stage);
                const pipelineColumn = pipelineColumnLabelForStage?.(stage) ?? null;

                return (
                  <li key={stage.id} className="card-lifted overflow-hidden">
                    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-start gap-3 text-left"
                        onClick={() => {
                          if (expanded) {
                            setExpandedStageId(null);
                            setConfiguringStageId(null);
                          } else {
                            setExpandedStageId(stage.id);
                            setConfiguringStageId(setupStatus === "needs_setup" ? stage.id : null);
                          }
                        }}
                      >
                        {expanded ? (
                          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-white/50" />
                        ) : (
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-white/50" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-[var(--text)]">{stage.display_name}</p>
                            <StatusBadge
                              tone={setupStatus === "ready" ? "success" : "warning"}
                              size="sm"
                            >
                              {setupStatus === "ready" ? "Ready" : "Needs setup"}
                            </StatusBadge>
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/55">
                              {profile.typeLabel}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-white/50">{profile.purpose}</p>
                          <p className="mt-1 text-xs text-white/45">
                            {getStageSetupSummary(stage)}
                          </p>
                          {pipelineColumn ? (
                            <p className="mt-0.5 text-xs text-white/40">
                              Pipeline column:{" "}
                              <span className="text-white/60">{pipelineColumn}</span>
                            </p>
                          ) : null}
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-2 pl-7 sm:pl-0">
                        <span className="text-xs text-white/45">{count} in pipeline</span>
                        {!expanded ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs font-medium text-white/70 hover:bg-white/[0.04]"
                            onClick={() => {
                              setExpandedStageId(stage.id);
                              setConfiguringStageId(stage.id);
                            }}
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                            {setupStatus === "ready" ? "Edit setup" : "Set up"}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {expanded ? (
                      <div className="border-t border-[var(--border)] px-4 pb-4 pt-3">
                        <PlanStageActions
                          jobId={jobId}
                          stage={stage}
                          candidateCount={count}
                          sampleCandidateId={sampleIds.candidateId}
                          sampleApplicationId={sampleIds.applicationId}
                        />
                        {!configuring ? (
                          <button
                            type="button"
                            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                            onClick={() => setConfiguringStageId(stage.id)}
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                            {setupStatus === "ready"
                              ? "Edit this stage’s setup"
                              : "Complete one-time setup"}
                          </button>
                        ) : (
                          <PlanStageEditPanel
                            stage={stage}
                            jobId={jobId}
                            allStages={stages}
                            interviewerOptions={interviewerOptions}
                            templateOptions={templateOptions}
                            onSaved={() => {
                              setConfiguringStageId(null);
                              onPlanRefetch();
                              onHistoryRefetch();
                            }}
                            onCancel={() => setConfiguringStageId(null)}
                          />
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
