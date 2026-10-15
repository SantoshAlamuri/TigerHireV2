/**
 * Read-only hiring-data agent (v1) — typed tools.
 *
 * Three parameterised SELECTs over three `security_invoker=true` analytics
 * views. Org isolation is enforced entirely by the views' RLS combined with
 * the recruiter's user-JWT Supabase client — there are NO manual
 * organisation_id predicates here, by design. The model picks one of these
 * tools and its args; it never authors SQL and never produces numbers itself.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/** Hard per-query row cap (guardrail #2: bound result size). */
export const ROW_CAP = 500;

/** Per-query wall-clock cap in ms (guardrail #2: bound query time). */
export const STATEMENT_TIMEOUT_MS = 8_000;

export const TOOL_NAMES = ["candidates_by_source", "job_funnel", "source_performance"] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

/**
 * Anthropic tool definitions. The schemas are intentionally tiny: the only
 * caller-supplied argument is an optional job_id. Everything else (the org
 * scope) is implicit and enforced by RLS.
 */
export const TOOL_SPECS = [
  {
    name: "candidates_by_source",
    description:
      "Count of candidates for the recruiter's organisation, broken down by acquisition source. Takes no arguments. Use for questions like 'where do our candidates come from?' or 'how many candidates per source?'.",
    input_schema: {
      type: "object" as const,
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "job_funnel",
    description:
      "The application funnel for the recruiter's jobs: applied → screened → shortlisted → interviewed → offered → hired, plus withdrawn/rejected counts and an overall conversion rate. Pass job_id for one specific job, or omit it to get every job in the organisation. Use for 'how is my pipeline doing?' or 'show the funnel for job X'.",
    input_schema: {
      type: "object" as const,
      properties: {
        job_id: {
          type: "string" as const,
          description: "Optional UUID of a single job to scope the funnel to.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "source_performance",
    description:
      "Per-source application performance for the recruiter's jobs: application count, number hired, and conversion rate per source. Pass job_id to scope to one job, or omit it for all jobs. Use for 'which source converts best?' or 'how does each source perform for job X?'.",
    input_schema: {
      type: "object" as const,
      properties: {
        job_id: {
          type: "string" as const,
          description: "Optional UUID of a single job to scope the breakdown to.",
        },
      },
      additionalProperties: false,
    },
  },
] as const;

// --- Row shapes (subset of the view columns we read) -------------------------

export interface CandidatesBySourceRow {
  source: string | null;
  candidate_count: number | null;
}

export interface JobFunnelRow {
  job_id: string;
  job_title: string | null;
  applied_count: number | null;
  screened_count: number | null;
  shortlisted_count: number | null;
  interviewed_count: number | null;
  offered_count: number | null;
  hired_count: number | null;
  withdrawn_count: number | null;
  rejected_count: number | null;
  conversion_rate: number | null;
}

export interface SourcePerformanceRow {
  job_id: string;
  job_title: string | null;
  source: string | null;
  count: number | null;
  hired_count: number | null;
  conversion_rate: number | null;
}

// --- Argument parsing --------------------------------------------------------

/** Optional job_id, only kept when it's a well-formed UUID. */
const jobScopedArgs = z.object({ job_id: z.string().uuid().optional() }).strip();

const noArgs = z.object({}).strip();

export interface ParsedArgs {
  job_id?: string;
}

/**
 * Validate raw tool input from the model. Unknown keys are stripped; a
 * non-UUID job_id is dropped (we fall back to the org-wide query) rather than
 * erroring — the org scope still holds regardless.
 */
export function parseToolArgs(name: ToolName, rawInput: unknown): ParsedArgs {
  if (name === "candidates_by_source") {
    noArgs.parse(rawInput ?? {});
    return {};
  }
  const result = jobScopedArgs.safeParse(rawInput ?? {});
  if (!result.success) return {};
  return result.data.job_id ? { job_id: result.data.job_id } : {};
}

// --- Execution ---------------------------------------------------------------

/** Reject if a query outlives STATEMENT_TIMEOUT_MS (the query is read-only and capped). */
function withTimeout<T>(p: PromiseLike<T>, ms = STATEMENT_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Hiring-data query timed out")), ms),
    ),
  ]);
}

export interface ToolResult {
  rows: unknown[];
  rowCount: number;
}

/**
 * Run the parameterised SELECT for the chosen tool against the user-scoped
 * (RLS-enforced) Supabase client. SELECT-only — there is no write path here.
 */
export async function executeTool(
  supabase: SupabaseClient,
  name: ToolName,
  args: ParsedArgs,
): Promise<ToolResult> {
  switch (name) {
    case "candidates_by_source": {
      const { data, error } = await withTimeout(
        supabase
          .from("analytics_candidates_by_source")
          .select("source, candidate_count")
          .order("candidate_count", { ascending: false })
          .limit(ROW_CAP),
      );
      if (error) throw new Error(`candidates_by_source query failed: ${error.message}`);
      const rows = (data ?? []) as CandidatesBySourceRow[];
      return { rows, rowCount: rows.length };
    }

    case "job_funnel": {
      let query = supabase
        .from("application_funnel")
        .select(
          "job_id, job_title, applied_count, screened_count, shortlisted_count, interviewed_count, offered_count, hired_count, withdrawn_count, rejected_count, conversion_rate",
        )
        .order("applied_count", { ascending: false })
        .limit(ROW_CAP);
      if (args.job_id) query = query.eq("job_id", args.job_id);
      const { data, error } = await withTimeout(query);
      if (error) throw new Error(`job_funnel query failed: ${error.message}`);
      const rows = (data ?? []) as JobFunnelRow[];
      return { rows, rowCount: rows.length };
    }

    case "source_performance": {
      let query = supabase
        .from("application_source_summary")
        .select("job_id, job_title, source, count, hired_count, conversion_rate")
        .order("count", { ascending: false })
        .limit(ROW_CAP);
      if (args.job_id) query = query.eq("job_id", args.job_id);
      const { data, error } = await withTimeout(query);
      if (error) throw new Error(`source_performance query failed: ${error.message}`);
      const rows = (data ?? []) as SourcePerformanceRow[];
      return { rows, rowCount: rows.length };
    }
  }
}

// --- Artifact shaping (for the chat view) ------------------------------------

export type Artifact =
  | {
      type: "source_bars";
      title: string;
      items: Array<{ source: string; count: number }>;
    }
  | {
      type: "funnel";
      title: string;
      jobs: Array<{
        jobId: string;
        jobTitle: string;
        conversionRate: number | null;
        stages: Array<{ label: string; count: number }>;
      }>;
    }
  | {
      type: "source_table";
      title: string;
      rows: Array<{
        source: string;
        jobTitle: string | null;
        count: number;
        hiredCount: number;
        conversionRate: number | null;
      }>;
    };

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Build an inspectable artifact from the real rows (numbers come only from rows). */
export function buildArtifact(name: ToolName, rows: unknown[]): Artifact {
  switch (name) {
    case "candidates_by_source": {
      const typed = rows as CandidatesBySourceRow[];
      return {
        type: "source_bars",
        title: "Candidates by source",
        items: typed.map((r) => ({
          source: r.source ?? "unknown",
          count: num(r.candidate_count),
        })),
      };
    }
    case "job_funnel": {
      const typed = rows as JobFunnelRow[];
      return {
        type: "funnel",
        title: "Application funnel",
        jobs: typed.map((r) => ({
          jobId: r.job_id,
          jobTitle: r.job_title ?? "Untitled job",
          conversionRate: r.conversion_rate ?? null,
          stages: [
            { label: "Applied", count: num(r.applied_count) },
            { label: "Screened", count: num(r.screened_count) },
            { label: "Shortlisted", count: num(r.shortlisted_count) },
            { label: "Interviewed", count: num(r.interviewed_count) },
            { label: "Offered", count: num(r.offered_count) },
            { label: "Hired", count: num(r.hired_count) },
          ],
        })),
      };
    }
    case "source_performance": {
      const typed = rows as SourcePerformanceRow[];
      return {
        type: "source_table",
        title: "Source performance",
        rows: typed.map((r) => ({
          source: r.source ?? "unknown",
          jobTitle: r.job_title ?? null,
          count: num(r.count),
          hiredCount: num(r.hired_count),
          conversionRate: r.conversion_rate ?? null,
        })),
      };
    }
  }
}
