/**
 * Temporary FitScore scoring-path diagnostics (FITSCORE_SCORING_DIAGNOSTIC=true).
 * Emits one JSON line per Claude call; does not change scoring logic.
 */

type DiagnosticTextBlock = { type: "text"; text: string };
type DiagnosticMessageContent = string | DiagnosticTextBlock[];

export type FitScoreDiagnosticStage =
  | "extraction"
  | "explanation"
  | "verdict-explanation"
  | "merged-extraction-verdict"
  | "vision-fallback"
  | "unknown";

type ScoringDiagnosticContext = {
  jobId: string;
  candidateId: string;
  callCount: number;
  pipelineStages: string[];
};

let activeContext: ScoringDiagnosticContext | null = null;

export function isFitScoreScoringDiagnosticEnabled(): boolean {
  return process.env.FITSCORE_SCORING_DIAGNOSTIC === "true";
}

export function beginFitScoreScoringDiagnostic(jobId: string, candidateId: string): void {
  if (!isFitScoreScoringDiagnosticEnabled()) return;
  activeContext = {
    jobId,
    candidateId,
    callCount: 0,
    pipelineStages: [],
  };
}

export function endFitScoreScoringDiagnostic(): void {
  if (!isFitScoreScoringDiagnosticEnabled() || !activeContext) return;
  console.log(
    JSON.stringify({
      type: "fitscore_scoring_diagnostic_summary",
      job_id: activeContext.jobId,
      candidate_id: activeContext.candidateId,
      total_claude_calls: activeContext.callCount,
      pipeline_stages: activeContext.pipelineStages,
    }),
  );
  activeContext = null;
}

export function logFitScorePipelineStage(stage: string, extra?: Record<string, unknown>): void {
  if (!isFitScoreScoringDiagnosticEnabled() || !activeContext) return;
  activeContext.pipelineStages.push(stage);
  console.log(
    JSON.stringify({
      type: "fitscore_pipeline_stage",
      stage,
      job_id: activeContext.jobId,
      candidate_id: activeContext.candidateId,
      ...extra,
    }),
  );
}

export function stageFromAnthropicLabel(label: string | undefined): FitScoreDiagnosticStage {
  switch (label) {
    case "fitscore-hybrid-extraction":
      return "extraction";
    case "fitscore-hybrid-explanation":
      return "explanation";
    case "fitscore-hybrid-verdict-explanation":
      return "verdict-explanation";
    case "fitscore-hybrid-extraction-verdict":
      return "merged-extraction-verdict";
    case "vision-fallback-resume":
      return "vision-fallback";
    default:
      return "unknown";
  }
}

function textBlockChars(block: DiagnosticTextBlock | string): number {
  return typeof block === "string" ? block.length : block.text.length;
}

export function measureSystemPromptChars(
  system: string | DiagnosticTextBlock[] | undefined,
): number {
  if (!system) return 0;
  if (typeof system === "string") return system.length;
  return system.reduce((sum, block) => sum + textBlockChars(block), 0);
}

export function measureUserMessageChars(
  messages: Array<{ content: DiagnosticMessageContent }>,
): number {
  let total = 0;
  for (const message of messages) {
    if (typeof message.content === "string") {
      total += message.content.length;
      continue;
    }
    for (const block of message.content) {
      total += textBlockChars(block);
    }
  }
  return total;
}

export function logFitScoreClaudeCall(payload: {
  stage: FitScoreDiagnosticStage;
  model: string;
  label?: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  system_prompt_chars: number;
  user_message_chars: number;
  jobId?: string;
  candidateId?: string;
}): void {
  if (!isFitScoreScoringDiagnosticEnabled()) return;

  const jobId = payload.jobId ?? activeContext?.jobId;
  const candidateId = payload.candidateId ?? activeContext?.candidateId;
  const inScoringPath =
    activeContext != null ||
    (payload.label != null &&
      (payload.label.startsWith("fitscore-hybrid") || payload.label === "vision-fallback-resume"));

  if (!inScoringPath) return;

  let totalCallsThisCandidate = 0;
  if (activeContext) {
    activeContext.callCount += 1;
    totalCallsThisCandidate = activeContext.callCount;
  }

  const callFailed =
    payload.input_tokens === 0 &&
    payload.output_tokens === 0 &&
    payload.label != null &&
    (payload.label.startsWith("fitscore-hybrid") || payload.label === "vision-fallback-resume");

  console.log(
    JSON.stringify({
      type: "fitscore_claude_call",
      stage: payload.stage,
      model: payload.model,
      label: payload.label ?? null,
      call_status: callFailed ? "error_or_no_usage" : "ok",
      input_tokens: payload.input_tokens,
      output_tokens: payload.output_tokens,
      cache_creation_input_tokens: payload.cache_creation_input_tokens,
      cache_read_input_tokens: payload.cache_read_input_tokens,
      system_prompt_chars: payload.system_prompt_chars,
      user_message_chars: payload.user_message_chars,
      total_calls_this_candidate: totalCallsThisCandidate,
      candidate_id: candidateId ?? null,
      job_id: jobId ?? null,
    }),
  );
}

export function logFitScorePreCallSizes(
  stage: FitScoreDiagnosticStage,
  sizes: {
    system_prompt_chars: number;
    user_message_chars: number;
    jobId?: string;
    candidateId?: string;
  },
): void {
  if (!isFitScoreScoringDiagnosticEnabled()) return;
  console.log(
    JSON.stringify({
      type: "fitscore_pre_call_sizes",
      stage,
      system_prompt_chars: sizes.system_prompt_chars,
      user_message_chars: sizes.user_message_chars,
      candidate_id: sizes.candidateId ?? activeContext?.candidateId ?? null,
      job_id: sizes.jobId ?? activeContext?.jobId ?? null,
    }),
  );
}
