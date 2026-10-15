/**
 * OpenAI service for structured extraction (optional Stage 2A).
 * Not used by the active FitScore pipeline unless OPENAI_FITSCORE_ENABLED=true.
 * Default: Haiku extracts CV facts; Sonnet is quality/coverage fallback.
 */

import OpenAI from "openai";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import type { CVFacts } from "@/lib/fitscore/three-stage/types";

/** Model if OpenAI path is explicitly enabled (not used in production default). */
export const CV_FACTS_OPENAI_MODEL = "gpt-4o-mini";

let _client: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!_client) {
    const apiKey = env.openaiApiKey;
    if (!apiKey) {
      // Don't throw - let caller handle fallback
      throw new Error("OPENAI_API_KEY not set - fallback to Claude");
    }
    _client = new OpenAI({
      apiKey,
      timeout: 120_000, // 120 seconds
    });
  }
  return _client;
}

/**
 * Extract CV facts using OpenAI structured output with strict schema.
 * This ensures exact schema compliance - no extra fields, no missing fields, no hallucination.
 */
export async function extractCVFactsStructured(resumeText: string): Promise<CVFacts> {
  if (!env.openaiFitscoreEnabled) {
    throw new Error(
      "extractCVFactsStructured is disabled. Set OPENAI_FITSCORE_ENABLED=true to enable (not used in default FitScore pipeline).",
    );
  }
  const client = getOpenAIClient();
  const startMs = Date.now();

  logger.info("[openai] Starting structured CV facts extraction", {
    resumeLength: resumeText.length,
  });

  try {
    // Use OpenAI's structured output with strict mode
    // @ts-expect-error - beta.chat.completions.parse exists at runtime but may not be fully typed in SDK v6
    const response = await client.beta.chat.completions.parse({
      model: CV_FACTS_OPENAI_MODEL,
      messages: [
        {
          role: "user",
          content: `Extract structured facts from this resume. Return ONLY the JSON schema specified.

RESUME:
${resumeText.slice(0, 50_000)}

Extract:
- skills: array of skill names mentioned
- named_tools: specific tools/software named (e.g., "Figma", "Jira")
- named_deliverables: specific projects/products with names
- metrics: quantified outcomes (e.g., "20% increase", "100k users")
- years_per_company: array of {company, role, years} from work history
- total_years: total years of experience
- current_role: current job title
- career_trajectory: "ascending" | "lateral" | "pivoting" | "descending"
- professional_identity: brief professional summary

INDIAN MARKET CONTEXT:
- Contract roles are common (extract as normal employment, not gaps)
- Notice periods (30-90 days) are standard (extract as stated)
- Salary in LPA format is normal (e.g., "15 LPA" = 15 lakhs per annum)
- Company abbreviations are standard (e.g., "TCS", "Infy", "Wipro")
- Degree abbreviations are standard (e.g., "B.Tech", "B.E.", "MCA")`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "cv_facts",
          strict: true, // Critical: prevents extra fields and ensures exact schema match
          schema: {
            type: "object",
            properties: {
              skills: {
                type: "array",
                items: { type: "string" },
                description: "Array of skill names mentioned in the resume",
              },
              named_tools: {
                type: "array",
                items: { type: "string" },
                description: "Specific tools/software named (e.g., 'Figma', 'Jira', 'React')",
              },
              named_deliverables: {
                type: "array",
                items: { type: "string" },
                description: "Specific projects/products with names",
              },
              metrics: {
                type: "array",
                items: { type: "string" },
                description: "Quantified outcomes (e.g., '20% increase', '100k users')",
              },
              years_per_company: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    company: { type: "string" },
                    role: { type: "string" },
                    years: { type: "number" },
                  },
                  required: ["company", "role", "years"],
                  additionalProperties: false,
                },
                description: "Years spent at each company with role",
              },
              total_years: {
                type: "number",
                description: "Total years of experience",
              },
              current_role: {
                type: "string",
                description: "Current job title",
              },
              career_trajectory: {
                type: "string",
                enum: ["ascending", "lateral", "pivoting", "descending"],
                description: "Career progression pattern",
              },
              professional_identity: {
                type: "string",
                description: "Brief professional summary",
              },
            },
            required: [
              "skills",
              "named_tools",
              "named_deliverables",
              "metrics",
              "years_per_company",
              "total_years",
              "current_role",
              "career_trajectory",
              "professional_identity",
            ],
            additionalProperties: false, // Critical: no extra fields allowed
          },
        },
      },
      temperature: 0, // Deterministic output
      max_tokens: 2000,
    });

    const parsed = response.choices[0].message.parsed as CVFacts;

    // Validate and normalize the response
    const facts: CVFacts = {
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      named_tools: Array.isArray(parsed.named_tools) ? parsed.named_tools : [],
      named_deliverables: Array.isArray(parsed.named_deliverables) ? parsed.named_deliverables : [],
      metrics: Array.isArray(parsed.metrics) ? parsed.metrics : [],
      years_per_company: Array.isArray(parsed.years_per_company)
        ? parsed.years_per_company.filter(
            (ypc) =>
              typeof ypc === "object" &&
              ypc !== null &&
              typeof ypc.company === "string" &&
              typeof ypc.role === "string" &&
              typeof ypc.years === "number",
          )
        : [],
      total_years:
        typeof parsed.total_years === "number" && !Number.isNaN(parsed.total_years)
          ? parsed.total_years
          : 0,
      current_role: String(parsed.current_role ?? "").trim(),
      career_trajectory:
        parsed.career_trajectory === "ascending" ||
        parsed.career_trajectory === "lateral" ||
        parsed.career_trajectory === "pivoting" ||
        parsed.career_trajectory === "descending"
          ? parsed.career_trajectory
          : "lateral",
      professional_identity: String(parsed.professional_identity ?? "").trim() || "",
    };

    logger.info("[openai] Structured CV facts extraction completed", {
      durationMs: Date.now() - startMs,
      skillsCount: facts.skills.length,
      toolsCount: facts.named_tools.length,
      deliverablesCount: facts.named_deliverables.length,
      metricsCount: facts.metrics.length,
    });

    return facts;
  } catch (err) {
    logger.error("[openai] Structured extraction failed", {
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startMs,
    });
    throw err;
  }
}
