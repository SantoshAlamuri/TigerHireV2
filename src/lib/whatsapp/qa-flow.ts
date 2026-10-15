import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import type { CandidateJobPreferences } from "@/lib/preferences/types";
import {
  getCandidatePreferences,
  upsertCandidatePreferences,
} from "@/lib/preferences/get-preferences";
import { withSessionCAS, type WhatsAppSession } from "./sessions";
import { runImmediateMatchAfterPreferences } from "./immediate-match";

const QUESTIONS: string[] = [
  "What type of role are you looking for? (e.g. Scrum Master, Backend Engineer, Product Manager)",
  "Which city are you based in, or are you open to remote? (e.g. Bangalore, Mumbai, Remote)",
  "How many years of experience do you have? (e.g. 5)",
  "What is your expected salary range in LPA? (e.g. 15-25)",
  "What is your notice period? (e.g. Immediate, 30 days, 60 days)",
];

function parseSalaryLpa(raw: string): { min?: number; max?: number } {
  const t = raw.trim().toLowerCase().replace(/\s+/g, "");
  const m = t.match(/(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)/);
  if (m) {
    return { min: parseFloat(m[1]), max: parseFloat(m[2]) };
  }
  const single = t.match(/(\d+(?:\.\d+)?)/);
  if (single) {
    const v = parseFloat(single[1]);
    return { min: v, max: v };
  }
  return {};
}

function parseNoticeDays(raw: string): number | null {
  const t = raw.trim().toLowerCase();
  if (/immediate|notice\s*period\s*0|no\s*notice/.test(t)) return 0;
  const m = t.match(/(\d+)\s*(day|days)?/);
  if (m) return parseInt(m[1], 10);
  return null;
}

function seniorityFromYearsText(raw: string): string[] | undefined {
  const m = raw.match(/(\d+(?:\.\d+)?)/);
  if (!m) return undefined;
  const y = parseFloat(m[1]);
  if (y <= 3) return ["Junior", "Mid"];
  if (y <= 8) return ["Mid", "Senior"];
  return ["Senior", "Lead"];
}

function mergeAnswerIntoPreferences(
  prefs: CandidateJobPreferences | null,
  step: number,
  answer: string,
): CandidateJobPreferences {
  const base: CandidateJobPreferences = {
    ...(prefs ?? {}),
    whatsapp_qa: { ...(prefs?.whatsapp_qa ?? {}) },
  };
  const trimmed = answer.trim();
  const qa = { ...base.whatsapp_qa! };

  switch (step) {
    case 0:
      qa.role_family = trimmed;
      break;
    case 1:
      qa.location_raw = trimmed;
      if (trimmed.toLowerCase().includes("remote")) {
        base.remote_preference = "remote";
        base.preferred_locations = ["Remote"];
      } else {
        base.preferred_locations = [trimmed];
      }
      break;
    case 2:
      qa.experience_raw = trimmed;
      base.preferred_seniority = seniorityFromYearsText(trimmed);
      break;
    case 3:
      qa.salary_lpa_raw = trimmed;
      {
        const { min, max } = parseSalaryLpa(trimmed);
        if (min != null) base.salary_min_lpa = min;
        if (max != null) base.salary_max_lpa = max;
      }
      break;
    case 4:
      qa.notice_period_days = parseNoticeDays(trimmed);
      break;
    default:
      break;
  }

  base.whatsapp_qa = qa;
  return base;
}

export async function startPreferenceQuestions(
  phone: string,
  context: Record<string, unknown>,
  candidateId: string,
): Promise<void> {
  await withSessionCAS(phone, () => ({
    state: "collecting_preferences",
    context: { ...context, candidate_id: candidateId },
    extras: { qa_step: 0 },
  }));
  await sendWhatsAppMessage(phone, `Q1: ${QUESTIONS[0]}`);
}

export async function handleCollectingPreferencesReply(
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

  let step = session.qa_step ?? 0;
  if (step < 0) step = 0;
  if (step >= QUESTIONS.length) {
    await runImmediateMatchAfterPreferences(phone, session);
    return;
  }

  const existing = await getCandidatePreferences(supabase, candidateId);
  const merged = mergeAnswerIntoPreferences(existing, step, text);
  await upsertCandidatePreferences(supabase, candidateId, merged);

  const nextStep = step + 1;
  if (nextStep < QUESTIONS.length) {
    await withSessionCAS(phone, () => ({
      state: "collecting_preferences",
      context: session.context,
      extras: { qa_step: nextStep },
    }));
    await sendWhatsAppMessage(phone, `Q${nextStep + 1}: ${QUESTIONS[nextStep]}`);
    return;
  }

  await withSessionCAS(phone, () => ({
    state: "preferences_complete",
    context: session.context,
    extras: { qa_step: nextStep },
  }));
  await sendWhatsAppMessage(phone, "Got it! Let me check for matching roles now…");
  await runImmediateMatchAfterPreferences(phone, {
    ...session,
    session_state: "preferences_complete",
    context: session.context,
    qa_step: nextStep,
  });
}
