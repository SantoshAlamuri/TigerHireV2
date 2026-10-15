import { z } from "zod";
import { MODELS } from "@/lib/config/models";
import { callClaude, extractJsonObject } from "@/lib/services/anthropic";

/**
 * Interview-scorecard summariser. Distinct from the screening summariser
 * (src/lib/screening/extract-summary.ts), which extracts CTC/notice-period for a pre-screen call.
 * This produces a panel-interview scorecard from a live-interview transcript captured by the
 * Recall notetaker.
 */

const signalEnum = z.enum(["strong", "moderate", "weak", "not_assessed"]);

export const interviewSummarySchema = z.object({
  overall_recommendation: z.enum(["advance", "hold", "reject", "no_data"]),
  summary: z.string(),
  strengths: z.array(z.string()),
  concerns: z.array(z.string()),
  competency_signals: z.object({
    communication: signalEnum,
    technical: signalEnum,
    role_fit: signalEnum,
  }),
  notable_quotes: z.array(z.string()),
  follow_up_questions: z.array(z.string()),
});

export type InterviewSummary = z.infer<typeof interviewSummarySchema>;

export interface InterviewSummaryContext {
  roleTitle: string;
  stageName?: string | null;
  jdSummary?: string | null;
  candidateName?: string | null;
  transcript: string;
}

function buildPrompt(context: InterviewSummaryContext): string {
  return `You are analyzing the transcript of a live job interview for the role: ${context.roleTitle}.
Interview stage: ${context.stageName ?? "Interview"}
Candidate: ${context.candidateName ?? "the candidate"}

Job context (may be brief or empty):
${(context.jdSummary ?? "").slice(0, 1200) || "(no job description provided)"}

Produce an interviewer scorecard from the transcript below. Base every field strictly on what was
said — do not invent facts. If the transcript is empty or uninformative, set overall_recommendation
to "no_data" and leave arrays empty. Return JSON only, no markdown and no commentary:
{
  "overall_recommendation": "advance" | "hold" | "reject" | "no_data",
  "summary": "2-4 sentence neutral synopsis of how the interview went",
  "strengths": ["short, specific strength", "..."],
  "concerns": ["short, specific concern or gap", "..."],
  "competency_signals": {
    "communication": "strong" | "moderate" | "weak" | "not_assessed",
    "technical": "strong" | "moderate" | "weak" | "not_assessed",
    "role_fit": "strong" | "moderate" | "weak" | "not_assessed"
  },
  "notable_quotes": ["one verbatim candidate quote (max 30 words)", "..."],
  "follow_up_questions": ["question a next-round interviewer should probe", "..."]
}

Transcript:
${context.transcript}`;
}

export async function extractInterviewSummary(args: {
  context: InterviewSummaryContext;
  attribution?: { jobId?: string; candidateId?: string; organisationId?: string };
}): Promise<InterviewSummary> {
  const response = await callClaude({
    model: MODELS.HAIKU,
    max_tokens: 1600,
    temperature: 0,
    label: "interview-summary-extraction-v1",
    jobId: args.attribution?.jobId,
    candidateId: args.attribution?.candidateId,
    organisationId: args.attribution?.organisationId,
    messages: [{ role: "user", content: buildPrompt(args.context) }],
  });

  const raw = extractJsonObject(response.text, "interview-summary-extraction-v1");
  return interviewSummarySchema.parse(raw);
}
