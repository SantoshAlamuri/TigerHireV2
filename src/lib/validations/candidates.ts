import { z } from "zod";
import { optionalWebUrl } from "@/lib/candidate/career-profile";

export const candidateQuerySchema = z.object({
  search: z.string().max(200).optional(),
  skills: z.string().max(500).optional(),
  location: z.string().max(200).optional(),
  minIntentScore: z.coerce.number().int().min(0).max(100).optional(),
  minExperience: z.coerce.number().min(0).optional(),
  maxExperience: z.coerce.number().min(0).optional(),
  /** Only candidates with a non-test FitScore for this job (job must belong to your org scope). */
  jobId: z.string().uuid().optional(),
  /** Only candidates scored against jobs with this role_function (e.g. Engineering), case-insensitive. */
  roleFunction: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
  sortBy: z.enum(["intent_score", "experience_years", "created_at"]).default("intent_score"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const updateCandidateSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  email: z.string().email().max(320).optional(),
  phone: z.string().trim().max(50).optional(),
  skills: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
  experienceYears: z.number().min(0).max(50).optional(),
  location: z.string().trim().max(200).optional(),
  visibility: z.boolean().optional(),
});

export const unlockCandidateSchema = z.object({
  jobId: z.string().uuid("Valid job ID required"),
});

export const profilePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    fullName: z.string().trim().min(1).max(200).optional(),
    avatarUrl: z.string().url().max(500).optional(),
    phone: z.string().trim().max(50).optional(),
    roleTitle: z.string().trim().min(1).max(200).optional(),
    currentCompany: z.string().trim().max(200).optional(),
    location: z.string().trim().min(1).max(200).optional(),
    remotePreference: z.enum(["onsite", "hybrid", "remote", "any"]).optional(),
    experienceYears: z.number().min(0).max(60).optional(),
    seniorityLevel: z.string().trim().min(1).max(100).optional(),
    salaryMin: z.number().min(0).max(1_000_000_000).optional(),
    salaryMax: z.number().min(0).max(1_000_000_000).optional(),
    visibility: z.boolean().optional(),
    skills: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
    linkedinUrl: optionalWebUrl.optional(),
    portfolioUrl: optionalWebUrl.optional(),
    githubUrl: optionalWebUrl.optional(),
    referrerType: z.enum(["individual", "agency"]).optional(),
    referrerWhatsapp: z.string().trim().max(40).optional(),
    referrerCity: z.string().trim().max(120).optional(),
    referrerWorkEmail: z.union([z.string().trim().email().max(320), z.literal("")]).optional(),
    referrerLinkedinUrl: z.string().trim().max(500).optional(),
    referrerUpiId: z.string().trim().max(200).optional(),
  })
  .passthrough();

export type CandidateQueryInput = z.infer<typeof candidateQuerySchema>;
export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;
export type UnlockCandidateInput = z.infer<typeof unlockCandidateSchema>;
export type ProfilePatchInput = z.infer<typeof profilePatchSchema>;
