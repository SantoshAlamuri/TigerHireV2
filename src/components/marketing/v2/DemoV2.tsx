"use client";

import { useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import type { DemoRubric } from "@/lib/agents/demo-rubric";
import type { DemoScoredCandidate } from "@/lib/agents/demo-score";
import { SAMPLE_JD, FALLBACK_RUBRIC, FALLBACK_SCORED } from "./demo-data";
import DemoResults from "./DemoResults";
import DemoOtpGate from "./DemoOtpGate";
import styles from "@/app/(public)/v2/v2.module.css";

type Phase = "idle" | "buildingRubric" | "rubricReady" | "scoring" | "scored";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Request failed");
  return data as T;
}

/**
 * Live homepage demo: JD → rubric (real Sonnet call) → pool scored with real
 * Haiku calls — either up to 10 uploaded CVs or the 10-profile fictional
 * sample pool. Sample-pool failures fall back to canned output with a visible
 * "sample output" badge; upload failures surface actionable errors instead.
 */
const MAX_UPLOAD_FILES = 10;

export default function DemoV2() {
  const [jd, setJd] = useState(SAMPLE_JD);
  const [phase, setPhase] = useState<Phase>("idle");
  const [rubric, setRubric] = useState<DemoRubric | null>(null);
  const [candidates, setCandidates] = useState<DemoScoredCandidate[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [demoToken, setDemoToken] = useState("");
  const [isSample, setIsSample] = useState(false);
  const [notice, setNotice] = useState("");

  async function buildRubric() {
    setPhase("buildingRubric");
    setNotice("");
    try {
      const data = await postJson<{ rubric: DemoRubric }>("/api/public/demo/rubric", { jd });
      setRubric(data.rubric);
      setIsSample(false);
    } catch (err) {
      setRubric(FALLBACK_RUBRIC);
      setIsSample(true);
      setNotice(err instanceof Error ? err.message : "Showing sample output.");
    }
    setPhase("rubricReady");
  }

  async function scorePool() {
    if (!rubric) return;
    setPhase("scoring");
    setNotice("");
    try {
      let data: { candidates: DemoScoredCandidate[] };
      if (files.length > 0) {
        const formData = new FormData();
        formData.append("rubric", JSON.stringify(rubric));
        files.forEach((file) => formData.append("files", file));
        const res = await fetch("/api/public/demo/score", {
          method: "POST",
          headers: { "x-demo-token": demoToken },
          body: formData,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((json as { error?: string })?.error ?? "Request failed");
        data = json as { candidates: DemoScoredCandidate[] };
      } else {
        data = await postJson<{ candidates: DemoScoredCandidate[] }>("/api/public/demo/score", {
          rubric,
        });
      }
      setCandidates(data.candidates);
      setPhase("scored");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Showing sample output.";
      if (files.length > 0) {
        // Upload problems (bad file, scanned image) are actionable — surface
        // them instead of silently swapping in canned data.
        setNotice(message);
        setPhase("rubricReady");
        return;
      }
      setCandidates(FALLBACK_SCORED);
      setIsSample(true);
      setNotice(message);
      setPhase("scored");
    }
  }

  const busy = phase === "buildingRubric" || phase === "scoring";

  return (
    <div className={styles.demoShell}>
      <div className={styles.demoBar}>
        <span>
          tigerhire · live demo ·{" "}
          {files.length > 0
            ? `${files.length} uploaded CV${files.length > 1 ? "s" : ""}`
            : "10-profile sample pool"}
        </span>
        {isSample && (
          <span className="ml-auto rounded-full border border-[var(--border-interactive)] px-2.5 py-0.5 text-[10.5px] uppercase tracking-[0.08em] text-[var(--warn,#fbbf24)]">
            sample output
          </span>
        )}
      </div>
      <div className={styles.demoBody}>
        <div className={styles.demoLeft}>
          <label
            htmlFor="demo-jd"
            className={`${styles.mono} text-[11.5px] uppercase tracking-[0.1em] text-[var(--text-subtle)]`}
          >
            Step 1 — paste any job description
          </label>
          <textarea
            id="demo-jd"
            className={styles.demoTextarea}
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            maxLength={6000}
            spellCheck={false}
          />
          <button
            type="button"
            onClick={buildRubric}
            disabled={busy}
            className={buttonClasses(phase === "idle" ? "primary" : "secondary", "md")}
          >
            {phase === "buildingRubric" ? "Drafting rubric…" : "Build the rubric →"}
          </button>
          <div>
            <label
              htmlFor="demo-files"
              className={`${styles.mono} text-[11.5px] uppercase tracking-[0.1em] text-[var(--text-subtle)]`}
            >
              Step 2 (optional) — add your own CVs, up to {MAX_UPLOAD_FILES}
            </label>
            <input
              id="demo-files"
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.txt"
              className="mt-2 block w-full text-[13px] text-[var(--text-subtle)] file:mr-3 file:rounded-lg file:border file:border-[var(--border-interactive)] file:bg-white/[0.04] file:px-3 file:py-1.5 file:text-[13px] file:font-semibold file:text-[var(--text)]"
              onChange={(e) => {
                const chosen = Array.from(e.target.files ?? []).slice(0, MAX_UPLOAD_FILES);
                setFiles(chosen);
                setNotice(
                  (e.target.files?.length ?? 0) > MAX_UPLOAD_FILES
                    ? `The demo scores at most ${MAX_UPLOAD_FILES} CVs — keeping the first ${MAX_UPLOAD_FILES}.`
                    : "",
                );
              }}
            />
            <p className="mt-1.5 text-[12px] text-[var(--text-subtle)]">
              PDF, DOCX or TXT · 2 MB each · processed in memory, deleted after scoring, never used
              to train models. Leave empty to use our 10 fictional sample profiles.
            </p>
          </div>
          {files.length > 0 && !demoToken && <DemoOtpGate onVerified={setDemoToken} />}
          <button
            type="button"
            onClick={scorePool}
            disabled={busy || !rubric || (files.length > 0 && !demoToken)}
            className={buttonClasses(rubric && phase !== "scored" ? "primary" : "secondary", "md")}
          >
            {phase === "scoring"
              ? "Scoring…"
              : files.length > 0
                ? `Score ${files.length} uploaded CV${files.length > 1 ? "s" : ""} →`
                : "Score 10 sample CVs →"}
          </button>
          {notice && <p className="text-[13px] text-[var(--text-subtle)]">{notice}</p>}
        </div>

        <div className={styles.demoRight}>
          {phase === "idle" && (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border-interactive)] p-6 text-center text-[15px] text-[var(--text-subtle)]">
              <span className={`${styles.mono} text-xs uppercase tracking-[0.1em]`}>Output</span>
              <span>
                The rubric and scored candidates appear here.
                <br />
                Start with &ldquo;Build the rubric&rdquo;.
              </span>
            </div>
          )}

          {phase === "buildingRubric" && (
            <p className={`${styles.mono} text-[13px] text-[var(--text-muted)]`}>
              The agent is reading the JD…
            </p>
          )}

          {(phase === "rubricReady" || phase === "scoring") && rubric && (
            <div>
              <p
                className={`${styles.mono} text-[11.5px] uppercase tracking-[0.1em] text-[var(--text-subtle)]`}
              >
                The weighted rubric · {rubric.roleTitle}
              </p>
              <div className="mt-3.5">
                {rubric.criteria.map((criterion) => (
                  <div key={criterion.name} className={styles.rubricRow}>
                    <span className="text-[14.5px] font-semibold">{criterion.name}</span>
                    <span className={styles.rubricWeight}>{criterion.weight}%</span>
                    <span className={styles.meter}>
                      <span
                        className={styles.meterFill}
                        style={{ width: `${Math.min(100, criterion.weight * 4)}%` }}
                      />
                    </span>
                  </div>
                ))}
              </div>
              <div className={styles.approvedNote}>
                ✓&nbsp;&nbsp;In the product, this is approved before anyone is scored — the bar
                can&apos;t move mid-search.
              </div>
              {phase === "scoring" && (
                <p className={`${styles.mono} mt-4 text-[13px] text-[var(--text-muted)]`}>
                  Scoring the sample pool against the approved rubric…
                </p>
              )}
            </div>
          )}

          {phase === "scored" && <DemoResults candidates={candidates} />}
        </div>
      </div>
    </div>
  );
}
