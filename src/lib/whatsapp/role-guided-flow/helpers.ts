import type { JobData } from "@/lib/fitscore/types";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { withSessionCAS } from "../sessions";
import {
  isCandidateMenuEligibleJob,
  normalizeRoleFunctionKey,
  titleCaseRoleFunction,
  type CandidateMenuJob,
} from "../candidate-menu-jobs";
import { MAX_ROLE_OPTIONS, type RoleOption } from "./types";

export function addMonths(d: Date, months: number): string {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x.toISOString();
}

export function candidateForScore(candidate: Record<string, unknown>) {
  return {
    id: String(candidate.id ?? ""),
    name: (candidate.name ?? candidate.full_name) as string | null,
    skills: (candidate.skills as string[]) ?? [],
    experience_years: candidate.experience_years as number | null,
    location: candidate.location as string | null,
    intent_score: null,
    resume_url: candidate.resume_url as string | null,
    updated_at: candidate.updated_at as string | null,
  };
}

export function toJobData(job: Record<string, unknown>): JobData {
  return {
    id: String(job.id ?? ""),
    title: String(job.title ?? ""),
    description: String(job.description ?? ""),
    location: (job.location as string) ?? null,
    status: String(job.status ?? "open"),
    compensation_min: job.compensation_min as number | null,
    compensation_max: job.compensation_max as number | null,
    organisation_id: String(job.organisation_id ?? ""),
  };
}

export function buildRoleOptionsFromJobs(list: CandidateMenuJob[]): RoleOption[] {
  const groups = new Map<string, RoleOption>();
  for (const job of list) {
    const roleFnKey = normalizeRoleFunctionKey(job.role_function);
    const title = (job.title ?? "").trim();
    if (!roleFnKey && !title) continue;
    const matchField: "role_function" | "title" = roleFnKey ? "role_function" : "title";
    const matchValue = roleFnKey || title;
    const label = roleFnKey ? titleCaseRoleFunction(roleFnKey) : title;
    const key = `${matchField}:${matchValue}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, {
        label,
        matchField,
        matchValue,
        count: 1,
      });
    }
  }
  return Array.from(groups.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_ROLE_OPTIONS);
}

export function formatCategoryMenuLines(roleOptions: RoleOption[]): string {
  return roleOptions.map((r, idx) => `${idx + 1}. ${r.label} (${r.count} open)`).join("\n");
}

export async function presentCategoryMenu(
  phone: string,
  context: Record<string, unknown>,
  candidateId: string,
  roleOptions: RoleOption[],
): Promise<void> {
  await withSessionCAS(phone, () => ({
    state: "role_family_selection",
    context: { ...context, candidate_id: candidateId, guided_role_options: roleOptions },
    extras: { qa_step: 0 },
  }));
  await sendWhatsAppMessage(
    phone,
    `Great — here are role categories currently open:\n\n${formatCategoryMenuLines(roleOptions)}\n\nReply with a number to pick your role.`,
  );
}

export function filterJobsForCategory(
  list: CandidateMenuJob[],
  chosen: RoleOption,
): CandidateMenuJob[] {
  return list.filter((job) => {
    if (!isCandidateMenuEligibleJob(job)) return false;
    if (chosen.matchField === "role_function") {
      return normalizeRoleFunctionKey(job.role_function) === chosen.matchValue;
    }
    return job.title.toLowerCase().includes(chosen.matchValue.toLowerCase());
  });
}
