"use client";

import { useMemo, useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import {
  PLAN_STAGE_FORMATS,
  PLAN_STAGE_TYPES,
  type PlanStageFormat,
  type PlanStageRow,
  type PlanStageType,
} from "@/lib/recruitment-plan/types";
import {
  getPlanStageConfigProfile,
  type StageConfigField,
} from "@/lib/recruitment-plan/plan-stage-config-profile";

type InterviewerOption = {
  id: string;
  full_name: string | null;
  email: string;
};

type TemplateOption = { id: string; name: string };

function showField(fields: StageConfigField[], key: StageConfigField): boolean {
  return fields.includes(key);
}

export function PlanStageEditPanel({
  stage,
  jobId,
  allStages,
  interviewerOptions,
  templateOptions,
  onSaved,
  onCancel,
}: {
  stage: PlanStageRow;
  jobId: string;
  allStages: PlanStageRow[];
  interviewerOptions: InterviewerOption[];
  templateOptions: TemplateOption[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [displayName, setDisplayName] = useState(stage.display_name);
  const [stageType, setStageType] = useState<PlanStageType>(stage.stage_type);
  const [primaryInterviewerId, setPrimaryInterviewerId] = useState(
    stage.primary_interviewer_id ?? "",
  );
  const [backupInterviewerId, setBackupInterviewerId] = useState(stage.backup_interviewer_id ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    stage.duration_minutes ? String(stage.duration_minutes) : "",
  );
  const [format, setFormat] = useState<PlanStageFormat | "">(stage.format ?? "");
  const [scorecardTemplateId, setScorecardTemplateId] = useState(stage.scorecard_template_id ?? "");
  const [commsTemplateId, setCommsTemplateId] = useState(
    stage.comms_template_id ?? stage.comms_template ?? "",
  );
  const [targetDwellDays, setTargetDwellDays] = useState(String(stage.target_dwell_days));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profile = useMemo(() => getPlanStageConfigProfile(stageType), [stageType]);
  const fields = profile.fields;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updatedRow = {
        id: stage.id,
        stage_order: stage.stage_order,
        stage_type: stageType,
        display_name: displayName.trim(),
        primary_interviewer_id: showField(fields, "primary_interviewer")
          ? primaryInterviewerId || null
          : null,
        backup_interviewer_id: showField(fields, "backup_interviewer")
          ? backupInterviewerId || null
          : null,
        duration_minutes:
          showField(fields, "duration_minutes") && durationMinutes ? Number(durationMinutes) : null,
        format: showField(fields, "format") && format ? format : null,
        scorecard_template_id: showField(fields, "scorecard_template")
          ? scorecardTemplateId || null
          : null,
        comms_template_id: showField(fields, "comms_template")
          ? commsTemplateId.trim() || null
          : null,
        // approval_gate is enforced on pipeline move (see check-plan-approval-gate); not editable here.
        approval_gate: stage.approval_gate,
        target_dwell_days: Number(targetDwellDays) || 5,
        is_active: true,
      };
      const stagesPayload = allStages.map((s) =>
        s.id === stage.id
          ? updatedRow
          : {
              id: s.id,
              stage_order: s.stage_order,
              stage_type: s.stage_type,
              display_name: s.display_name,
              primary_interviewer_id: s.primary_interviewer_id,
              backup_interviewer_id: s.backup_interviewer_id,
              duration_minutes: s.duration_minutes,
              format: s.format,
              scorecard_template_id: s.scorecard_template_id,
              comms_template_id: s.comms_template_id,
              approval_gate: s.approval_gate,
              target_dwell_days: s.target_dwell_days,
              is_active: s.is_active,
            },
      );
      const res = await fetch(`/api/jobs/${jobId}/recruitment-plan/stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ stages: stagesPayload }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "Failed to save stage");
        return;
      }
      onSaved();
    } catch {
      setError("Network error while saving");
    } finally {
      setSaving(false);
    }
  }

  const fieldClass =
    "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]";

  return (
    <div className="mt-4 rounded-lg border border-[var(--accent)]/25 bg-[var(--surface)]/90 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
        One-time setup · {profile.typeLabel}
      </p>
      <p className="mt-1 text-sm text-white/70">{profile.oneTimeHint}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {showField(fields, "display_name") ? (
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-white/60">
              Stage name <span className="text-red-400">*</span>
            </span>
            <input
              className={fieldClass}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Technical interview"
            />
          </label>
        ) : null}

        {showField(fields, "stage_type") ? (
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-white/60">Step type</span>
            <select
              className={fieldClass}
              value={stageType}
              onChange={(e) => setStageType(e.target.value as PlanStageType)}
            >
              {PLAN_STAGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {getPlanStageConfigProfile(t).typeLabel}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-white/45">
              Changing type updates which fields apply to this round only.
            </p>
          </label>
        ) : null}

        {showField(fields, "target_dwell_days") ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-white/60">
              Target time in stage (days)
            </span>
            <input
              type="number"
              min={0}
              max={365}
              className={fieldClass}
              value={targetDwellDays}
              onChange={(e) => setTargetDwellDays(e.target.value)}
            />
          </label>
        ) : null}

        {showField(fields, "primary_interviewer") ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-white/60">
              Primary interviewer <span className="text-red-400">*</span>
            </span>
            <select
              className={fieldClass}
              value={primaryInterviewerId}
              onChange={(e) => setPrimaryInterviewerId(e.target.value)}
            >
              <option value="">— Select —</option>
              {interviewerOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? p.email}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {showField(fields, "backup_interviewer") ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-white/60">Backup interviewer</span>
            <select
              className={fieldClass}
              value={backupInterviewerId}
              onChange={(e) => setBackupInterviewerId(e.target.value)}
            >
              <option value="">— Optional —</option>
              {interviewerOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? p.email}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {showField(fields, "duration_minutes") ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-white/60">
              Duration (minutes) <span className="text-red-400">*</span>
            </span>
            <select
              className={fieldClass}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            >
              <option value="">— Select —</option>
              {[15, 30, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {showField(fields, "format") ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-white/60">
              Format <span className="text-red-400">*</span>
            </span>
            <select
              className={fieldClass}
              value={format}
              onChange={(e) => setFormat(e.target.value as PlanStageFormat | "")}
            >
              <option value="">— Select —</option>
              {PLAN_STAGE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {showField(fields, "scorecard_template") ? (
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-white/60">
              Scorecard template
              {stageType === "interview" || stageType === "assessment" ? (
                <span className="text-red-400"> *</span>
              ) : null}
            </span>
            <select
              className={fieldClass}
              value={scorecardTemplateId}
              onChange={(e) => setScorecardTemplateId(e.target.value)}
            >
              <option value="">— None —</option>
              {templateOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {showField(fields, "comms_template") ? (
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-white/60">
              Candidate invite template
              {stageType === "phone_screen" ? <span className="text-red-400"> *</span> : null}
            </span>
            <input
              className={fieldClass}
              value={commsTemplateId}
              onChange={(e) => setCommsTemplateId(e.target.value)}
              placeholder="e.g. th_interview_slot_picker"
            />
            <p className="mt-1 text-xs text-white/45">
              WhatsApp or email template used when inviting candidates into this step.
            </p>
          </label>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !displayName.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save setup for this stage
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-sm text-white/70"
        >
          <X className="h-4 w-4" />
          Cancel
        </button>
      </div>
    </div>
  );
}
