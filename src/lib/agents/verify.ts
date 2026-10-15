import { callClaude, extractJsonArray, extractJsonObject } from "@/lib/services/anthropic";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchAttributionFromLatestApplication } from "@/lib/costs/candidate-application-attribution";
import { recalculateTrustScore } from "./trust-score";
import { VerifyResultSchema } from "@/lib/agents/schemas";
import { isEnabled } from "@/lib/feature-flags";
import { logAgentRun } from "@/lib/observability/metrics";
import { logger } from "@/lib/observability/logger";
import { env } from "@/lib/config/env";

type VerifyInvokeReason =
  | "disabled"
  | "candidate_not_found"
  | "no_cv_text"
  | "budget_exceeded"
  | "completed"
  | "error";

function logVerifyInvokedMetric(params: {
  candidateId: string;
  success: boolean;
  reason: VerifyInvokeReason;
  claudeCalls: number;
  claudeTokens: number;
}): void {
  logger.info("metric.verify_invoked", {
    candidate_id: params.candidateId,
    success: params.success,
    reason: params.reason,
    claude_calls: params.claudeCalls,
    claude_tokens: params.claudeTokens,
  });
}

/**
 * Verify Agent — background checks: work history from CV, timeline consistency.
 * Writes verification_claims and then recalculates trust score.
 */
export async function triggerVerifyAgent(candidateId: string): Promise<void> {
  const start = Date.now();
  const supabase = createSupabaseAdmin();
  let claudeCalls = 0;
  let claudeTokens = 0;

  try {
    const { data: candidate, error: candError } = await supabase
      .from("candidates")
      .select("id, cv_raw_text, linkedin_url, github_url")
      .eq("id", candidateId)
      .single();

    if (candError || !candidate) {
      logVerifyInvokedMetric({
        candidateId,
        success: false,
        reason: "candidate_not_found",
        claudeCalls,
        claudeTokens,
      });
      return;
    }

    const appAttribution = await fetchAttributionFromLatestApplication(supabase, candidateId);
    const runtimeOrganisationId = appAttribution.organisationId ?? null;
    const llmAttribution = {
      organisationId: appAttribution.organisationId,
      jobId: appAttribution.jobId,
      candidateId,
    };

    if (!(await isEnabled("verify_agent", runtimeOrganisationId))) {
      logger.warn("Verify agent disabled via feature flag");
      logVerifyInvokedMetric({
        candidateId,
        success: false,
        reason: "disabled",
        claudeCalls,
        claudeTokens,
      });
      return;
    }

    const claims: Array<{
      candidate_id: string;
      claim_type: string;
      claim_text: string;
      status: string;
      evidence: string;
      source: string;
    }> = [];

    if (!candidate.cv_raw_text) {
      logVerifyInvokedMetric({
        candidateId,
        success: false,
        reason: "no_cv_text",
        claudeCalls,
        claudeTokens,
      });
      return;
    }

    const maxCalls = env.verifyMaxClaudeCallsPerCandidate;
    const maxTokens = env.verifyMaxClaudeTokensPerCandidate;
    if (maxCalls <= 0 || maxTokens <= 0) {
      logVerifyInvokedMetric({
        candidateId,
        success: false,
        reason: "budget_exceeded",
        claudeCalls,
        claudeTokens,
      });
      return;
    }

    const workHistoryResult = await extractWorkHistoryWithClaude(
      candidate.cv_raw_text,
      llmAttribution,
    );
    claudeCalls += workHistoryResult.called ? 1 : 0;
    claudeTokens += workHistoryResult.tokens;
    const workHistory = workHistoryResult.jobs;

    if (claudeCalls >= maxCalls || claudeTokens >= maxTokens) {
      logger.warn("Verify agent budget exhausted after work history call", {
        candidate_id: candidateId,
        claude_calls: claudeCalls,
        claude_tokens: claudeTokens,
      });
      if (workHistory.length > 0) {
        for (const job of workHistory) {
          claims.push({
            candidate_id: candidateId,
            claim_type: "employment",
            claim_text: `${job.title} at ${job.company} (${job.start_date}–${job.end_date})`,
            status: "unverified",
            evidence: "Extracted from CV — verify timeline check skipped due to budget",
            source: "cv",
          });
        }
      }
      if (claims.length > 0) {
        await supabase.from("verification_claims").insert(claims);
      }
      await recalculateTrustScore(candidateId);
      await logAgentRun(
        supabase,
        "verify",
        "scout_trigger",
        candidateId,
        "success",
        Date.now() - start,
      );
      logVerifyInvokedMetric({
        candidateId,
        success: false,
        reason: "budget_exceeded",
        claudeCalls,
        claudeTokens,
      });
      return;
    }

    const timelineCheckResult = await checkTimelineConsistency(
      candidate.cv_raw_text,
      llmAttribution,
    );
    claudeCalls += timelineCheckResult.called ? 1 : 0;
    claudeTokens += timelineCheckResult.tokens;
    const timelineCheck = {
      consistent: timelineCheckResult.consistent,
      issues: timelineCheckResult.issues,
    };

    if (workHistory.length > 0) {
      const hasTimelineIssues =
        !timelineCheck.consistent && (timelineCheck.issues?.length ?? 0) > 0;
      for (const job of workHistory) {
        claims.push({
          candidate_id: candidateId,
          claim_type: "employment",
          claim_text: `${job.title} at ${job.company} (${job.start_date}–${job.end_date})`,
          status: hasTimelineIssues ? "unverified" : "confirmed",
          evidence: hasTimelineIssues
            ? "Extracted from CV — timeline inconsistencies detected"
            : "Extracted from CV — timeline consistent",
          source: "cv",
        });
      }
    }
    if (claudeCalls > maxCalls || claudeTokens > maxTokens) {
      logger.warn("Verify agent budget exceeded", {
        candidate_id: candidateId,
        claude_calls: claudeCalls,
        claude_tokens: claudeTokens,
      });
    }
    if (claims.length > 0) {
      await supabase.from("verification_claims").insert(
        claims.map(({ candidate_id, claim_type, claim_text, status, evidence, source }) => ({
          candidate_id,
          claim_type,
          claim_text,
          status,
          evidence,
          source,
        })),
      );
    }

    await recalculateTrustScore(candidateId);

    await logAgentRun(
      supabase,
      "verify",
      "scout_trigger",
      candidateId,
      "success",
      Date.now() - start,
    );
    logVerifyInvokedMetric({
      candidateId,
      success: true,
      reason: "completed",
      claudeCalls,
      claudeTokens,
    });
    logger.info("Verify agent completed", { candidate_id: candidateId });
  } catch (error) {
    logger.warn("Verify agent failed", { candidate_id: candidateId, error: String(error) });
    logVerifyInvokedMetric({
      candidateId,
      success: false,
      reason: "error",
      claudeCalls,
      claudeTokens,
    });
  }
}

type VerifyLlmAttribution = {
  organisationId?: string;
  jobId?: string;
  candidateId?: string;
};

async function extractWorkHistoryWithClaude(
  cvText: string,
  attribution?: VerifyLlmAttribution,
): Promise<{
  jobs: Array<{
    company: string;
    title: string;
    start_date: string;
    end_date: string;
  }>;
  tokens: number;
  called: boolean;
}> {
  try {
    const response = await callClaude({
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `From this CV text, extract work history as JSON array: [{"company":"","title":"","start_date":"YYYY-MM","end_date":"YYYY-MM or present"}]. Only jobs. No other text.\n\n${cvText.slice(0, 15000)}`,
        },
      ],
      label: "verify-work-history",
      organisationId: attribution?.organisationId,
      jobId: attribution?.jobId,
      candidateId: attribution?.candidateId,
    });
    const arr = extractJsonArray(response.text, "Verify work history");
    return {
      jobs: arr as Array<{
        company: string;
        title: string;
        start_date: string;
        end_date: string;
      }>,
      tokens: response.usage.input_tokens + response.usage.output_tokens,
      called: true,
    };
  } catch {
    return { jobs: [], tokens: 0, called: false };
  }
}

async function checkTimelineConsistency(
  cvText: string,
  attribution?: VerifyLlmAttribution,
): Promise<{ consistent: boolean; issues: string[]; tokens: number; called: boolean }> {
  try {
    const response = await callClaude({
      max_tokens: 256,
      system:
        'You are a background verifier. Respond with ONLY valid JSON: {"consistent": boolean, "issues": string[]}',
      messages: [
        {
          role: "user",
          content: `Does this CV have consistent employment dates (no overlaps or suspicious gaps)? Reply JSON only.\n\n${cvText.slice(0, 10000)}`,
        },
      ],
      label: "verify-timeline",
      organisationId: attribution?.organisationId,
      jobId: attribution?.jobId,
      candidateId: attribution?.candidateId,
    });
    const parsed = extractJsonObject(response.text, "Verify timeline") as {
      consistent?: boolean;
      issues?: string[];
    };
    const result = VerifyResultSchema.safeParse({
      consistency_score: parsed.consistent ? 90 : 40,
      flags: (parsed.issues ?? []).map((i: string) => ({
        type: "date_overlap" as const,
        description: i,
        severity: "medium" as const,
      })),
      overall_verdict: parsed.consistent ? "clean" : "flagged",
    });
    if (result.success) {
      return {
        consistent: result.data.overall_verdict === "clean",
        issues: result.data.flags.map((f) => f.description),
        tokens: response.usage.input_tokens + response.usage.output_tokens,
        called: true,
      };
    }
    return {
      consistent: parsed.consistent !== false,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      tokens: response.usage.input_tokens + response.usage.output_tokens,
      called: true,
    };
  } catch {
    return { consistent: true, issues: [], tokens: 0, called: false };
  }
}
