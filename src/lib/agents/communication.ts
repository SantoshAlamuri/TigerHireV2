import { callClaude, extractJsonObject } from "@/lib/services/anthropic";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/services/resend";
import { emailLayout } from "@/lib/services/email-templates";
import { logger } from "@/lib/observability/logger";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type MessageType = "outreach" | "status_update" | "rejection" | "interview_invite";

export interface CommunicationResult {
  candidateId: string;
  messageType: MessageType;
  emailSent: boolean;
  subject: string;
  preview: string; // first 200 chars of the generated body
  emailId?: string;
}

/* ------------------------------------------------------------------ */
/*  Agent                                                              */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are a recruitment communication agent for TigerHire. Generate personalised, professional emails for candidates.

Return ONLY valid JSON:
{
  "subject": "email subject line",
  "body": "full email body in HTML — use <p>, <strong>, <ul>/<li> for structure",
  "tone": "warm|professional|empathetic"
}

Rules:
- Keep emails concise (3-5 short paragraphs max)
- Personalise using the candidate's name, the role title, and company name
- Never use generic filler like "Dear Valued Candidate" — use their actual name
- For rejections: be kind, specific about why (if provided), encourage future applications
- For outreach: highlight what makes this role a potential fit for them
- For status updates: be clear about next steps and timeline
- For interview invites: be enthusiastic, include practical details
- Sign off as "The [Company] Hiring Team" or "TigerHire on behalf of [Company]"`;

/**
 * Run the Communication Agent to generate and send a personalised email.
 */
export async function runCommunication(params: {
  candidateId: string;
  messageType: MessageType;
  jobId?: string;
  context?: string; // optional extra context like rejection reason, interview details
  dryRun?: boolean; // generate but don't send
}): Promise<CommunicationResult> {
  const supabase = createSupabaseAdmin();

  // 1. Fetch candidate
  const { data: candidate, error: candErr } = await supabase
    .from("candidates")
    .select("id, name, full_name, email, current_role, current_company")
    .eq("id", params.candidateId)
    .single();

  if (candErr || !candidate) {
    throw new Error(candErr?.message ?? "Candidate not found");
  }

  const candidateEmail = candidate.email as string | null;
  if (!candidateEmail && !params.dryRun) {
    throw new Error("Candidate has no email address");
  }

  const candidateName = (candidate.full_name as string) || (candidate.name as string) || "there";

  // 2. Fetch job context if provided
  let jobContext = "";
  let companyName = "TigerHire";
  let organisationId: string | undefined;
  if (params.jobId) {
    const { data: job } = await supabase
      .from("jobs")
      .select("title, organisation_id")
      .eq("id", params.jobId)
      .single();
    if (job) {
      jobContext = `Role: ${job.title}`;
      organisationId = (job.organisation_id as string | null) ?? undefined;
      // Try to get company name
      const { data: org } = await supabase
        .from("organisations")
        .select("name")
        .eq("id", job.organisation_id)
        .single();
      if (org?.name) companyName = org.name;
    }
  }

  // 3. Build prompt
  const userMessage = `Generate a ${params.messageType.replace("_", " ")} email.

Candidate: ${candidateName}
${candidate.current_role ? `Current role: ${candidate.current_role}` : ""}
${candidate.current_company ? `Current company: ${candidate.current_company}` : ""}
${jobContext}
Company: ${companyName}
${params.context ? `Additional context: ${params.context}` : ""}`;

  logger.info("[communication] generating email", {
    candidateId: params.candidateId,
    messageType: params.messageType,
  });

  const response = await callClaude({
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    label: "communication-agent",
    temperature: 0.4,
    jobId: params.jobId,
    candidateId: params.candidateId,
    organisationId,
  });

  const generated = extractJsonObject(response.text, "communication-agent") as {
    subject: string;
    body: string;
    tone: string;
  };

  // 4. Send email (unless dry run)
  let emailId: string | undefined;
  if (!params.dryRun && candidateEmail) {
    const result = await sendEmail({
      to: candidateEmail,
      subject: generated.subject,
      html: emailLayout({ body: generated.body, preheader: generated.subject }),
    });
    emailId =
      result && typeof result === "object" && "data" in result
        ? ((result.data as { id?: string })?.id ?? undefined)
        : undefined;

    logger.info("[communication] email sent", {
      candidateId: params.candidateId,
      emailId,
    });
  }

  // 5. Log to agent_email_ingestion (if table exists) and agent_logs
  await supabase.from("agent_logs").insert({
    agent_name: "communication",
    status: params.dryRun ? "dry_run" : "sent",
    payload: {
      candidateId: params.candidateId,
      messageType: params.messageType,
      jobId: params.jobId ?? null,
      subject: generated.subject,
      emailId: emailId ?? null,
      tone: generated.tone,
    },
  });

  // Log to agent_email_ingestion if the table exists
  if (params.jobId && !params.dryRun) {
    await supabase
      .from("agent_email_ingestion")
      .insert({
        job_id: params.jobId,
        candidate_id: params.candidateId,
        message_type: params.messageType,
        subject: generated.subject,
        email_id: emailId ?? null,
        sent_at: new Date().toISOString(),
      })
      .then(({ error }) => {
        // Non-fatal — table may not exist yet
        if (error) {
          logger.warn("[communication] agent_email_ingestion insert failed (table may not exist)", {
            error: error.message,
          });
        }
      });
  }

  const preview = generated.body.replace(/<[^>]+>/g, "").slice(0, 200);

  return {
    candidateId: params.candidateId,
    messageType: params.messageType,
    emailSent: !params.dryRun && !!candidateEmail,
    subject: generated.subject,
    preview,
    emailId,
  };
}
