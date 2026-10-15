import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { callClaude, extractJsonObject } from "@/lib/services/anthropic";
import { createRunContext, type AgentRunContext } from "./types";
import { logAgentRun } from "@/lib/observability/metrics";
import { logger } from "@/lib/observability/logger";
import { MODELS } from "@/lib/config/models";

interface CompanySignal {
  companyName: string;
  source: string;
  jobTitle: string;
  jobDescription: string;
  location?: string;
  sourceUrl?: string;
  postedDate?: string;
}

/**
 * Hiring Signal Agent — demand-side engine.
 * Processes company hiring signals, enriches job data, creates/updates job postings.
 */
export async function runHiringSignalAgent(signals: CompanySignal[]): Promise<AgentRunContext> {
  const ctx = createRunContext("hiring_signal");
  const admin = createSupabaseAdmin();

  await admin.from("agent_logs").insert({
    agent_name: ctx.agentName,
    run_id: ctx.runId,
    status: "running",
    payload: { signalCount: signals.length },
  });

  const totalTokens = { input: 0, output: 0 };

  for (const signal of signals) {
    ctx.recordsProcessed++;

    try {
      let orgId: string | null = null;
      const slug = signal.companyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      const { data: existingOrg } = await admin
        .from("organisations")
        .select("id")
        .eq("slug", slug)
        .single();

      if (existingOrg) {
        orgId = existingOrg.id;
      } else {
        const { data: newOrg, error: orgError } = await admin
          .from("organisations")
          .insert({
            type: "company",
            name: signal.companyName,
            slug,
            approval: "approved",
          })
          .select("id")
          .single();

        if (orgError) {
          ctx.errors.push(`Org create failed for ${signal.companyName}: ${orgError.message}`);
          continue;
        }
        orgId = newOrg.id;
      }

      const response = await callClaude({
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Parse this job posting from ${signal.source} into structured data. Return ONLY valid JSON.

Title: ${signal.jobTitle}
Company: ${signal.companyName}
Location: ${signal.location ?? "Not specified"}

JD:
${signal.jobDescription}

Return JSON:
{
  "titleNormalised": "standardised title",
  "location": "city, state or Remote",
  "compensationMin": number or null (annual INR lakhs),
  "compensationMax": number or null (annual INR lakhs)
}`,
          },
        ],
        label: "hiring-signal-parse",
        organisationId: orgId ?? undefined,
      });

      totalTokens.input += response.usage.input_tokens;
      totalTokens.output += response.usage.output_tokens;

      let parsed: Record<string, unknown> = {};
      try {
        parsed = extractJsonObject(response.text, "Hiring Signal") as Record<string, unknown>;
      } catch {
        logger.warn("HiringSignal: Claude returned no parseable JSON, using raw signal data", {
          company: signal.companyName,
        });
      }

      const { error: jobError } = await admin.from("jobs").insert({
        organisation_id: orgId,
        title: (parsed.titleNormalised as string) ?? signal.jobTitle,
        description: signal.jobDescription,
        location: (parsed.location as string) ?? signal.location ?? null,
        status: "open",
        compensation_min: (parsed.compensationMin as number) ?? null,
        compensation_max: (parsed.compensationMax as number) ?? null,
      });

      if (jobError) {
        ctx.errors.push(`Job insert failed: ${jobError.message}`);
        continue;
      }

      ctx.recordsCreated++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      ctx.errors.push(`Signal for ${signal.companyName}: ${message}`);
    }
  }

  await logAgentRun(
    admin,
    "hiring_signal",
    "admin_trigger",
    ctx.runId,
    ctx.errors.length > 0 ? "error" : "success",
    Date.now() - ctx.startedAt.getTime(),
    ctx.errors.length > 0 ? ctx.errors.slice(0, 3).join("; ") : undefined,
    totalTokens.input > 0 ? totalTokens : undefined,
    totalTokens.input > 0 ? MODELS.SONNET : undefined,
  );

  await admin.from("agent_logs").insert({
    agent_name: ctx.agentName,
    run_id: ctx.runId,
    status: ctx.errors.length > 0 ? "completed_with_errors" : "completed",
    payload: {
      recordsProcessed: ctx.recordsProcessed,
      recordsCreated: ctx.recordsCreated,
      recordsUpdated: ctx.recordsUpdated,
      errorsCount: ctx.errors.length,
      errors: ctx.errors.slice(0, 10),
      durationMs: Date.now() - ctx.startedAt.getTime(),
    },
  });

  return ctx;
}
