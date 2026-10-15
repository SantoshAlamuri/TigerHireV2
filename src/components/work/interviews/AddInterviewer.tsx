"use client";

import { useState } from "react";
import { useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import { isEmail, stageWithInterviewer, type StageRow } from "@/lib/work/interviews";
import s from "./interviews.module.css";

interface ProfileOption {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
}

/**
 * "Add an interviewer for Technical round" — asked at the moment it matters.
 * Someone on your team, or an outside interviewer by name and email; saved on
 * the round through /api/jobs/[id]/pipeline-stages.
 */
export function AddInterviewer({
  jobId,
  stage,
  onSaved,
}: {
  jobId: string;
  stage: StageRow;
  onSaved: (who: string) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<"team" | "outside">("team");
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const people = useApiQuery<{ profiles: ProfileOption[] }>(
    `/api/jobs/${jobId}/interviewer-profile-options`,
  );
  const save = useApiMutation<ReturnType<typeof stageWithInterviewer>, unknown>(
    `/api/jobs/${jobId}/pipeline-stages`,
    "POST",
  );
  const profiles = people.data?.profiles ?? [];
  const canSave = mode === "team" ? Boolean(userId) : name.trim().length > 0 && isEmail(email);

  async function submit() {
    const body =
      mode === "team"
        ? stageWithInterviewer(stage, { userId })
        : stageWithInterviewer(stage, { name, email });
    const ok = await save.mutate(body);
    if (ok) {
      const p = profiles.find((x) => x.id === userId);
      await onSaved(mode === "team" ? (p?.full_name ?? p?.email ?? "Interviewer") : name.trim());
    }
  }

  return (
    <form
      className={`${s.drawer} ${s.drawerYou}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) void submit();
      }}
    >
      <span className="wd-sig you">Add an interviewer for {stage.stage_name}</span>
      <p className={s.fieldHint}>
        They get the calendar invite for every interview in this round, and the scorecard reminder
        after it.
      </p>
      <div className={s.tabs} role="group" aria-label="Who runs it">
        <button
          type="button"
          className="wd-btn quiet"
          aria-pressed={mode === "team"}
          style={mode === "team" ? { color: "var(--wd-ink)" } : undefined}
          onClick={() => setMode("team")}
        >
          Someone on your team
        </button>
        <button
          type="button"
          className="wd-btn quiet"
          aria-pressed={mode === "outside"}
          style={mode === "outside" ? { color: "var(--wd-ink)" } : undefined}
          onClick={() => setMode("outside")}
        >
          Someone outside
        </button>
      </div>

      {mode === "team" ? (
        people.loading && !people.data ? (
          <p className="wd-muted wd-small" role="status">
            Loading your team…
          </p>
        ) : people.error ? (
          <p role="alert" className="wd-problem">
            Could not load your team ({people.error}). Add someone outside by email instead.
          </p>
        ) : (
          <label className={s.fieldGroup}>
            <span className={s.fieldHint}>Interviewer</span>
            <select className={s.select} value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Choose a person</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name?.trim() || p.email || "Unnamed"}
                  {p.email && p.full_name ? ` (${p.email})` : ""}
                </option>
              ))}
            </select>
          </label>
        )
      ) : (
        <div className={s.twoCols}>
          <label className={s.fieldGroup}>
            <span className={s.fieldHint}>Name</span>
            <input
              className="wd-input"
              value={name}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className={s.fieldGroup}>
            <span className={s.fieldHint}>Email</span>
            <input
              className="wd-input"
              type="email"
              value={email}
              autoComplete="off"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        </div>
      )}

      {save.error && (
        <p role="alert" className="wd-problem">
          {save.error}
        </p>
      )}
      <div className="wd-row-actions">
        <button type="submit" className="wd-btn go" disabled={!canSave || save.loading}>
          {save.loading ? "Saving…" : `Save interviewer for ${stage.stage_name}`}
        </button>
      </div>
    </form>
  );
}
