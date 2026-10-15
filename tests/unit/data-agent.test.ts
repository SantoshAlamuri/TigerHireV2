import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

// Keep the heavy anthropic service module out of the import graph — every test
// here injects its own fake Anthropic client.
vi.mock("@/lib/services/anthropic", () => ({
  getAnthropicClient: () => ({ messages: { create: vi.fn() } }),
  ANTHROPIC_CREDIT_ERROR_MESSAGE: "credit",
}));
vi.mock("@/lib/observability/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { runDataAgent, type AnthropicLike } from "@/lib/agents/data-agent/agent";
import {
  executeTool,
  parseToolArgs,
  buildArtifact,
  type ToolName,
} from "@/lib/agents/data-agent/tools";
import { logAgentQuery } from "@/lib/agents/data-agent/audit";

// --- Mock user-scoped Supabase client ---------------------------------------
// Stands in for the recruiter's RLS-scoped client: each instance only "sees"
// the rows it was seeded with, exactly as a real per-org client would.

function makeMockClient(
  tables: Record<string, Array<Record<string, unknown>>>,
  inserts: Array<{ table: string; payload: unknown }> = [],
) {
  const from = vi.fn((table: string) => {
    let rows = [...(tables[table] ?? [])];
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.order = () => builder;
    builder.limit = () => builder;
    builder.eq = (col: string, val: unknown) => {
      rows = rows.filter((r) => r[col] === val);
      return builder;
    };
    builder.insert = (payload: unknown) => {
      inserts.push({ table, payload });
      return { then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }) };
    };
    builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
    return builder;
  });
  return { client: { from } as unknown as SupabaseClient, from };
}

// --- Fake Anthropic client ---------------------------------------------------

function makeFakeAnthropic(opts: {
  toolName?: ToolName;
  toolInput?: Record<string, unknown>;
  prose?: string;
  noTool?: boolean;
}): AnthropicLike {
  const create = vi.fn(async (params: { tool_choice?: { type: string } }) => {
    // Phrasing call (tool_choice: none) → return prose text.
    if (params.tool_choice?.type === "none") {
      return { content: [{ type: "text", text: opts.prose ?? "Here are your results." }] };
    }
    // Routing call (tool_choice: auto).
    if (opts.noTool) {
      return { content: [{ type: "text", text: "I am not able to help with that." }] };
    }
    return {
      content: [
        {
          type: "tool_use",
          id: "toolu_1",
          name: opts.toolName ?? "candidates_by_source",
          input: opts.toolInput ?? {},
        },
      ],
    };
  });
  return { messages: { create } } as unknown as AnthropicLike;
}

describe("parseToolArgs", () => {
  it("returns no args for candidates_by_source and strips unknown keys", () => {
    expect(parseToolArgs("candidates_by_source", { foo: 1 })).toEqual({});
  });

  it("keeps a valid job_id UUID", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(parseToolArgs("job_funnel", { job_id: id })).toEqual({ job_id: id });
  });

  it("drops a non-UUID job_id (falls back to org-wide)", () => {
    expect(parseToolArgs("source_performance", { job_id: "not-a-uuid" })).toEqual({});
  });
});

describe("executeTool", () => {
  it("reads candidates_by_source rows from the scoped client", async () => {
    const { client } = makeMockClient({
      analytics_candidates_by_source: [
        { source: "linkedin", candidate_count: 11 },
        { source: "referral", candidate_count: 4 },
      ],
    });
    const { rows, rowCount } = await executeTool(client, "candidates_by_source", {});
    expect(rowCount).toBe(2);
    expect(rows).toEqual([
      { source: "linkedin", candidate_count: 11 },
      { source: "referral", candidate_count: 4 },
    ]);
  });

  it("scopes job_funnel to a single job when job_id is given", async () => {
    const { client } = makeMockClient({
      application_funnel: [
        { job_id: "job-1", applied_count: 50, hired_count: 3 },
        { job_id: "job-2", applied_count: 9, hired_count: 0 },
      ],
    });
    const { rows, rowCount } = await executeTool(client, "job_funnel", { job_id: "job-1" });
    expect(rowCount).toBe(1);
    expect((rows[0] as { job_id: string }).job_id).toBe("job-1");
  });

  it("returns every job's funnel when no job_id is given", async () => {
    const { client } = makeMockClient({
      application_funnel: [
        { job_id: "job-1", applied_count: 50 },
        { job_id: "job-2", applied_count: 9 },
      ],
    });
    const { rowCount } = await executeTool(client, "job_funnel", {});
    expect(rowCount).toBe(2);
  });
});

describe("buildArtifact", () => {
  it("shapes a source_bars artifact from candidate rows", () => {
    const art = buildArtifact("candidates_by_source", [
      { source: "linkedin", candidate_count: 11 },
      { source: null, candidate_count: null },
    ]);
    expect(art).toEqual({
      type: "source_bars",
      title: "Candidates by source",
      items: [
        { source: "linkedin", count: 11 },
        { source: "unknown", count: 0 },
      ],
    });
  });

  it("shapes a funnel artifact with all six stages", () => {
    const art = buildArtifact("job_funnel", [
      {
        job_id: "job-1",
        job_title: "Backend Engineer",
        applied_count: 50,
        screened_count: 30,
        shortlisted_count: 12,
        interviewed_count: 6,
        offered_count: 2,
        hired_count: 1,
        conversion_rate: 0.02,
      },
    ]);
    expect(art.type).toBe("funnel");
    if (art.type === "funnel") {
      expect(art.jobs[0].stages.map((s) => s.count)).toEqual([50, 30, 12, 6, 2, 1]);
      expect(art.jobs[0].conversionRate).toBe(0.02);
    }
  });
});

describe("runDataAgent — cross-org isolation", () => {
  it("only returns the numbers visible to the recruiter's own scoped client", async () => {
    const orgA = makeMockClient({
      analytics_candidates_by_source: [
        { source: "linkedin", candidate_count: 11 },
        { source: "referral", candidate_count: 4 },
      ],
    });
    const orgB = makeMockClient({
      analytics_candidates_by_source: [{ source: "naukri", candidate_count: 99 }],
    });
    const anthropic = makeFakeAnthropic({ toolName: "candidates_by_source" });

    const resA = await runDataAgent("where do candidates come from?", {
      supabase: orgA.client,
      anthropic,
    });
    const resB = await runDataAgent("where do candidates come from?", {
      supabase: orgB.client,
      anthropic,
    });

    expect(resA.kind).toBe("answer");
    expect(resB.kind).toBe("answer");

    const a = JSON.stringify(resA);
    const b = JSON.stringify(resB);

    // Org A never sees Org B's source or count, and vice versa.
    expect(a).toContain("linkedin");
    expect(a).not.toContain("naukri");
    expect(a).not.toContain("99");
    expect(b).toContain("naukri");
    expect(b).not.toContain("linkedin");
  });
});

describe("runDataAgent — no-hallucination guard", () => {
  it("rejects a turn with no tool call and emits no number", async () => {
    const { client, from } = makeMockClient({});
    const anthropic = makeFakeAnthropic({ noTool: true });

    const result = await runDataAgent("what's the weather in Mumbai?", {
      supabase: client,
      anthropic,
    });

    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") {
      expect(result.reason).toBe("no_tool_call");
      // Never touched the database…
      expect(from).not.toHaveBeenCalled();
      // …and never emitted a figure.
      expect(result.prose).not.toMatch(/\d/);
    }
  });
});

describe("logAgentQuery — audit payload", () => {
  it("inserts one row with the tool, args, row count, and latency", async () => {
    const inserts: Array<{ table: string; payload: unknown }> = [];
    const { client } = makeMockClient({}, inserts);

    await logAgentQuery(client, {
      organisationId: "org-1",
      userId: "user-1",
      question: "how is my funnel?",
      tool: "job_funnel",
      args: { job_id: "job-1" },
      rowCount: 3,
      latencyMs: 420,
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe("agent_query_log");
    expect(inserts[0].payload).toEqual({
      organisation_id: "org-1",
      user_id: "user-1",
      question: "how is my funnel?",
      tool: "job_funnel",
      args: { job_id: "job-1" },
      row_count: 3,
      latency_ms: 420,
    });
  });
});

describe("service-role absence", () => {
  // The whole data-agent path must build its client from the user JWT — the
  // service-role admin client must never appear anywhere in it.
  const files = [
    "src/lib/agents/data-agent/agent.ts",
    "src/lib/agents/data-agent/tools.ts",
    "src/lib/agents/data-agent/audit.ts",
    "src/app/api/agents/data/route.ts",
  ];

  it.each(files)("%s does not reference the service-role admin client", (rel) => {
    const source = readFileSync(path.join(process.cwd(), rel), "utf8");
    expect(source).not.toMatch(/supabase\/admin/);
    expect(source).not.toMatch(/createSupabaseAdmin/);
    expect(source).not.toMatch(/SERVICE_ROLE/i);
  });
});
