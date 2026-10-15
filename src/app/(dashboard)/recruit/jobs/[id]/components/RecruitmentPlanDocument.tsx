"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { mapDbJobToPosting } from "@/lib/mappers";
import type {
  PlanHistoryRow,
  PlanStageRow,
  RecruitmentPlanRow,
} from "@/lib/recruitment-plan/types";
import { Skeleton } from "@/components/ui/Skeleton";
import { PlanTasksBanner } from "@/components/recruit/plan/PlanTasksBanner";
import { PlanReadinessStrip } from "@/components/recruit/plan/PlanReadinessStrip";
import { PlanLifecycleSections } from "@/components/recruit/plan/PlanLifecycleSections";
import { PlanStageActivityPanel } from "@/components/recruit/plan/PlanStageActivityPanel";
import { PlanConfigureProcessSection } from "@/components/recruit/plan/PlanConfigureProcessSection";
import { PlanAutomationStatus } from "@/components/recruit/plan/PlanAutomationStatus";
import { PlanOffersSection } from "@/components/recruit/plan/PlanOffersSection";
import { JdBaseSetupStep } from "./JdBaseSetupStep";
import { WhatsAppScreeningSetup } from "@/components/recruit/plan/WhatsAppScreeningSetup";

type InterviewerOption = { id: string; full_name: string | null; email: string };

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="heading-section mb-3 text-lg font-semibold text-[var(--text)]">{children}</h2>
  );
}

export function RecruitmentPlanDocument({ jobId }: { jobId: string }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [interviewerOptions, setInterviewerOptions] = useState<InterviewerOption[]>([]);

  const { data: jobData, loading: jobLoading } = useApiQuery<{ job: Record<string, unknown> }>(
    `/api/jobs/${jobId}`,
  );
  const {
    data: planData,
    loading: planLoading,
    refetch: refetchPlan,
  } = useApiQuery<{
    plan: RecruitmentPlanRow;
    stages: PlanStageRow[];
  }>(`/api/jobs/${jobId}/recruitment-plan`);

  const { data: historyData, refetch: refetchHistory } = useApiQuery<{ history: PlanHistoryRow[] }>(
    `/api/jobs/${jobId}/recruitment-plan/history?limit=20`,
  );

  const { data: templatesData } = useApiQuery<{
    templates: Array<{ id: string; name: string }>;
  }>(`/api/jobs/${jobId}/feedback-templates`);

  const { data: pipelineStagesData } = useApiQuery<{
    stages: { id: string; stage_name: string; stage_order: number }[];
  }>(`/api/jobs/${jobId}/pipeline-stages`);

  const { data: pipelineData } = useApiQuery<{
    pipeline: {
      stage_id: string | null;
      job_id: string;
      candidate_id: string;
      application_id?: string | null;
    }[];
  }>("/api/my-pipeline");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (hash !== "ideal-profile-setup" && hash !== "scoring-setup") return;
    const scroll = () => {
      document.getElementById("ideal-profile-setup")?.scrollIntoView({ behavior: "smooth" });
    };
    const t = window.setTimeout(scroll, 400);
    return () => window.clearTimeout(t);
  }, [jobId]);

  useEffect(() => {
    void fetch(`/api/jobs/${jobId}/interviewer-profile-options`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) return [];
        const j = (await r.json()) as { profiles?: InterviewerOption[] };
        return j.profiles ?? [];
      })
      .then(setInterviewerOptions)
      .catch(() => setInterviewerOptions([]));
  }, [jobId]);

  const stages = planData?.stages ?? [];
  const history = historyData?.history ?? [];

  const pipelineStageIdByOrder = useMemo(() => {
    const m = new Map<number, string>();
    for (const ps of pipelineStagesData?.stages ?? []) {
      m.set(ps.stage_order, ps.id);
    }
    return m;
  }, [pipelineStagesData]);

  const stagePipelineStats = useMemo(() => {
    const countsByPipelineStageId = new Map<string, number>();
    const sampleCandidateByPipelineStageId = new Map<string, string>();
    const sampleApplicationByPipelineStageId = new Map<string, string>();
    const countsByOrder = new Map<number, number>();
    const jobPipeline = (pipelineData?.pipeline ?? []).filter((p) => p.job_id === jobId);

    for (const pc of jobPipeline) {
      if (!pc.stage_id) continue;
      countsByPipelineStageId.set(pc.stage_id, (countsByPipelineStageId.get(pc.stage_id) ?? 0) + 1);
      if (!sampleCandidateByPipelineStageId.has(pc.stage_id)) {
        sampleCandidateByPipelineStageId.set(pc.stage_id, pc.candidate_id);
        if (pc.application_id) {
          sampleApplicationByPipelineStageId.set(pc.stage_id, pc.application_id);
        }
      }
      for (const [order, psId] of pipelineStageIdByOrder) {
        if (psId === pc.stage_id) {
          countsByOrder.set(order, (countsByOrder.get(order) ?? 0) + 1);
        }
      }
    }

    const byStage: { name: string; count: number }[] = [];
    for (const ps of pipelineStagesData?.stages ?? []) {
      byStage.push({
        name: ps.stage_name,
        count: countsByPipelineStageId.get(ps.id) ?? 0,
      });
    }

    return {
      countsByPipelineStageId,
      sampleCandidateByPipelineStageId,
      sampleApplicationByPipelineStageId,
      countsByOrder,
      total: jobPipeline.length,
      byStage,
    };
  }, [pipelineData, jobId, pipelineStageIdByOrder, pipelineStagesData]);

  function countForStage(stage: PlanStageRow): number {
    if (stage.pipeline_stage_id) {
      return stagePipelineStats.countsByPipelineStageId.get(stage.pipeline_stage_id) ?? 0;
    }
    return stagePipelineStats.countsByOrder.get(stage.stage_order) ?? 0;
  }

  const pipelineStageNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const ps of pipelineStagesData?.stages ?? []) {
      m.set(ps.id, ps.stage_name);
    }
    return m;
  }, [pipelineStagesData]);

  function pipelineColumnLabelForStage(stage: PlanStageRow): string | null {
    const id = stage.pipeline_stage_id ?? pipelineStageIdByOrder.get(stage.stage_order) ?? null;
    if (!id) return null;
    return pipelineStageNameById.get(id) ?? null;
  }

  function sampleIdsForStage(stage: PlanStageRow): {
    candidateId: string | null;
    applicationId: string | null;
  } {
    const pipelineStageId =
      stage.pipeline_stage_id ?? pipelineStageIdByOrder.get(stage.stage_order) ?? null;
    if (!pipelineStageId) {
      return { candidateId: null, applicationId: null };
    }
    return {
      candidateId: stagePipelineStats.sampleCandidateByPipelineStageId.get(pipelineStageId) ?? null,
      applicationId:
        stagePipelineStats.sampleApplicationByPipelineStageId.get(pipelineStageId) ?? null,
    };
  }

  if (jobLoading || planLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-12">
      <PlanReadinessStrip jobId={jobId} />

      <JdBaseSetupStep jobId={jobId} variant="recruit" scrollAnchorId="ideal-profile-setup" />

      <WhatsAppScreeningSetup jobId={jobId} />

      <PlanAutomationStatus history={history} />

      <PlanLifecycleSections
        jobId={jobId}
        pipelineCounts={{
          total: stagePipelineStats.total,
          byStage: stagePipelineStats.byStage,
        }}
      />

      <PlanTasksBanner jobId={jobId} />

      <PlanOffersSection jobId={jobId} />

      <section>
        <SectionTitle>Their-side activity</SectionTitle>
        <PlanStageActivityPanel jobId={jobId} />
      </section>

      <PlanConfigureProcessSection
        jobId={jobId}
        stages={stages}
        interviewerOptions={interviewerOptions}
        templateOptions={templatesData?.templates ?? []}
        countForStage={countForStage}
        sampleIdsForStage={sampleIdsForStage}
        pipelineColumnLabelForStage={pipelineColumnLabelForStage}
        onPlanRefetch={() => void refetchPlan()}
        onHistoryRefetch={() => void refetchHistory()}
      />

      {/* Scheduling lives in its own top tab; the Plan doc no longer duplicates a
          "This week's calendar" section here to avoid confusing IA. */}

      <section>
        <button
          type="button"
          className="mb-3 flex items-center gap-2 text-sm text-white/50 hover:text-white/70"
          onClick={() => setHistoryOpen((o) => !o)}
        >
          {historyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          History ({history.length})
        </button>
        {historyOpen ? (
          history.length === 0 ? (
            <p className="text-sm text-white/50">No plan activity yet.</p>
          ) : (
            <ul className="card-lifted divide-y divide-[var(--border)]">
              {history.map((row) => (
                <li key={row.id} className="px-4 py-3">
                  <p className="text-sm text-[var(--text)]">{row.event_summary}</p>
                  <p className="text-xs text-white/45">
                    {row.actor_type} · {row.event_type} ·{" "}
                    {new Date(row.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </section>
    </div>
  );
}
