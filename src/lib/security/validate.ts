import { z } from "zod";

export const CreateJobSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(50).max(10000),
  seniority_level: z
    .enum(["intern", "junior", "mid", "senior", "lead", "head", "director", "c-suite"])
    .optional(),
  location: z.string().max(100).optional(),
  remote_policy: z.enum(["onsite", "hybrid", "remote", "flexible"]).optional(),
  salary_min: z.number().int().min(0).max(10000).optional(),
  salary_max: z.number().int().min(0).max(10000).optional(),
  employment_type: z.enum(["full_time", "contract", "part_time"]).optional(),
  skills_required: z.array(z.string()).optional(),
  skills_preferred: z.array(z.string()).optional(),
  hiring_manager_id: z.string().uuid().optional().nullable(),
});

export const UpdateJobSchema = CreateJobSchema.partial();

export const UnlockCandidateSchema = z.object({
  candidate_id: z.string().uuid(),
  job_id: z.string().uuid(),
});

export const ReferCandidateSchema = z.object({
  candidate_phone: z.string().regex(/^\+?[1-9]\d{9,14}$/),
  candidate_name: z.string().min(2).max(100),
  job_id: z.string().uuid(),
});

export const InviteEmployeeSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2).max(100),
});

export const CreateApplicationSchema = z.object({
  job_id: z.string().uuid(),
  fit_score_id: z.string().uuid().optional(),
  interest: z.enum(["interested", "strong_interest"]).default("interested"),
  cover_note: z.string().max(2000).optional(),
});

export const UpdateApplicationSchema = z.object({
  status: z.enum(["viewed", "shortlisted", "rejected", "hired"]),
});

export const CreateHiringRequestSchema = z.object({
  title: z.string().min(3).max(200),
  department: z.string().max(100).optional(),
  headcount: z.number().int().min(1).max(100).default(1),
  urgency: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  description: z.string().max(5000).optional(),
  notes: z.string().max(2000).optional(),
});

export const CreateApprovalSchema = z.object({
  pipeline_candidate_id: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  notes: z.string().max(2000).optional(),
});

export type CreateJobInput = z.infer<typeof CreateJobSchema>;
export type UnlockCandidateInput = z.infer<typeof UnlockCandidateSchema>;
export type ReferCandidateInput = z.infer<typeof ReferCandidateSchema>;
export type InviteEmployeeInput = z.infer<typeof InviteEmployeeSchema>;
