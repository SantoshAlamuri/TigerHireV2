import { NextRequest } from "next/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  getTenantScopedClient,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { JobService } from "@/lib/services/JobService";
import { callClaude, extractJsonObject } from "@/lib/services/anthropic";

interface BiasIssue {
  category: string;
  severity: "low" | "medium" | "high";
  snippet: string;
  why: string;
  suggestion: string;
}

interface BiasCheckResult {
  summary: string;
  score: number;
  issues: BiasIssue[];
}

const JD_BIAS_SYSTEM_PROMPT = `You are a hiring fairness reviewer.
Review a job description and return ONLY valid JSON:
{
  "summary": "one sentence summary",
  "score": 0-100,
  "issues": [
    {
      "category": "Gendered language|Age bias|Accessibility|Credential inflation|Culture fit bias|Location bias|Other",
      "severity": "low|medium|high",
      "snippet": "exact short snippet from JD",
      "why": "why this may introduce bias",
      "suggestion": "rewrite suggestion in one sentence"
    }
  ]
}
Rules:
- Keep issues practical and concise.
- Return max 8 issues.
- If no issue, return empty issues and score >= 90.`;

function normalizeBiasResult(raw: unknown): BiasCheckResult {
  if (!raw || typeof raw !== "object") {
    return { summary: "No bias analysis was returned.", score: 100, issues: [] };
  }
  const obj = raw as Record<string, unknown>;
  const issuesRaw = Array.isArray(obj.issues) ? obj.issues : [];
  const issues: BiasIssue[] = issuesRaw
    .map((entry) =>
      entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null,
    )
    .filter(Boolean)
    .map((entry) => {
      const sev = String(entry!.severity ?? "low").toLowerCase();
      return {
        category: String(entry!.category ?? "Other").slice(0, 80),
        severity: sev === "high" || sev === "medium" ? sev : "low",
        snippet: String(entry!.snippet ?? "").slice(0, 240),
        why: String(entry!.why ?? "").slice(0, 280),
        suggestion: String(entry!.suggestion ?? "").slice(0, 280),
      } as BiasIssue;
    })
    .slice(0, 8);

  const scoreRaw = Number(obj.score ?? 0);
  const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 0;
  const summary = String(obj.summary ?? "Bias analysis complete.").slice(0, 300);
  return { summary, score, issues };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "recruiter", "leadership", "hiring_manager", "super_admin", "agency")) {
      return jsonError("Forbidden", 403);
    }

    const { id } = await params;
    const db = await getTenantScopedClient(ctx);
    const hasAccess = await db.assertJobAccess(id);
    if (!hasAccess) return jsonError("Job not found", 404);

    const job = await JobService.getById(db.raw, id);
    if (!job) return jsonError("Job not found", 404);

    const jdText = [job.title ?? "", job.description ?? "", ...(job.skills_required ?? [])]
      .join("\n")
      .trim();
    if (!jdText) {
      return jsonError("Job description is empty. Add job details before running bias check.", 400);
    }

    const response = await callClaude({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1400,
      jobId: id,
      organisationId: job.organisation_id ?? undefined,
      temperature: 0,
      system: JD_BIAS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: jdText.slice(0, 9000) }],
      label: "jd-bias-detector",
    });
    const parsed = extractJsonObject(response.text, "jd-bias-detector");
    return jsonSuccess({ result: normalizeBiasResult(parsed) });
  } catch (err) {
    return handleApiError(err, "Failed to run JD bias check", {
      route: "GET /api/jobs/[id]/bias",
    });
  }
}
