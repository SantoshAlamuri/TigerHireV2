/**
 * Read-only hiring-data agent (v1) — orchestrator.
 *
 * Flow (synchronous, no Inngest):
 *   1. Ask Sonnet to route the question to ONE tool (tool_choice: auto).
 *   2. If it answered with no tool call → reject the turn (never emit a number).
 *   3. Run the chosen tool's parameterised SELECT on the user-JWT client (RLS).
 *   4. Ask Sonnet to phrase the answer around the real rows (tool_choice: none).
 *
 * Hard constraints honoured here:
 *   - Numbers come only from tool rows; the model is told never to invent them.
 *   - A turn with no tool_use is rejected and emits no figures.
 *   - The Supabase client is injected (the route passes the user-JWT client);
 *     this module never imports the service-role admin client.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELS } from "@/lib/config/models";
import { getAnthropicClient } from "@/lib/services/anthropic";
import {
  TOOL_SPECS,
  buildArtifact,
  executeTool,
  isToolName,
  parseToolArgs,
  type Artifact,
  type ParsedArgs,
  type ToolName,
} from "./tools";

const SYSTEM_PROMPT = `You are TigerHire's read-only hiring-data assistant. You answer a recruiter's questions about their OWN organisation's hiring data by calling exactly one of the provided tools and then phrasing the result in plain language.

Rules:
- Every number you state MUST come from a tool result. Never state, estimate, infer, or guess a count, rate, or total from your own knowledge. The returned rows are the only source of truth for figures.
- Choose exactly ONE tool per question:
  - candidates_by_source — how many candidates came from each acquisition source.
  - job_funnel — the application funnel (applied → screened → shortlisted → interviewed → offered → hired, plus withdrawn/rejected and a conversion rate) for one job or all jobs.
  - source_performance — per-source application counts, hires, and conversion rate, optionally scoped to one job.
- All data is automatically scoped to the recruiter's own organisation; you cannot see any other organisation. Never ask for or mention an organisation id.
- If the question cannot be answered with these three tools (it is off-topic, asks for data the tools do not cover, or you have no tool result), do NOT call a tool and do NOT make up an answer. Briefly say you can only answer questions about candidate sources, job funnels, and source performance for their organisation.
- When you do have a tool result, give a short, factual summary grounded only in the returned rows. Do not introduce any number that is not present in those rows.`;

const REFUSAL_TEXT =
  "I can only answer questions about your organisation's candidate sources, job funnels, and source performance. Try asking, for example, “How many candidates came from each source?” or “Show me the funnel for my open roles.”";

/** Minimal shape of the Anthropic client we depend on (injectable for tests). */
export interface AnthropicLike {
  messages: {
    create: (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;
  };
}

export interface DataAgentDeps {
  supabase: SupabaseClient;
  /** Defaults to the shared, pre-configured Anthropic client. */
  anthropic?: AnthropicLike;
}

export type DataAgentResult =
  | {
      kind: "answer";
      tool: ToolName;
      args: ParsedArgs;
      rowCount: number;
      rows: unknown[];
      artifact: Artifact;
      prose: string;
      latencyMs: number;
    }
  | {
      kind: "rejected";
      reason: "no_tool_call" | "unknown_tool";
      prose: string;
      latencyMs: number;
    };

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/**
 * Run one read-only data-agent turn. `question` is the recruiter's natural
 * language; `supabase` MUST be the recruiter's user-JWT client so RLS scopes
 * every read to their organisation.
 */
export async function runDataAgent(
  question: string,
  deps: DataAgentDeps,
): Promise<DataAgentResult> {
  const anthropic = deps.anthropic ?? (getAnthropicClient() as unknown as AnthropicLike);
  const started = Date.now();

  // 1. Route to a tool (or not).
  const routing = await anthropic.messages.create({
    model: MODELS.SONNET,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: TOOL_SPECS as unknown as Anthropic.Tool[],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: question }],
  });

  const toolUse = routing.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

  // 2. No tool call → reject (do not emit any number).
  if (!toolUse) {
    return {
      kind: "rejected",
      reason: "no_tool_call",
      prose: textOf(routing) || REFUSAL_TEXT,
      latencyMs: Date.now() - started,
    };
  }
  if (!isToolName(toolUse.name)) {
    return {
      kind: "rejected",
      reason: "unknown_tool",
      prose: REFUSAL_TEXT,
      latencyMs: Date.now() - started,
    };
  }

  // 3. Run the parameterised SELECT (RLS-scoped, read-only, capped).
  const args = parseToolArgs(toolUse.name, toolUse.input);
  const { rows, rowCount } = await executeTool(deps.supabase, toolUse.name, args);

  // 4. Phrase the answer around the real rows. tool_choice: none keeps it to
  //    one tool per turn and forces a text reply.
  const phrasing = await anthropic.messages.create({
    model: MODELS.SONNET,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: TOOL_SPECS as unknown as Anthropic.Tool[],
    tool_choice: { type: "none" },
    messages: [
      { role: "user", content: question },
      { role: "assistant", content: routing.content },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(rows),
          },
        ],
      },
    ],
  });

  const prose =
    textOf(phrasing) ||
    (rowCount === 0
      ? "There's no data for that yet."
      : "Here are the results from your hiring data.");

  return {
    kind: "answer",
    tool: toolUse.name,
    args,
    rowCount,
    rows,
    artifact: buildArtifact(toolUse.name, rows),
    prose,
    latencyMs: Date.now() - started,
  };
}
