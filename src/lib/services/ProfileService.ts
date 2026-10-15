import type { SupabaseClient } from "@supabase/supabase-js";
import { ProfileRepository } from "@/lib/repositories/ProfileRepository";
import { normalizeReferrerWhatsapp } from "@/lib/referrers/normalize-whatsapp";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getCandidatePreferences,
  upsertCandidatePreferences,
} from "@/lib/preferences/get-preferences";
import type { CandidateJobPreferences } from "@/lib/preferences/types";

const PROFILE_CANDIDATE_COLUMNS =
  "id, user_id, name, full_name, current_role, current_company, location, experience_years, seniority_level, salary_expectation_min, salary_expectation_max, visibility, skills, resume_url, linkedin_url, portfolio_url, github_url, updated_at";

async function updateCandidateForUser(userId: string, candidateUpdate: Record<string, unknown>) {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("candidates")
    .update({ ...candidateUpdate, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select(PROFILE_CANDIDATE_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { data, missing: data == null };
}

async function createCandidateForUser(userId: string, candidateUpdate: Record<string, unknown>) {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("candidates")
    .insert({
      ...candidateUpdate,
      user_id: userId,
      visibility: candidateUpdate.visibility ?? true,
      updated_at: new Date().toISOString(),
    })
    .select(PROFILE_CANDIDATE_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

type ReferrerRecord = {
  id: string;
  name: string | null;
  type: string | null;
  city: string | null;
  whatsapp_number: string | null;
  whatsapp_verified: boolean | null;
  work_email: string | null;
  linkedin_url: string | null;
  upi_id: string | null;
  status: string | null;
  user_id: string | null;
  candidate_id: string | null;
};

async function getReferrerForUser(
  supabase: SupabaseClient,
  userId: string,
  candidateId?: string | null,
): Promise<ReferrerRecord | null> {
  const { data: byUser } = await supabase
    .from("referrers")
    .select(
      "id, name, type, city, whatsapp_number, whatsapp_verified, work_email, linkedin_url, upi_id, status, user_id, candidate_id",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (byUser) return byUser as ReferrerRecord;

  if (candidateId) {
    const { data: byCandidate } = await supabase
      .from("referrers")
      .select(
        "id, name, type, city, whatsapp_number, whatsapp_verified, work_email, linkedin_url, upi_id, status, user_id, candidate_id",
      )
      .eq("candidate_id", candidateId)
      .maybeSingle();
    if (byCandidate) return byCandidate as ReferrerRecord;
  }
  return null;
}

export const ProfileService = {
  async get(supabase: SupabaseClient, userId: string, role: string) {
    const profile = await ProfileRepository.getById(supabase, userId);

    let candidateRecord = null;
    if (role === "candidate_pro" || role === "candidate_free") {
      const { data } = await supabase
        .from("candidates")
        .select(PROFILE_CANDIDATE_COLUMNS)
        .eq("user_id", userId)
        .single();
      candidateRecord = data;
    }
    const referrerRecord = await getReferrerForUser(
      supabase,
      userId,
      candidateRecord?.id as string | undefined,
    );
    const referrerOut = referrerRecord
      ? {
          ...referrerRecord,
          whatsapp_verified: Boolean(referrerRecord.whatsapp_verified),
        }
      : null;

    const preferences = candidateRecord
      ? await getCandidatePreferences(supabase, candidateRecord.id)
      : null;
    // Candidate dashboard reads skills, experience, etc. from "profile" — merge candidate row into it
    const outProfile =
      candidateRecord != null
        ? {
            ...profile,
            skills: candidateRecord.skills ?? null,
            experience_years: candidateRecord.experience_years ?? null,
            role_title: candidateRecord.current_role ?? null,
            current_company: candidateRecord.current_company ?? null,
            location: candidateRecord.location ?? null,
            seniority_level: candidateRecord.seniority_level ?? null,
            salary_min: candidateRecord.salary_expectation_min ?? null,
            salary_max: candidateRecord.salary_expectation_max ?? null,
            resume_url: candidateRecord.resume_url ?? null,
            visibility: candidateRecord.visibility ?? null,
            name: candidateRecord.name ?? null,
            full_name:
              candidateRecord.full_name ?? candidateRecord.name ?? profile?.full_name ?? null,
            linkedin_url: candidateRecord.linkedin_url ?? null,
            portfolio_url: candidateRecord.portfolio_url ?? null,
            github_url: candidateRecord.github_url ?? null,
            remote_preference: preferences?.remote_preference ?? "any",
          }
        : profile;

    return { profile: outProfile, candidate: candidateRecord, referrer: referrerOut };
  },

  async update(
    supabase: SupabaseClient,
    userId: string,
    role: string,
    body: Record<string, unknown>,
  ) {
    const profileUpdate: Record<string, unknown> = {};
    const nameValue =
      typeof body.name === "string"
        ? body.name
        : typeof body.fullName === "string"
          ? body.fullName
          : undefined;
    if (nameValue !== undefined) profileUpdate.full_name = nameValue;
    if (typeof body.avatarUrl === "string") profileUpdate.avatar_url = body.avatarUrl;

    const candidateUpdate: Record<string, unknown> = {};
    if (role === "candidate_pro" || role === "candidate_free") {
      if (typeof body.name === "string") {
        candidateUpdate.name = body.name;
        candidateUpdate.full_name = body.name;
      } else if (typeof body.fullName === "string") {
        candidateUpdate.name = body.fullName;
        candidateUpdate.full_name = body.fullName;
      }
      if (typeof body.roleTitle === "string") {
        candidateUpdate.current_role = body.roleTitle;
      }
      if (typeof body.currentCompany === "string")
        candidateUpdate.current_company = body.currentCompany;
      if (typeof body.location === "string") candidateUpdate.location = body.location;
      if (typeof body.experienceYears === "number")
        candidateUpdate.experience_years = body.experienceYears;
      if (typeof body.seniorityLevel === "string")
        candidateUpdate.seniority_level = body.seniorityLevel;
      if (typeof body.salaryMin === "number")
        candidateUpdate.salary_expectation_min = body.salaryMin;
      if (typeof body.salaryMax === "number")
        candidateUpdate.salary_expectation_max = body.salaryMax;
      if (typeof body.visibility === "boolean") candidateUpdate.visibility = body.visibility;
      if (Array.isArray(body.skills)) candidateUpdate.skills = body.skills;
      if (typeof body.linkedinUrl === "string") candidateUpdate.linkedin_url = body.linkedinUrl;
      if (typeof body.portfolioUrl === "string") candidateUpdate.portfolio_url = body.portfolioUrl;
      if (typeof body.githubUrl === "string") candidateUpdate.github_url = body.githubUrl;
    }

    const hasProfilePatch = Object.keys(profileUpdate).length > 0;
    const hasCandidatePatch = Object.keys(candidateUpdate).length > 0;
    const hasReferrerPatch =
      typeof body.referrerType === "string" ||
      typeof body.referrerCity === "string" ||
      typeof body.referrerWhatsapp === "string" ||
      typeof body.referrerWorkEmail === "string" ||
      typeof body.referrerLinkedinUrl === "string" ||
      typeof body.referrerUpiId === "string";

    const saveWorkPreference = async (candidateId?: string) => {
      if (
        !candidateId ||
        typeof body.remotePreference !== "string" ||
        !["candidate_free", "candidate_pro"].includes(role)
      )
        return;
      const existing = await getCandidatePreferences(supabase, candidateId);
      await upsertCandidatePreferences(supabase, candidateId, {
        ...existing,
        remote_preference: body.remotePreference as CandidateJobPreferences["remote_preference"],
      });
    };

    const loadOrUpdateProfile = () =>
      hasProfilePatch
        ? ProfileRepository.update(supabase, userId, profileUpdate)
        : ProfileRepository.getById(supabase, userId);

    let candidateRecord: Record<string, unknown> | null = null;
    if (hasCandidatePatch) {
      const [updated, candidateResult] = await Promise.all([
        loadOrUpdateProfile(),
        updateCandidateForUser(userId, candidateUpdate),
      ]);
      candidateRecord =
        candidateResult.data ??
        (candidateResult.missing ? await createCandidateForUser(userId, candidateUpdate) : null);
      await saveWorkPreference(candidateRecord?.id as string | undefined);

      let referrerRecord: ReferrerRecord | null = null;
      if (hasReferrerPatch) {
        const existingReferrer = await getReferrerForUser(
          supabase,
          userId,
          (candidateRecord?.id as string | undefined) ?? null,
        );
        const incomingName =
          typeof body.name === "string"
            ? body.name.trim()
            : typeof body.fullName === "string"
              ? body.fullName.trim()
              : "";
        const mergedName =
          incomingName ||
          (existingReferrer?.name ?? "").trim() ||
          ((candidateRecord?.full_name as string | undefined) ?? "").trim() ||
          ((candidateRecord?.name as string | undefined) ?? "").trim() ||
          "Referrer";
        const incomingWhatsappRaw =
          typeof body.referrerWhatsapp === "string" ? body.referrerWhatsapp : "";
        const nextWhatsappNorm = incomingWhatsappRaw
          ? normalizeReferrerWhatsapp(incomingWhatsappRaw)
          : normalizeReferrerWhatsapp(existingReferrer?.whatsapp_number ?? "");
        const currentWhatsappNorm = normalizeReferrerWhatsapp(
          existingReferrer?.whatsapp_number ?? "",
        );
        const whatsappChanged = nextWhatsappNorm !== currentWhatsappNorm;
        const nextType =
          typeof body.referrerType === "string" && body.referrerType.trim().length > 0
            ? body.referrerType.trim()
            : (existingReferrer?.type ?? "individual");
        const nextCity =
          typeof body.referrerCity === "string"
            ? body.referrerCity.trim() || null
            : (existingReferrer?.city ?? null);
        const nextWorkEmail =
          typeof body.referrerWorkEmail === "string"
            ? body.referrerWorkEmail.trim().toLowerCase() || null
            : (existingReferrer?.work_email ?? null);
        const nextLinkedin =
          typeof body.referrerLinkedinUrl === "string"
            ? body.referrerLinkedinUrl.trim() || null
            : (existingReferrer?.linkedin_url ?? null);
        const nextUpi =
          typeof body.referrerUpiId === "string"
            ? body.referrerUpiId.trim() || null
            : (existingReferrer?.upi_id ?? null);
        const nextStatus = whatsappChanged
          ? "pending"
          : (existingReferrer?.status ?? (nextWhatsappNorm ? "active" : "pending"));
        const nextVerified = whatsappChanged ? false : Boolean(existingReferrer?.whatsapp_verified);

        if (existingReferrer?.id) {
          const { data: updatedReferrer } = await supabase
            .from("referrers")
            .update({
              name: mergedName,
              type: nextType,
              city: nextCity,
              whatsapp_number: nextWhatsappNorm || null,
              whatsapp_verified: nextVerified,
              work_email: nextWorkEmail,
              linkedin_url: nextLinkedin,
              upi_id: nextUpi,
              status: nextStatus,
              user_id: userId,
              candidate_id:
                (candidateRecord?.id as string | undefined) ?? existingReferrer.candidate_id,
            })
            .eq("id", existingReferrer.id)
            .select(
              "id, name, type, city, whatsapp_number, whatsapp_verified, work_email, linkedin_url, upi_id, status, user_id, candidate_id",
            )
            .maybeSingle();
          referrerRecord = (updatedReferrer as ReferrerRecord | null | undefined) ?? null;
        } else {
          const { data: insertedReferrer } = await supabase
            .from("referrers")
            .insert({
              name: mergedName,
              type: nextType,
              city: nextCity,
              whatsapp_number: nextWhatsappNorm || null,
              whatsapp_verified: false,
              work_email: nextWorkEmail,
              linkedin_url: nextLinkedin,
              upi_id: nextUpi,
              status: nextWhatsappNorm ? "pending" : "pending",
              user_id: userId,
              candidate_id: (candidateRecord?.id as string | undefined) ?? null,
            })
            .select(
              "id, name, type, city, whatsapp_number, whatsapp_verified, work_email, linkedin_url, upi_id, status, user_id, candidate_id",
            )
            .maybeSingle();
          referrerRecord = (insertedReferrer as ReferrerRecord | null | undefined) ?? null;
        }
      } else {
        referrerRecord = await getReferrerForUser(
          supabase,
          userId,
          (candidateRecord?.id as string | undefined) ?? null,
        );
      }

      return { profile: updated, candidate: candidateRecord, referrer: referrerRecord };
    }

    const updated = await loadOrUpdateProfile();
    const existingCandidate = await supabase
      .from("candidates")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    const referrerRecord = await getReferrerForUser(
      supabase,
      userId,
      (existingCandidate.data?.id as string | undefined) ?? null,
    );
    await saveWorkPreference(existingCandidate.data?.id as string | undefined);
    return { profile: updated, candidate: null, referrer: referrerRecord };
  },
};
