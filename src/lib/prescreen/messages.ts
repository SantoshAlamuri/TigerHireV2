/** Candidate-facing prescreen copy. Kept separate so it can be tuned without touching logic. */

export function screeningUploadIntro(params: {
  companyName: string;
  jobTitle: string;
  totalQuestions: number;
  candidateFirstName?: string | null;
}): string {
  const q =
    params.totalQuestions === 1 ? "1 quick question" : `${params.totalQuestions} quick questions`;
  const greeting = params.candidateFirstName?.trim()
    ? `Hi ${params.candidateFirstName.trim()}, `
    : "";
  return `${greeting}${params.companyName} is hiring for ${params.jobTitle}. Before we review your profile, ${q} to confirm a few requirements. Please reply YES or NO to each.`;
}

export function postShortlistIntro(params: {
  companyName: string;
  jobTitle: string;
  totalQuestions: number;
  candidateFirstName?: string | null;
}): string {
  const q =
    params.totalQuestions === 1 ? "1 quick question" : `${params.totalQuestions} quick questions`;
  const greeting = params.candidateFirstName?.trim()
    ? `Hi ${params.candidateFirstName.trim()}, `
    : "";
  return `${greeting}great news — you've been shortlisted for ${params.jobTitle} at ${params.companyName}. The hiring team has ${q} before the next step. Please reply YES or NO to each.`;
}

export function postShortlistComplete(jobTitle: string): string {
  return `Thanks — that's all the questions for ${jobTitle}. The hiring team has your answers and will be in touch with next steps.`;
}

export function prescreenIntro(jobTitle: string, total: number): string {
  const q = total === 1 ? "1 quick question" : `${total} quick questions`;
  return `Thanks for applying to ${jobTitle}. Before we review your profile, ${q} to confirm a few must-haves. Please reply YES or NO to each.`;
}

export function prescreenQuestionText(index: number, total: number, questionText: string): string {
  return `(${index + 1}/${total}) ${questionText}\n\nReply YES or NO.`;
}

/** Question text for any answer type: numbered options for single_select, else YES/NO. */
export function screeningQuestionText(
  index: number,
  total: number,
  questionText: string,
  options?: string[] | null,
): string {
  const head = `(${index + 1}/${total}) ${questionText}`;
  if (options && options.length > 0) {
    const list = options.map((o, i) => `${i + 1}) ${o}`).join("\n");
    return `${head}\n\n${list}\n\nReply with the number (e.g. 1).`;
  }
  return `${head}\n\nReply YES or NO.`;
}

export function prescreenReminder(jobTitle: string): string {
  return `Just a reminder about your application to ${jobTitle} — please reply YES or NO to the previous question so we can review your profile.`;
}

/** Apply stage: candidate got the first-contact template but hasn't consented yet (no question was sent). */
export function prescreenConsentReminder(jobTitle: string): string {
  return `Just a reminder about your application to ${jobTitle} — reply YES when you're ready and we'll send a few quick screening questions so we can review your profile.`;
}

/** Post-shortlist: candidate got the shortlist template but hasn't replied yet. */
export function postShortlistConsentReminder(jobTitle: string, totalQuestions: number): string {
  const q =
    totalQuestions === 1 ? "1 quick YES/NO question" : `${totalQuestions} quick YES/NO questions`;
  return `Just a reminder — you were shortlisted for ${jobTitle}. Reply to this message when you have a moment and we'll send ${q} for the hiring team.`;
}

/** Post-shortlist: candidate started Q&A but hasn't answered the latest question. */
export function postShortlistQuestionReminder(jobTitle: string): string {
  return `Quick reminder about your ${jobTitle} shortlist — please reply YES or NO to the last question so we can pass your answers to the hiring team.`;
}

/** Post-shortlist lifecycle timeout — no gate change; recruiter may follow up manually. */
export function postShortlistTimeoutAck(jobTitle: string): string {
  return `Thanks for your interest in ${jobTitle}. We didn't get all your screening answers on WhatsApp — the hiring team still has your shortlist and may follow up if needed.`;
}

export function prescreenPassed(jobTitle: string): string {
  return `Thanks — that's everything we needed for ${jobTitle}. Your profile is now with the hiring team.`;
}

export function prescreenFailed(jobTitle: string): string {
  return `Thanks for your interest in ${jobTitle}. Based on your answers, this role isn't a match on the must-have requirements right now. We'll keep your profile for other roles.`;
}

export function prescreenTimeoutAck(jobTitle: string): string {
  return `We've gone ahead and shared your profile for ${jobTitle} with the hiring team. Some must-haves are marked unverified; the team may follow up.`;
}
