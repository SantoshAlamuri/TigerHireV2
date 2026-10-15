"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AssessmentInstructionRichHtml } from "@/components/dashboard/AssessmentInstructionRichHtml";

interface SharedAssessment {
  id: string;
  title: string;
  instructions: string | null;
  type: string;
  status: "pending" | "submitted" | "scored" | "expired";
  deadline_at: string;
  submission_text: string | null;
  submission_url: string | null;
}

export default function PublicAssessmentPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [assessment, setAssessment] = useState<SharedAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [submissionText, setSubmissionText] = useState("");
  const [submissionUrl, setSubmissionUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      const response = await fetch(`/api/assessments/share/${token}`, { credentials: "include" });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        assessment?: SharedAssessment;
      };
      if (!response.ok || !payload.assessment) {
        setNotice(payload.error ?? "Assessment not found");
        setLoading(false);
        return;
      }
      setAssessment(payload.assessment);
      setLoading(false);
    })();
  }, [token]);

  async function handleSubmit() {
    setSubmitting(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/assessments/share/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionText: submissionText.trim() || undefined,
          submissionUrl: submissionUrl.trim() || undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setNotice(payload.error ?? "Failed to submit");
        return;
      }
      setNotice("Assessment submitted successfully.");
      setAssessment((prev) => (prev ? { ...prev, status: "submitted" } : prev));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-sm text-[var(--text-muted)]">Loading assessment...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-12">
      {notice ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-muted)]">
          {notice}
        </p>
      ) : null}
      {assessment ? (
        <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/70 p-5">
          <h1 className="text-xl font-semibold text-[var(--text)]">{assessment.title}</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {assessment.type} - due {new Date(assessment.deadline_at).toLocaleString()}
          </p>
          {assessment.instructions ? (
            <AssessmentInstructionRichHtml
              html={assessment.instructions}
              className="text-sm text-[var(--text)]"
            />
          ) : null}

          {assessment.status === "pending" ? (
            <div className="space-y-2">
              <textarea
                rows={6}
                placeholder="Write your submission"
                value={submissionText}
                onChange={(event) => setSubmissionText(event.target.value)}
                className="w-full rounded-lg border border-[var(--border-interactive)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
              />
              <input
                type="url"
                placeholder="Submission URL (optional)"
                value={submissionUrl}
                onChange={(event) => setSubmissionUrl(event.target.value)}
                className="w-full rounded-lg border border-[var(--border-interactive)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
              />
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit assessment"}
              </button>
            </div>
          ) : (
            <p className="text-sm text-emerald-300">
              This assessment is already {assessment.status}. Thanks for your submission.
            </p>
          )}
        </section>
      ) : null}
    </main>
  );
}
