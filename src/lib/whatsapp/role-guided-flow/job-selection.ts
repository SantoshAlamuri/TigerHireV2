import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { withSessionCAS, type WhatsAppSession } from "../sessions";
import { startScreeningQuestionsForRole } from "../screening-qa-flow";
import { asJobOptions, parseNumericChoice } from "./parsers";
import { createApplicationForRolePick } from "./application";
import { scoreAndPresentSelectedRole } from "./scoring";

export async function handleRoleJobSelectionReply(
  phone: string,
  text: string,
  session: WhatsAppSession,
): Promise<void> {
  const supabase = createSupabaseAdmin();
  const candidateId = session.context?.candidate_id as string | undefined;
  if (!candidateId) {
    await sendWhatsAppMessage(phone, "We lost your session. Please send your CV again as a PDF.");
    await withSessionCAS(phone, () => ({
      state: "cv_requested",
      context: { ...session.context },
    }));
    return;
  }

  const jobOptions = asJobOptions(session.context?.guided_job_options);
  if (jobOptions.length === 0) {
    await sendWhatsAppMessage(phone, "Please pick a role category first.");
    await withSessionCAS(phone, () => ({
      state: "role_family_selection",
      context: session.context,
      extras: { qa_step: 0 },
    }));
    return;
  }

  const picked = parseNumericChoice(text, jobOptions.length);
  if (!picked) {
    const lines = jobOptions.map((j, idx) => `${idx + 1}. ${j.title} — ${j.location}`);
    await sendWhatsAppMessage(
      phone,
      `Please reply with a number from the list (1-${jobOptions.length}):\n\n${lines.join("\n")}`,
    );
    return;
  }

  const selected = jobOptions[picked - 1];
  const applyResult = await createApplicationForRolePick(
    supabase,
    phone,
    candidateId,
    selected.id,
    session.context ?? {},
  );
  if (!applyResult.ok) {
    await sendWhatsAppMessage(phone, applyResult.message);
    return;
  }

  const processingContext = {
    ...session.context,
    candidate_id: candidateId,
    selected_job_id: selected.id,
    selected_role_family: session.context?.selected_role_family,
    application_created_at: new Date().toISOString(),
  };

  const { data: selectedJob } = await supabase
    .from("jobs")
    .select("*, organisation_id")
    .eq("id", selected.id)
    .eq("status", "open")
    .maybeSingle();

  if (!selectedJob) {
    await sendWhatsAppMessage(
      phone,
      "That role is no longer open. Please pick another role from the list.",
    );
    return;
  }

  // Canonical screening questions (always-on, all channels): if this job has active
  // job_screening_questions, collect YES/NO answers over WhatsApp BEFORE scoring.
  // The application row was just created above, so the answers writer + canonical
  // FitScore gate can find them. knockout -> no score; complete -> score; else ask.
  await sendWhatsAppMessage(
    phone,
    `Got it — you've applied to *${applyResult.title}*. If this role has quick screening questions, answer those first and then I'll score your fit.`,
  );
  const screeningOutcome = await startScreeningQuestionsForRole({
    phone,
    candidateId,
    jobId: selected.id,
    jobTitle: applyResult.title,
    context: { ...processingContext, qa_step: 2 },
  });
  if (screeningOutcome === "asking") {
    return;
  }

  await scoreAndPresentSelectedRole({
    phone,
    candidateId,
    selected,
    selectedJob: selectedJob as Record<string, unknown>,
    processingContext,
    sessionContext: session.context ?? {},
    qaStep: session.qa_step ?? 2,
    applyTitle: applyResult.title,
    introMessage: null,
  });
}
