import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import {
  getCandidatePreferences,
  upsertCandidatePreferences,
} from "@/lib/preferences/get-preferences";
import { withSessionCAS, type WhatsAppSession } from "../sessions";
import { fetchCandidateMenuOpenJobs, titleCaseRoleFunction } from "../candidate-menu-jobs";
import { MAX_JOB_OPTIONS } from "./types";
import { asRoleOptions, parseNumericChoice } from "./parsers";
import { filterJobsForCategory, formatCategoryMenuLines } from "./helpers";
import { startRoleGuidedFlow } from "./start-flow";

export async function handleRoleFamilySelectionReply(
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

  const roleOptions = asRoleOptions(session.context?.guided_role_options);
  if (roleOptions.length === 0) {
    await startRoleGuidedFlow(phone, session.context, candidateId);
    return;
  }

  const picked = parseNumericChoice(text, roleOptions.length);
  if (!picked) {
    await sendWhatsAppMessage(
      phone,
      `Please reply with a number from the list (1-${roleOptions.length}):\n\n${formatCategoryMenuLines(roleOptions)}`,
    );
    return;
  }

  const chosen = roleOptions[picked - 1];
  const menuJobs = await fetchCandidateMenuOpenJobs(supabase);
  const matching = filterJobsForCategory(menuJobs, chosen).slice(0, MAX_JOB_OPTIONS);

  const jobOptions = matching.map((j) => ({
    id: j.id,
    title: j.title,
    location: j.location?.trim() || "—",
    roleFunction: j.role_function,
  }));

  if (jobOptions.length === 0) {
    await sendWhatsAppMessage(
      phone,
      `No active jobs are currently open for "${chosen.label}". Please pick another role category.\n\n${formatCategoryMenuLines(roleOptions)}`,
    );
    return;
  }

  const existing = await getCandidatePreferences(supabase, candidateId);
  const merged = {
    ...(existing ?? {}),
    preferred_role_functions:
      chosen.matchField === "role_function"
        ? [titleCaseRoleFunction(chosen.matchValue)]
        : existing?.preferred_role_functions,
    whatsapp_qa: {
      ...(existing?.whatsapp_qa ?? {}),
      role_family: chosen.label,
    },
  };
  await upsertCandidatePreferences(supabase, candidateId, merged);

  const lines = jobOptions.map((j, idx) => `${idx + 1}. ${j.title} — ${j.location}`);
  await withSessionCAS(phone, () => ({
    state: "role_job_selection",
    context: {
      ...session.context,
      candidate_id: candidateId,
      selected_role_family: chosen.label,
      guided_job_options: jobOptions,
    },
    extras: { qa_step: 1 },
  }));
  await sendWhatsAppMessage(
    phone,
    `Nice choice: ${chosen.label}.\n\nPick the specific role you want me to evaluate first:\n\n${lines.join("\n")}\n\nReply with a number.`,
  );
}
