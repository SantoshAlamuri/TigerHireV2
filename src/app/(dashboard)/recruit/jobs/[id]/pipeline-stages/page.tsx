"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Loader2,
  Plus,
  Trash2,
  GripVertical,
  Save,
  Mail,
  Lock,
  RotateCcw,
  CalendarClock,
} from "lucide-react";
import { useApiQuery, useOptimisticMutation } from "@/lib/hooks/use-api";
import type { PipelineStage } from "@/types";
import { PIPELINE_STAGE_TYPES, type PipelineStageType } from "@/lib/pipeline/stage-types";
import { StageNotificationEditor } from "@/components/dashboard/StageNotificationEditor";
import { FeedbackTemplatesBlock } from "../components/FeedbackTemplatesBlock";
import { isInterviewerIdentityV1UiEnabled } from "@/lib/rollouts/interviewer-identity-ui";
import { isInterviewLikeStage } from "@/lib/pipeline/stage-interviewer";

const ffInterviewIdentityUi = isInterviewerIdentityV1UiEnabled();

type InterviewerOption = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
};

type StageInput = {
  id?: string;
  stage_name: string;
  stage_order: number;
  stage_type: PipelineStageType;
  sla_days: number | null;
  is_locked?: boolean;
  notify_candidate: boolean;
  color: string;
  notify_email_body: string;
  interviewer_user_id: string;
  interviewer_email: string;
  interviewer_name: string;
  interviewer_picker_query: string;
  feedback_template_id: string;
};

function mapFromApi(s: PipelineStage): StageInput {
  return {
    id: s.id,
    stage_name: s.stage_name,
    stage_order: s.stage_order,
    stage_type: (s.stage_type as PipelineStageType) ?? "screening",
    sla_days: s.sla_days ?? null,
    is_locked: s.is_locked,
    notify_candidate: Boolean(s.notify_candidate),
    color: s.color ?? "#6366f1",
    notify_email_body: s.notify_email_body ?? "",
    interviewer_user_id: s.interviewer_user_id ?? "",
    interviewer_email: (s.interviewer?.email ?? s.interviewer_email ?? "") || "",
    interviewer_name: (s.interviewer_name ?? s.interviewer?.full_name ?? "") || "",
    interviewer_picker_query: "",
    feedback_template_id: s.feedback_template_id ?? "",
  };
}

function getInsertIndexForNewStage(stages: StageInput[]): number {
  const firstTerminalLocked = stages.findIndex((stage, index) => index > 1 && stage.is_locked);
  return firstTerminalLocked === -1 ? stages.length : firstTerminalLocked;
}

export default function PipelineStagesPage() {
  const params = useParams();
  const jobId = params.id as string;

  const {
    data: stagesData,
    loading,
    error,
    refetch,
  } = useApiQuery<{ stages: PipelineStage[] }>(`/api/jobs/${jobId}/pipeline-stages`);

  const { mutate: saveStages, loading: saving } = useOptimisticMutation<
    { stages: PipelineStage[] },
    { stages: Record<string, unknown>[] }
  >(`/api/jobs/${jobId}/pipeline-stages`);
  const { data: templatesData, refetch: refetchTemplates } = useApiQuery<{
    templates: Array<{ id: string; name: string; fields: unknown[] }>;
  }>(`/api/jobs/${jobId}/feedback-templates`);

  const [localStages, setLocalStages] = useState<StageInput[]>([]);
  const [dirty, setDirty] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const [interviewerOptions, setInterviewerOptions] = useState<InterviewerOption[]>([]);

  const stagesFromApi = stagesData?.stages;

  useEffect(() => {
    if (!ffInterviewIdentityUi || !jobId) return;
    void fetch(`/api/jobs/${jobId}/interviewer-profile-options`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) return [];
        const j = (await r.json()) as { profiles?: InterviewerOption[] };
        return j.profiles ?? [];
      })
      .then((list) => setInterviewerOptions(list))
      .catch(() => setInterviewerOptions([]));
  }, [jobId]);

  useEffect(() => {
    if (dirty) return;
    setLocalStages((stagesFromApi ?? []).map(mapFromApi));
  }, [stagesFromApi, dirty]);

  const addStage = () => {
    setLocalStages((prev) => {
      const insertAt = getInsertIndexForNewStage(prev);
      const next = [...prev];
      next.splice(insertAt, 0, {
        stage_name: "",
        stage_order: insertAt,
        stage_type: "screening",
        sla_days: 3,
        notify_candidate: true,
        color: "#6366f1",
        notify_email_body: "",
        interviewer_user_id: "",
        interviewer_email: "",
        interviewer_name: "",
        interviewer_picker_query: "",
        feedback_template_id: "",
      });
      return next.map((stage, index) => ({ ...stage, stage_order: index }));
    });
    setDirty(true);
  };

  const moveStage = (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= localStages.length) return;
    if (localStages[index]?.is_locked || localStages[target]?.is_locked) return;
    setLocalStages((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((s, i) => ({ ...s, stage_order: i }));
    });
    setDirty(true);
  };

  const updateStage = (index: number, patch: Partial<StageInput>) => {
    setLocalStages((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    setDirty(true);
  };

  const removeStage = useCallback(
    async (index: number) => {
      const row = localStages[index];
      if (!row) return;
      if (row.is_locked) return;
      if (!row.id) {
        setLocalStages((prev) =>
          prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, stage_order: i })),
        );
        setDirty(true);
        return;
      }
      if (
        !window.confirm(
          "Remove this stage? Candidates currently in this stage will be moved to FitScore Review.",
        )
      ) {
        return;
      }
      setActionError(null);
      const res = await fetch(`/api/jobs/${jobId}/pipeline-stages/${row.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        stages?: PipelineStage[];
      };
      if (!res.ok) {
        setActionError(json.error ?? "Could not delete stage");
        return;
      }
      setDirty(false);
      if (json.stages) {
        setLocalStages(json.stages.map(mapFromApi));
      } else {
        await refetch();
      }
      setSuccess("Stage removed");
      setTimeout(() => setSuccess(null), 2500);
    },
    [jobId, localStages, refetch],
  );

  const handleSave = async () => {
    const valid = localStages.every((s) => s.stage_name.trim());
    if (!valid) return;

    const result = await saveStages({
      stages: localStages.map((s) => ({
        id: s.id,
        stage_name: s.stage_name,
        stage_order: s.stage_order,
        stage_type: s.stage_type,
        sla_days: s.sla_days,
        is_locked: s.is_locked,
        notify_candidate: s.notify_candidate,
        color: s.color,
        notify_email_body: s.notify_email_body || null,
        interviewer_user_id: s.interviewer_user_id.trim() || null,
        interviewer_email: s.interviewer_user_id.trim() ? null : s.interviewer_email.trim() || null,
        interviewer_name: s.interviewer_user_id.trim() ? null : s.interviewer_name.trim() || null,
        feedback_template_id: s.feedback_template_id || null,
      })),
    });
    if (result?.stages) {
      setLocalStages(result.stages.map(mapFromApi));
      setDirty(false);
      setSuccess("Pipeline stages saved successfully");
      setTimeout(() => setSuccess(null), 3000);
      await refetch();
    }
  };

  const handleResetFromOrg = async () => {
    if (
      !window.confirm(
        "Replace all unlocked stages with your organisation defaults? Candidates on removed stages move to FitScore Review.",
      )
    ) {
      return;
    }
    setResetting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/pipeline-stages/reset-from-org`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        stages?: PipelineStage[];
      };
      if (!res.ok) {
        setActionError(json.error ?? "Reset failed");
        return;
      }
      setDirty(false);
      if (json.stages) setLocalStages(json.stages.map(mapFromApi));
      else await refetch();
      setSuccess("Pipeline reset from org defaults");
      setTimeout(() => setSuccess(null), 3000);
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <div className="mb-6 space-y-3">
        <div>
          <h2 className="heading-section text-lg text-[var(--text)]">Hiring setup</h2>
          <p className="mt-1 max-w-3xl text-sm text-white/60">
            Name your hiring rounds, assign who runs each{" "}
            <strong className="text-[var(--text)]">interview</strong> stage, and attach feedback
            templates. This is <em>not</em> where you pick calendar times — use the{" "}
            <strong className="text-[var(--text)]">Interviews</strong> tab for slots and booking.
          </p>
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-white/75">
            <CalendarClock className="mb-0.5 mr-1.5 inline h-4 w-4 text-[var(--accent)] align-text-bottom" />
            Need to open availability or book a candidate? That happens under{" "}
            <strong className="text-[var(--text)]">Interviews</strong>, not here.
          </p>
          <Link
            href={`/recruit/jobs/${jobId}/interviews`}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-white/[0.04]"
          >
            Go to interview scheduling
          </Link>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-white/60" />
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-red-400">
          {error}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <h3 className="heading-card mb-2 text-sm text-[var(--text)]">Feedback templates</h3>
            <p className="mb-3 text-sm text-white/60">
              Create templates here, then attach one to each interview stage below.
            </p>
            <FeedbackTemplatesBlock
              jobId={jobId}
              templates={templatesData?.templates ?? []}
              onSaved={async () => {
                await refetchTemplates();
              }}
            />
          </div>

          {success && (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-sm text-emerald-400">
              {success}
            </div>
          )}
          {actionError && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
              {actionError}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm text-white/60">
              <strong className="text-[var(--text)]">Locked</strong> rows are system stages — you
              don&apos;t rename or remove them.{" "}
              <strong className="text-[var(--text)]">Unlocked</strong> rows are your funnel; expand
              the interviewer block only for stages whose type is{" "}
              <strong className="text-[var(--text)]">interview</strong>.
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleResetFromOrg}
                disabled={resetting}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--bg)] disabled:opacity-50"
              >
                {resetting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Reset to org defaults
              </button>
              <button
                type="button"
                onClick={addStage}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-white/[0.04]"
                title="Use only when you need an extra hiring round"
              >
                <Plus className="h-4 w-4" />
                Add round to pipeline
              </button>
              {dirty && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save changes
                </button>
              )}
            </div>
          </div>

          {localStages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--card)] p-12 text-center">
              <p className="text-white/60">No pipeline stages defined yet.</p>
              <button
                type="button"
                onClick={addStage}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-white/[0.04]"
              >
                <Plus className="h-4 w-4" />
                Add first round
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {localStages.map((stage, index) => (
                <div
                  key={stage.id ?? `new-${index}`}
                  className={`flex flex-wrap items-center gap-3 rounded-lg border p-4 ${
                    stage.is_locked
                      ? "border-white/10 bg-black/25"
                      : "border-[var(--border)] bg-[var(--card)]"
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    {stage.is_locked ? (
                      <Lock className="h-4 w-4 text-white/60" aria-label="Locked" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => moveStage(index, "up")}
                        disabled={index === 0 || Boolean(localStages[index - 1]?.is_locked)}
                        className="text-white/60 hover:text-[var(--text)] disabled:opacity-30"
                        aria-label="Move up"
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-sm font-medium text-[var(--text)]"
                    style={{ backgroundColor: stage.color }}
                  >
                    {index + 1}
                  </span>

                  <span className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-medium uppercase text-[var(--accent)]">
                    {stage.stage_type}
                  </span>

                  <div className="flex min-w-0 flex-1 flex-wrap gap-3">
                    <input
                      type="text"
                      value={stage.stage_name}
                      disabled={Boolean(stage.is_locked)}
                      onChange={(e) => updateStage(index, { stage_name: e.target.value })}
                      placeholder="Stage name"
                      className="min-w-[140px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-white/20"
                    />
                    <select
                      value={stage.stage_type}
                      disabled={Boolean(stage.is_locked)}
                      onChange={(e) =>
                        updateStage(index, { stage_type: e.target.value as PipelineStageType })
                      }
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-sm"
                    >
                      {PIPELINE_STAGE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-white/60">
                      SLA
                      <input
                        type="number"
                        min={0}
                        max={365}
                        value={stage.sla_days ?? ""}
                        onChange={(e) =>
                          updateStage(index, {
                            sla_days: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                        className="w-14 rounded border border-[var(--border)] bg-[var(--bg)] px-1 py-1 text-sm"
                      />
                    </label>
                    <label className="flex items-center gap-1 text-xs text-white/60">
                      <input
                        type="checkbox"
                        disabled={Boolean(stage.is_locked)}
                        checked={stage.notify_candidate}
                        onChange={(e) => updateStage(index, { notify_candidate: e.target.checked })}
                      />
                      Notify
                    </label>
                    <StageNotificationEditor
                      stageName={stage.stage_name}
                      notifyCandidate={stage.notify_candidate}
                      message={stage.notify_email_body}
                      onChange={(message) => updateStage(index, { notify_email_body: message })}
                    />
                    <input
                      type="color"
                      value={stage.color?.length === 7 ? stage.color : "#6366f1"}
                      onChange={(e) => updateStage(index, { color: e.target.value })}
                      className="h-9 w-12 cursor-pointer rounded border border-[var(--border)] bg-transparent"
                    />
                    {isInterviewLikeStage(stage.stage_type) && (
                      <div className="flex min-w-[280px] max-w-lg flex-col gap-2 rounded-lg border border-[var(--border)]/80 bg-[var(--bg)]/40 px-3 py-2">
                        <p className="text-xs text-white/50">
                          Used for calendar invites and routing — not for picking a slot (use{" "}
                          <Link
                            href={`/recruit/jobs/${jobId}/interviews`}
                            className="font-medium text-[var(--accent)] hover:underline"
                          >
                            Interviews
                          </Link>
                          ).
                        </p>
                        {ffInterviewIdentityUi ? (
                          <>
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4 shrink-0 text-white/60" />
                              <span className="text-xs font-medium text-white/55">
                                Interviewer (organisation)
                              </span>
                            </div>
                            <input
                              type="search"
                              value={stage.interviewer_picker_query}
                              onChange={(e) =>
                                updateStage(index, { interviewer_picker_query: e.target.value })
                              }
                              placeholder="Filter team members…"
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-white/20"
                            />
                            <select
                              value={stage.interviewer_user_id}
                              onChange={(e) => {
                                const id = e.target.value;
                                updateStage(index, {
                                  interviewer_user_id: id,
                                  interviewer_email: "",
                                  interviewer_name: "",
                                });
                              }}
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-white/20"
                            >
                              <option value="">— Select active profile —</option>
                              {interviewerOptions
                                .filter((p) => {
                                  const q = stage.interviewer_picker_query.trim().toLowerCase();
                                  if (!q) return true;
                                  const blob =
                                    `${p.full_name ?? ""} ${p.email} ${p.role}`.toLowerCase();
                                  return blob.includes(q);
                                })
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {(p.full_name ?? "").trim() || p.email} — {p.email}
                                  </option>
                                ))}
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                updateStage(index, {
                                  interviewer_user_id: "",
                                })
                              }
                              className="text-left text-xs font-medium text-[var(--accent)] hover:underline"
                            >
                              Add external interviewer
                            </button>
                            {!stage.interviewer_user_id && (
                              <div className="flex flex-col gap-2 border-t border-[var(--border)]/60 pt-2">
                                <input
                                  type="email"
                                  value={stage.interviewer_email}
                                  onChange={(e) =>
                                    updateStage(index, { interviewer_email: e.target.value })
                                  }
                                  placeholder="External interviewer email"
                                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-white/20"
                                />
                                <input
                                  type="text"
                                  value={stage.interviewer_name}
                                  onChange={(e) =>
                                    updateStage(index, { interviewer_name: e.target.value })
                                  }
                                  placeholder="External interviewer display name"
                                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-white/20"
                                />
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 shrink-0 text-white/60" />
                            <input
                              type="email"
                              value={stage.interviewer_email}
                              onChange={(e) =>
                                updateStage(index, { interviewer_email: e.target.value })
                              }
                              placeholder="Interviewer email"
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-white/20"
                            />
                          </div>
                        )}
                        <select
                          value={stage.feedback_template_id}
                          onChange={(e) =>
                            updateStage(index, { feedback_template_id: e.target.value })
                          }
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-white/20"
                        >
                          <option value="">Attach feedback template (optional)</option>
                          {(templatesData?.templates ?? []).map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {!stage.is_locked && (
                    <button
                      type="button"
                      onClick={() => void removeStage(index)}
                      className="rounded-lg p-2 text-white/60 hover:bg-red-500/10 hover:text-red-400 transition"
                      aria-label="Remove stage"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
