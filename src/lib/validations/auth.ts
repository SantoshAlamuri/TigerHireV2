import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Valid email required").max(320),
  // Login must accept any password length — users may have been created via
  // admin API, Supabase dashboard, or older registration with different rules.
  // Let Supabase validate the actual credentials; don't reject at the gate.
  password: z.string().min(1, "Password is required").max(1024),
  /** Same-origin path to redirect after login (e.g. `/dashboard/referrer/join`). */
  returnTo: z.string().max(2048).optional(),
});

export const registerSchema = z.object({
  email: z.string().email("Valid email required").max(320),
  password: z.string().min(8, "Password must be at least 8 characters").max(1024),
  fullName: z.string().min(2, "Name must be at least 2 characters").max(200),
  userType: z.enum(["company", "agency", "candidate"]),
  organisationName: z.string().max(200).optional(),
});

export const magicLinkSchema = z.object({
  email: z.string().email("Valid email required").max(320),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Valid email required").max(320),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(1024),
});

export const onboardingRequestSchema = z.object({
  fullName: z.string().trim().min(2, "Name is required").max(200),
  workEmail: z.string().trim().email("Valid work email is required").max(320),
  companyName: z.string().trim().min(2, "Company name is required").max(200),
  roleTitle: z.string().trim().min(2, "Role/title is required").max(120),
  domain: z.string().trim().toLowerCase().min(3).max(255),
  notes: z.string().trim().max(1000).optional().default(""),
});

export const entraUserDeltaSchema = z.object({
  userId: z.string().min(1, "userId is required").max(200),
  azureOid: z.string().min(1).max(200).optional(),
  organisationId: z.string().min(1, "organisationId is required").max(200),
  active: z.boolean(),
  groupIds: z.array(z.string().max(200)).max(500).default([]),
});

export const entraSyncPayloadSchema = z.object({
  users: z.array(entraUserDeltaSchema).min(1, "No user deltas provided"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type OnboardingRequestInput = z.infer<typeof onboardingRequestSchema>;
export type EntraUserDeltaInput = z.infer<typeof entraUserDeltaSchema>;
export type EntraSyncPayloadInput = z.infer<typeof entraSyncPayloadSchema>;
