import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/config/env";
import { createResilientCall } from "@/lib/utils/resilient-call";
import { logger } from "@/lib/observability/logger";
import { calculateAnthropicUsdCost, recordAnthropicCostEvent } from "@/lib/costs/ledger";
import {
  assertWithinAnthropicBudget,
  recordAnthropicCallSpend,
} from "@/lib/services/anthropic-budget-gate";
import {
  AnthropicCircuitOpenError,
  runWithAnthropicCircuit,
} from "@/lib/services/anthropic-circuit";
import { logLlmCall } from "@/lib/observability/llm-call-log";
import { MODELS, getJdParseModel } from "@/lib/config/models";
import {
  logFitScoreClaudeCall,
  measureSystemPromptChars,
  measureUserMessageChars,
  stageFromAnthropicLabel,
} from "@/lib/fitscore/scoring-diagnostic";

let _client: Anthropic | null = null;
const anthropicCall = createResilientCall({
  service: "anthropic",
  failureThreshold: 5,
  openMs: 30_000,
  timeoutMs: 120_000,
  maxRetries: 1,
});

const anthropicCallPdf = createResilientCall({
  service: "anthropic-pdf",
  failureThreshold: 3,
  openMs: 60_000,
  timeoutMs: 180_000,
  maxRetries: 0,
});

const ANTHROPIC_TIMEOUT_MS = 120_000;

/** User-facing message when Anthropic returns credit/billing errors. */
export const ANTHROPIC_CREDIT_ERROR_MESSAGE =
  "Your API credit balance is too low. Please go to Plans & Billing to add credits.";

function isAnthropicCreditError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const body =
    typeof (err as { error?: { message?: string } })?.error?.message === "string"
      ? (err as { error: { message: string } }).error.message
      : msg;
  return /credit balance|Plans & Billing|upgrade or purchase credits/i.test(body);
}

/** Rethrow with a clear user-facing message for credit/billing errors. */
function normalizeAnthropicError(err: unknown): never {
  if (isAnthropicCreditError(err)) throw new Error(ANTHROPIC_CREDIT_ERROR_MESSAGE);
  throw err;
}

function tryExtractUsageFromAnthropicFailure(err: unknown): ClaudeResponse["usage"] | null {
  if (!err || typeof err !== "object") return null;
  const usage = (err as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  if (typeof u.input_tokens !== "number" || typeof u.output_tokens !== "number") return null;
  return {
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_creation_input_tokens:
      typeof u.cache_creation_input_tokens === "number" ? u.cache_creation_input_tokens : undefined,
    cache_read_input_tokens:
      typeof u.cache_read_input_tokens === "number" ? u.cache_read_input_tokens : undefined,
  };
}

function anthropicFailureErrorClass(err: unknown): string {
  if (err instanceof AnthropicCircuitOpenError) return "AnthropicCircuitOpenError";
  if (err instanceof Error) return err.name || "Error";
  return "UnknownError";
}

/** JD parsing/generation model. Default Sonnet for cost; set ANTHROPIC_JD_MODEL=claude-opus-4-6 for max quality. */
const JD_PARSE_MODEL = getJdParseModel();

export interface ClaudeResponse {
  text: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export interface ClaudeCacheControlEphemeral {
  type: "ephemeral";
}

export interface ClaudeTextBlock {
  type: "text";
  text: string;
  cache_control?: ClaudeCacheControlEphemeral;
}

type ClaudeMessageContent = string | ClaudeTextBlock[];

/** Optional hiring-company + job + candidate for `platform_cost_events` (admin billing). */
export type ResumeParseCostAttribution = {
  organisationId?: string;
  jobId?: string;
  candidateId?: string;
};

/**
 * Centralized Claude call with circuit breaker, retry, and timeout.
 * All agent code should use this instead of calling client.messages.create() directly.
 *
 * **Cost attribution:** When the call is on behalf of a customer (job scoring, JD tools, etc.),
 * pass `organisationId` (hiring company), and `jobId` / `candidateId` when known so admin billing
 * and per-job cost reports stay accurate. Omit only for truly platform-global work (e.g. some cron
 * tasks) or when context is not yet available (e.g. cold CV drop before a candidate row exists).
 */
export async function callClaude(params: {
  model?: string;
  max_tokens: number;
  system?: string | ClaudeTextBlock[];
  messages: Array<{ role: "user" | "assistant"; content: ClaudeMessageContent }>;
  label?: string;
  temperature?: number;
  /** Job this call is attributable to (enables per-job cost rollups in admin dashboard). */
  jobId?: string;
  /** Candidate this call is attributable to. */
  candidateId?: string;
  /** Organisation this call is attributable to (defaults to none). */
  organisationId?: string;
  /** FitScore scoring entry point — stored on platform_cost_events.metadata.source */
  scoringSource?: string;
}): Promise<ClaudeResponse> {
  // Budget gate — per-role cap (primary) + global day/month (backstop). Throws
  // BudgetExceededError when the role's accumulated INR spend hits its cap.
  // Callers (FitScoreService, cv-parser) catch this and degrade gracefully
  // (mark "budget_pending", rank by embedding only, never a 500).
  await assertWithinAnthropicBudget({
    jobId: params.jobId,
    organisationId: params.organisationId,
  });

  const client = getAnthropicClient();
  const startMs = Date.now();
  const modelName = params.model ?? MODELS.SONNET;
  const invocationId = randomUUID();
  logger.info(`[anthropic] callClaude start`, {
    label: params.label,
    model: modelName,
    temperature: params.temperature,
  });
  let response;
  try {
    response = await runWithAnthropicCircuit(
      () =>
        anthropicCall(
          () =>
            client.messages.create({
              model: modelName,
              max_tokens: params.max_tokens,
              ...(params.system && { system: params.system }),
              ...(params.temperature !== undefined && { temperature: params.temperature }),
              messages: params.messages,
            }),
          params.label,
        ),
      { label: params.label },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status =
      err instanceof AnthropicCircuitOpenError
        ? "circuit_open"
        : /timeout|aborted/i.test(message)
          ? "timeout"
          : "error";
    logLlmCall({
      model: modelName,
      purpose: params.label ?? "unspecified",
      latencyMs: Date.now() - startMs,
      status,
      errorClass: err instanceof Error ? err.name : "UnknownError",
    });
    const failUsage = tryExtractUsageFromAnthropicFailure(err);
    await recordAnthropicCostEvent({
      model: modelName,
      inputTokens: failUsage?.input_tokens ?? 0,
      outputTokens: failUsage?.output_tokens ?? 0,
      cacheCreationInputTokens: failUsage?.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: failUsage?.cache_read_input_tokens ?? 0,
      label: params.label,
      jobId: params.jobId,
      candidateId: params.candidateId,
      organisationId: params.organisationId,
      scoringSource: params.scoringSource,
      invocationId,
      callStatus: "error",
      errorClass: anthropicFailureErrorClass(err),
    });
    logFitScoreClaudeCall({
      stage: stageFromAnthropicLabel(params.label),
      model: modelName,
      label: params.label,
      input_tokens: failUsage?.input_tokens ?? 0,
      output_tokens: failUsage?.output_tokens ?? 0,
      cache_creation_input_tokens: failUsage?.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: failUsage?.cache_read_input_tokens ?? 0,
      system_prompt_chars: measureSystemPromptChars(params.system),
      user_message_chars: measureUserMessageChars(params.messages),
      jobId: params.jobId,
      candidateId: params.candidateId,
    });
    normalizeAnthropicError(err);
  }

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const usage = response.usage as ClaudeResponse["usage"];
  logger.info(`[anthropic] callClaude done`, {
    label: params.label,
    durationMs: Date.now() - startMs,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
  });
  logLlmCall({
    model: modelName,
    purpose: params.label ?? "unspecified",
    latencyMs: Date.now() - startMs,
    status: "ok",
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
  });
  await recordAnthropicCostEvent({
    model: modelName,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
    label: params.label,
    jobId: params.jobId,
    candidateId: params.candidateId,
    organisationId: params.organisationId,
    scoringSource: params.scoringSource,
    invocationId,
    callStatus: "ok",
  });
  // Mirror the spend into budget_state for the global INR-denominated gate.
  // Computed locally so the gate stays decoupled from platform_cost_events
  // backend changes; both use the same calculateAnthropicUsdCost source.
  const successCostUsd = calculateAnthropicUsdCost(modelName, {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
  });
  await recordAnthropicCallSpend({
    costUsd: successCostUsd,
    jobId: params.jobId,
    organisationId: params.organisationId,
  }).catch(() => {
    // Logged inside recordAnthropicCallSpend; never block the return.
    return null;
  });
  logFitScoreClaudeCall({
    stage: stageFromAnthropicLabel(params.label),
    model: modelName,
    label: params.label,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    system_prompt_chars: measureSystemPromptChars(params.system),
    user_message_chars: measureUserMessageChars(params.messages),
    jobId: params.jobId,
    candidateId: params.candidateId,
  });
  return { text, usage };
}

/** User message content: string or mixed blocks (e.g. document + text) for native PDF support */
export type UserMessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | {
          type: "document";
          source: {
            type: "base64";
            media_type: "application/pdf";
            data: string;
          };
        }
    >;

/**
 * Call Claude with user message content that can be string or content blocks (e.g. PDF document + text).
 * Uses a PDF-specific resilient wrapper with longer timeout (180s) and no retries to avoid
 * wasting time on large document processing that naturally takes 30-90s.
 *
 * Pass `organisationId` / `jobId` / `candidateId` when known for the same cost-ledger behaviour as `callClaude`.
 */
export async function callClaudeWithUserContent(params: {
  model?: string;
  max_tokens: number;
  system?: string;
  userContent: UserMessageContent;
  label?: string;
  jobId?: string;
  candidateId?: string;
  organisationId?: string;
  scoringSource?: string;
}): Promise<ClaudeResponse> {
  // Same per-role + global budget gate as callClaude — vision fallback is the
  // single most expensive call (Sonnet on a rendered PDF), so it especially
  // needs to respect the role cap.
  await assertWithinAnthropicBudget({
    jobId: params.jobId,
    organisationId: params.organisationId,
  });

  const client = getAnthropicClient();
  const startMs = Date.now();
  const modelName = params.model ?? MODELS.SONNET;
  const invocationId = randomUUID();
  logger.info(`[anthropic] callClaudeWithUserContent start`, {
    label: params.label,
    model: modelName,
  });
  let response;
  try {
    response = await runWithAnthropicCircuit(
      () =>
        anthropicCallPdf(
          () =>
            client.messages.create({
              model: modelName,
              max_tokens: params.max_tokens,
              ...(params.system && { system: params.system }),
              messages: [{ role: "user", content: params.userContent }],
            }),
          params.label,
        ),
      { label: params.label },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status =
      err instanceof AnthropicCircuitOpenError
        ? "circuit_open"
        : /timeout|aborted/i.test(message)
          ? "timeout"
          : "error";
    logLlmCall({
      model: modelName,
      purpose: params.label ?? "unspecified",
      latencyMs: Date.now() - startMs,
      status,
      errorClass: err instanceof Error ? err.name : "UnknownError",
    });
    const failUsage = tryExtractUsageFromAnthropicFailure(err);
    await recordAnthropicCostEvent({
      model: modelName,
      inputTokens: failUsage?.input_tokens ?? 0,
      outputTokens: failUsage?.output_tokens ?? 0,
      cacheCreationInputTokens: failUsage?.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: failUsage?.cache_read_input_tokens ?? 0,
      label: params.label,
      jobId: params.jobId,
      candidateId: params.candidateId,
      organisationId: params.organisationId,
      scoringSource: params.scoringSource,
      invocationId,
      callStatus: "error",
      errorClass: anthropicFailureErrorClass(err),
    });
    const failUserMessageChars =
      typeof params.userContent === "string"
        ? params.userContent.length
        : params.userContent.reduce((sum, block) => {
            if (block.type === "text") return sum + block.text.length;
            return sum + block.source.data.length;
          }, 0);
    logFitScoreClaudeCall({
      stage: stageFromAnthropicLabel(params.label),
      model: modelName,
      label: params.label,
      input_tokens: failUsage?.input_tokens ?? 0,
      output_tokens: failUsage?.output_tokens ?? 0,
      cache_creation_input_tokens: failUsage?.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: failUsage?.cache_read_input_tokens ?? 0,
      system_prompt_chars: params.system?.length ?? 0,
      user_message_chars: failUserMessageChars,
      jobId: params.jobId,
      candidateId: params.candidateId,
    });
    normalizeAnthropicError(err);
  }

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const usage = response.usage as ClaudeResponse["usage"];
  logger.info(`[anthropic] callClaudeWithUserContent done`, {
    label: params.label,
    durationMs: Date.now() - startMs,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
    responseLength: text.length,
  });
  logLlmCall({
    model: modelName,
    purpose: params.label ?? "unspecified",
    latencyMs: Date.now() - startMs,
    status: "ok",
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
  });
  await recordAnthropicCostEvent({
    model: modelName,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
    label: params.label,
    jobId: params.jobId,
    candidateId: params.candidateId,
    organisationId: params.organisationId,
    scoringSource: params.scoringSource,
    invocationId,
    callStatus: "ok",
  });
  await recordAnthropicCallSpend({
    costUsd: calculateAnthropicUsdCost(modelName, {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
    }),
    jobId: params.jobId,
    organisationId: params.organisationId,
  }).catch(() => {
    // Logged inside recordAnthropicCallSpend; never block the return.
    return null;
  });
  const userMessageChars =
    typeof params.userContent === "string"
      ? params.userContent.length
      : params.userContent.reduce((sum, block) => {
          if (block.type === "text") return sum + block.text.length;
          return sum + block.source.data.length;
        }, 0);
  logFitScoreClaudeCall({
    stage: stageFromAnthropicLabel(params.label),
    model: modelName,
    label: params.label,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    system_prompt_chars: params.system?.length ?? 0,
    user_message_chars: userMessageChars,
    jobId: params.jobId,
    candidateId: params.candidateId,
  });
  return { text, usage };
}

/**
 * Extract a JSON object from Claude's text response using regex.
 * Throws if no JSON found.
 */
export function extractJsonObject(text: string, context: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`${context}: no JSON object in Claude response`);
  return JSON.parse(match[0]);
}

/**
 * Extract a JSON array from Claude's text response using regex.
 * Throws if no JSON found.
 */
export function extractJsonArray(text: string, context: string): unknown[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`${context}: no JSON array in Claude response`);
  return JSON.parse(match[0]);
}

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: env.anthropicApiKey,
      timeout: ANTHROPIC_TIMEOUT_MS,
    });
  }
  return _client;
}

interface AISectionItem {
  label: string;
  type: "text" | "list" | "tags";
  value: string | string[];
}

export interface ParsedJD {
  titleNormalised: string;
  roleFunction: string;
  seniorityLevel: string;
  location: string;
  remoteAllowed: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  experienceMin: number | null;
  experienceMax: number | null;
  summary: string;
  sections: AISectionItem[];
}

/** Normalise PDF/Word extraction noise before JD parsing (shared by upload, URL, paste flows). */
export function normalizeJdTextForParsing(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripMarkdownJsonFence(text: string): string {
  let t = text.trim();
  if (!t.startsWith("```")) return t;
  const firstLineEnd = t.indexOf("\n");
  if (firstLineEnd === -1) return t;
  t = t.slice(firstLineEnd + 1);
  const closeIdx = t.lastIndexOf("```");
  if (closeIdx !== -1) t = t.slice(0, closeIdx);
  return t.trim();
}

export async function parseJobDescription(jdText: string): Promise<ParsedJD> {
  const client = getAnthropicClient();
  const jdNormalized = normalizeJdTextForParsing(jdText);

  const response = await anthropicCall(() =>
    client.messages.create({
      model: JD_PARSE_MODEL,
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: `You extract structured data from a job description. Return ONLY valid JSON (no markdown, no commentary).

JD source text (may contain PDF column/order artefacts — reconstruct readable structure):
${jdNormalized}

Return JSON with these fields:
{
  "titleNormalised": "standardised role title",
  "roleFunction": "one of: Engineering, Product, Design, Sales, HR, Finance, Operations, Marketing",
  "seniorityLevel": "one of: Intern, Junior, Mid, Senior, Lead, Manager, Director, VP, C-Suite",
  "location": "city, state or Remote",
  "remoteAllowed": true or false,
  "salaryMin": number or null,
  "salaryMax": number or null,
  "experienceMin": number or null,
  "experienceMax": number or null,
  "summary": "one-line summary of the role",
  "sections": [
    { "label": "section label", "type": "text|list|tags", "value": "..." }
  ]
}

Numeric fields: salaryMin/salaryMax are annual compensation in INR lakhs (LPA) only when the JD clearly uses INR/LPA/₹ or Indian lakhs; otherwise use null (see COMPENSATION below). experienceMin/experienceMax are years.

SECTIONS FORMAT:
Each section has a label, type, and value:
- type "text": value is a string (paragraphs, single values)
- type "list": value is an array of strings (bullet points, responsibilities)
- type "tags": value is an array of short keyword strings (skills, tools)

FAITHFULNESS (critical):
- Ground every section in the JD text. Do not invent responsibilities, tools, degrees, or benefits not stated or clearly implied there.
- When the JD lists bullets or numbered duties, keep them as separate "list" items (do not collapse many bullets into one vague sentence).
- Preserve important qualifiers (years of experience, certifications, domain keywords). Prefer quoting short phrases from the JD when unsure.
- If text looks fragmented (PDF), still extract all substantive clauses; use sensible section labels.

COMPENSATION:
- Use salaryMin/salaryMax as annual INR lakhs only when the JD clearly states INR/LPA/₹ or Indian lakhs context.
- If compensation is only in USD/EUR/GBP or another currency, set salaryMin and salaryMax to null and mention the range and currency briefly in "summary".

COVERAGE:
- Include sections for each major theme present: company/blurb, role title, responsibilities, requirements, skills/stack, logistics (location/remote/travel), benefits, legal/equal-opportunity notes if substantive.
- Common labels include (adapt to the JD): "About the Company", "Designation", "Reporting To", "Roles & Responsibilities", "Technical Skills", "Leadership Skills", "Soft Skills", "Preferred Skills", "Nice to Have", "Benefits & Perks", "Education Requirements", "Employment Type", "Experience Required", "Notice Period"
- For unusual JDs add custom sections (e.g. "Compliance", "Travel", "Certifications", "Tools & Platforms").

Rules:
- Extract every technology, tool, framework, and competency mentioned into tags as separate strings (not comma-joined).
- Do NOT include empty sections or placeholder-only sections.
- Order sections logically: company/context → role → responsibilities → requirements/skills → logistics → benefits.
- Each tags array must use individual string items only.`,
        },
      ],
    }),
  );

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const fenced = stripMarkdownJsonFence(text);
  return extractJsonObject(fenced, "parseJobDescription") as ParsedJD;
}

export interface GeneratedJD extends ParsedJD {
  description: string;
}

interface GenerateJobFromPromptOptions {
  companyTone?: string;
  companyContext?: string;
  mustInclude?: string[];
}

/**
 * Generate a full job description and structured fields from a short prompt
 * (e.g. "Senior backend engineer, Bangalore, Java Spring Boot, 20-30 LPA, remote ok").
 */
export async function generateJobFromPrompt(
  prompt: string,
  options?: GenerateJobFromPromptOptions,
): Promise<GeneratedJD> {
  const client = getAnthropicClient();
  const companyTone = options?.companyTone?.trim() ?? "";
  const companyContext = options?.companyContext?.trim() ?? "";
  const mustInclude = (options?.mustInclude ?? []).map((item) => item.trim()).filter(Boolean);
  const voiceInstruction = [
    companyTone ? `Company tone/style to follow strictly: ${companyTone}` : "",
    companyContext ? `Company context: ${companyContext}` : "",
    mustInclude.length > 0
      ? `Mandatory points to include in output:\n- ${mustInclude.join("\n- ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await anthropicCall(() =>
    client.messages.create({
      model: JD_PARSE_MODEL,
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: `You are helping create a professional job posting. The user has given a brief description of a role they want to hire for. Generate a complete, well-structured job description with all standard sections.

User's prompt:
${prompt}

${voiceInstruction ? `\nBrand and voice instructions:\n${voiceInstruction}\n` : ""}

Return ONLY valid JSON with these fields:
{
  "titleNormalised": "standardised job title",
  "roleFunction": "one of: Engineering, Product, Design, Sales, HR, Finance, Operations, Marketing",
  "seniorityLevel": "one of: Intern, Junior, Mid, Senior, Lead, Manager, Director, VP, C-Suite",
  "location": "city, state or Remote",
  "remoteAllowed": true/false,
  "salaryMin": number or null (annual salary in INR lakhs, e.g. 15 for 15 LPA),
  "salaryMax": number or null (INR lakhs),
  "experienceMin": number or null (years),
  "experienceMax": number or null (years),
  "summary": "one-line summary of the role",
  "description": "full combined job description as plain text (2-4 paragraphs). No markdown.",
  "sections": [
    { "label": "section label", "type": "text|list|tags", "value": "..." }
  ]
}

SECTIONS FORMAT:
Each section has a label, type, and value:
- type "text": value is a string (paragraphs, single values)
- type "list": value is an array of strings (bullet points, responsibilities)
- type "tags": value is an array of short keyword strings (skills, tools)

Generate these sections (and any others relevant to the role):
- "About the Company" (text) — 1-2 paragraph company overview; if not specified, write a professional placeholder
- "Designation" (text) — exact job title / designation
- "Reporting To" (text) — who this role reports to
- "Roles & Responsibilities" (list) — 6-10 specific, actionable responsibilities
- "Technical Skills" (tags) — languages, frameworks, databases, tools, platforms
- "Leadership Skills" (tags) — mentoring, code reviews, architecture decisions, stakeholder management
- "Soft Skills" (tags) — communication, problem-solving, collaboration
- "Preferred Skills" (list) — good-to-have technical/domain skills
- "Nice to Have" (list) — bonus qualifications, certifications, OSS contributions
- "Benefits & Perks" (list) — 5-8 realistic Indian market benefits
- "Education Requirements" (text) — degree requirements
- "Employment Type" (text) — Full-time / Part-time / Contract
- "Experience Required" (text) — e.g. 5-8 years
- "Notice Period" (text) — e.g. Immediate joiners preferred

For non-standard roles, add custom sections that fit (e.g. "Territory Coverage", "Travel Requirements", "Compliance Requirements").

Rules:
- Infer missing details sensibly based on the role and seniority.
- Put each technology/skill as a separate array item in tags.
- Use Indian job market norms (LPA for salary, Indian benefits like PF/gratuity).
- If company tone/style is provided, maintain that tone across all text fields.
- Do NOT include empty sections.
- Order sections logically: company info first, then role, skills, qualifications, benefits.`,
        },
      ],
    }),
  );

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const fenced = stripMarkdownJsonFence(text);
  return extractJsonObject(fenced, "generateJobFromPrompt") as GeneratedJD;
}

interface EnrichedSignal {
  name: string | null;
  email: string | null;
  phone: string | null;
  roleTitle: string | null;
  roleFunction: string;
  seniorityLevel: string;
  currentCompany: string | null;
  skills: string[];
  locationCity: string | null;
  locationState: string | null;
  experienceYears: number | null;
  intentScore: number;
  salaryMinInferred: number | null;
  salaryMaxInferred: number | null;
}

export async function enrichCandidateSignal(
  rawText: string,
  source: string,
): Promise<EnrichedSignal & { _tokens: { input: number; output: number } }> {
  const response = await callClaude({
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Enrich this candidate signal from ${source} for the Indian job market. Return ONLY valid JSON.

Signal:
${rawText}

Return JSON:
{
  "name": "name if visible, else null",
  "email": "email if visible, else null",
  "phone": "phone if visible (digits optional), else null",
  "roleTitle": "normalised role title",
  "roleFunction": "one of: Engineering, Product, Design, Sales, HR, Finance, Operations, Marketing",
  "seniorityLevel": "one of: Intern, Junior, Mid, Senior, Lead, Manager, Director, VP, C-Suite",
  "currentCompany": "company name or null",
  "skills": ["inferred skills"],
  "locationCity": "city or null",
  "locationState": "state or null",
  "experienceYears": number or null,
  "intentScore": 0-100 (100 = explicitly seeking work right now),
  "salaryMinInferred": number or null (annual INR lakhs),
  "salaryMaxInferred": number or null (annual INR lakhs)
}`,
      },
    ],
    label: "enrich-signal",
  });

  const data = extractJsonObject(response.text, "Enrich signal") as EnrichedSignal;
  return {
    ...data,
    _tokens: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}
