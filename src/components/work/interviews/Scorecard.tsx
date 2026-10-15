"use client";

import { useId, useState } from "react";
import { useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import {
  EMPTY_SCORECARD,
  RECOMMENDATIONS,
  applyDraft,
  feedbackBody,
  scaleFor,
  scorecardGaps,
  type ScorecardDraft,
  type ScorecardFieldLite,
  type ScorecardForm,
} from "@/lib/work/interviews";
import { postJson } from "./post-json";
import s from "./interviews.module.css";

interface Template {
  id: string;
  name: string;
  fields: ScorecardFieldLite[];
}

function ScaleChoice({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={s.slots}>
      {options.map((o, i) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === i + 1}
          className={s.slot}
          onClick={() => onChange(i + 1)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/**
 * File a scorecard here, under your name, through POST /api/jobs/[id]/feedback.
 * The agent can draft the answers from the interview recording
 * (feedback/scorecard-draft); the verdict is always yours.
 */
export function Scorecard({
  jobId,
  pipelineCandidateId,
  candidateName,
  stageTemplateId,
  onFiled,
  onAgent,
}: {
  jobId: string;
  pipelineCandidateId: string;
  candidateName: string;
  stageTemplateId: string | null;
  onFiled: () => void | Promise<void>;
  onAgent: (what: string) => void;
}) {
  const templates = useApiQuery<{ templates: Template[] }>(`/api/jobs/${jobId}/feedback-templates`);
  const submit = useApiMutation<ReturnType<typeof feedbackBody>, { feedback: unknown }>(
    `/api/jobs/${jobId}/feedback`,
    "POST",
  );
  const [picked, setPicked] = useState<string | null>(null);
  const [form, setForm] = useState<ScorecardForm>(EMPTY_SCORECARD);
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [drafting, setDrafting] = useState(false);
  const [draftNote, setDraftNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [tried, setTried] = useState(false);
  const ids = useId();

  const list = templates.data?.templates ?? [];
  const template =
    list.find((t) => t.id === picked) ??
    list.find((t) => t.id === stageTemplateId) ??
    list[0] ??
    null;
  const fields = Array.isArray(template?.fields) ? template.fields : [];
  const gaps = scorecardGaps(fields, form);

  async function draft() {
    if (!template) return;
    setDrafting(true);
    setDraftNote(null);
    const res = await postJson<{ draft?: ScorecardDraft }>(
      `/api/jobs/${jobId}/feedback/scorecard-draft`,
      { template_id: template.id, pipeline_candidate_id: pipelineCandidateId },
    );
    setDrafting(false);
    if (!res.ok || !res.data.draft) {
      setDraftNote({ ok: false, text: res.ok ? "The agent returned no draft." : res.error });
      return;
    }
    const next = applyDraft(form, res.data.draft);
    setForm(next.form);
    setEvidence(next.evidence);
    onAgent(`Drafted a scorecard for ${candidateName} from the recording`);
    setDraftNote({
      ok: true,
      text: "Answers drafted from the recording, each with the line it came from. Check them, then set the rating and recommendation yourself.",
    });
  }

  async function file() {
    setTried(true);
    if (!template || gaps.length) return;
    const ok = await submit.mutate(feedbackBody(template.id, pipelineCandidateId, form));
    if (ok) await onFiled();
  }

  if (templates.loading && !templates.data) {
    return (
      <div className={s.drawer}>
        <p className="wd-muted wd-small" role="status">
          Loading the scorecard…
        </p>
      </div>
    );
  }
  if (templates.error || !template) {
    return (
      <div className={s.drawer}>
        <p role="alert" className="wd-problem">
          {templates.error
            ? `The scorecard could not be loaded: ${templates.error}`
            : "This job has no scorecard yet."}{" "}
          Reload to try again.
        </p>
      </div>
    );
  }

  const setResponse = (label: string, v: string | number) =>
    setForm((f) => ({ ...f, responses: { ...f.responses, [label]: v } }));

  return (
    <form
      className={`${s.drawer} ${s.drawerYou}`}
      aria-label={`Scorecard for ${candidateName}`}
      onSubmit={(e) => {
        e.preventDefault();
        void file();
      }}
    >
      <div className="wd-row-actions" style={{ justifyContent: "space-between" }}>
        <span className="wd-sig you">Your scorecard for {candidateName}</span>
        {list.length > 1 && (
          <label className="wd-small wd-muted" style={{ display: "flex", gap: 8 }}>
            Scorecard
            <select
              className={s.select}
              value={template.id}
              onChange={(e) => {
                setPicked(e.target.value);
                setForm(EMPTY_SCORECARD);
                setEvidence({});
              }}
            >
              {list.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="wd-row-actions">
        <button type="button" className="wd-btn" disabled={drafting} onClick={() => void draft()}>
          {drafting ? "The agent is reading the recording…" : "Ask the agent to draft it"}
        </button>
        <span className="wd-sig agent">Uses the interview recording, if there is one</span>
      </div>
      {draftNote && (
        <p
          role={draftNote.ok ? "status" : "alert"}
          className={draftNote.ok ? s.notice : "wd-problem"}
        >
          {draftNote.text}
        </p>
      )}

      {fields.map((f, i) => {
        const scale = scaleFor(f);
        const fid = `${ids}-f${i}`;
        const hint = f.guidance ?? (f.type === "select" ? undefined : f.description);
        const value = form.responses[f.label];
        const missing = tried && gaps.includes(f.label);
        return (
          <div key={`${f.label}-${i}`} className={s.fieldGroup}>
            {scale ? (
              <span className={s.fieldLabel}>
                {f.label}
                {f.required && <span className={s.required}>*</span>}
              </span>
            ) : (
              <label htmlFor={fid} className={s.fieldLabel}>
                {f.label}
                {f.required && <span className={s.required}>*</span>}
              </label>
            )}
            {hint && <p className={s.fieldHint}>{hint}</p>}
            {scale ? (
              <ScaleChoice
                label={f.label}
                options={scale}
                value={typeof value === "number" ? value : Number(value) || 0}
                onChange={(v) => setResponse(f.label, v)}
              />
            ) : f.type === "select" ? (
              <select
                id={fid}
                className={s.select}
                value={String(value ?? "")}
                onChange={(e) => setResponse(f.label, e.target.value)}
              >
                <option value="">Choose one</option>
                {(f.options?.length
                  ? f.options
                  : (f.description ?? "")
                      .split(",")
                      .map((o) => o.trim())
                      .filter(Boolean)
                ).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <textarea
                id={fid}
                className="wd-textarea"
                style={{ minHeight: 90, fontSize: 16 }}
                value={String(value ?? "")}
                onChange={(e) => setResponse(f.label, e.target.value)}
              />
            )}
            {evidence[f.label] && (
              <p className={s.evidence}>
                <span>From the recording</span>&ldquo;{evidence[f.label]}&rdquo;
              </p>
            )}
            {missing && <p className="wd-problem">Answer this to file the scorecard.</p>}
          </div>
        );
      })}

      <div className={s.fieldGroup}>
        <span className={s.fieldLabel}>
          Overall rating
          {form.recommendation !== "cannot_assess" && <span className={s.required}>*</span>}
        </span>
        <ScaleChoice
          label="Overall rating, 1 to 5"
          options={["1", "2", "3", "4", "5"]}
          value={form.overallRating}
          onChange={(v) => setForm((f) => ({ ...f, overallRating: v }))}
        />
        {tried && gaps.includes("Overall rating") && (
          <p className="wd-problem">Give an overall rating from 1 to 5.</p>
        )}
      </div>

      <div className={s.fieldGroup}>
        <span className={s.fieldLabel}>
          Recommendation<span className={s.required}>*</span>
        </span>
        <div role="radiogroup" aria-label="Recommendation" className={s.slots}>
          {RECOMMENDATIONS.map((r) => (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={form.recommendation === r.value}
              className={s.slot}
              onClick={() => setForm((f) => ({ ...f, recommendation: r.value }))}
            >
              {r.label}
            </button>
          ))}
        </div>
        {tried && gaps.includes("Recommendation") && (
          <p className="wd-problem">Choose a recommendation.</p>
        )}
      </div>

      <label className={s.fieldGroup}>
        <span className={s.fieldLabel}>Notes</span>
        <textarea
          className="wd-textarea"
          style={{ minHeight: 90, fontSize: 16 }}
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
      </label>

      {submit.error && (
        <p role="alert" className="wd-problem">
          {submit.error}
        </p>
      )}
      <div className="wd-row-actions">
        <button type="submit" className="wd-btn go" disabled={submit.loading}>
          {submit.loading ? "Filing…" : "File the scorecard"}
        </button>
        {tried && gaps.length > 0 && (
          <span className="wd-small" style={{ color: "var(--wd-amber)" }}>
            Still needed: {gaps.join(", ")}
          </span>
        )}
      </div>
    </form>
  );
}
