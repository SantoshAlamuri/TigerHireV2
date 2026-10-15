import { z } from "zod";

const text = (max = 200) => z.string().trim().max(max);
const required = (label: string) => text().min(1, `${label} is required`);
const month = z.string().regex(/^$|^\d{4}-(0[1-9]|1[0-2])$/, "Use a valid month");
const year = z.string().regex(/^$|^(19|20)\d{2}$/, "Use a four-digit year");
export const optionalWebUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((value) => {
    if (!value) return true;
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "Enter an http or https URL, or leave it blank");

export const experienceEntrySchema = z
  .object({
    id: z.string().uuid(),
    role: required("Role"),
    company: required("Company"),
    location: text(),
    startDate: month,
    endDate: month,
    current: z.boolean(),
    highlights: text(4000),
  })
  .strict()
  .refine((entry) => !entry.current || !entry.endDate, {
    message: "A current role cannot have an end date",
    path: ["endDate"],
  })
  .refine((entry) => !entry.startDate || !entry.endDate || entry.startDate <= entry.endDate, {
    message: "End date must be after start date",
    path: ["endDate"],
  });

export const educationEntrySchema = z
  .object({
    id: z.string().uuid(),
    institution: required("Institution"),
    qualification: required("Qualification"),
    field: text(),
    startYear: year,
    endYear: year,
  })
  .strict()
  .refine((entry) => !entry.startYear || !entry.endYear || entry.startYear <= entry.endYear, {
    message: "End year must be after start year",
    path: ["endYear"],
  });

const achievementSchema = z
  .object({
    id: z.string().uuid(),
    title: required("Achievement"),
    context: text(1000),
    outcome: required("Outcome").max(200),
    evidenceUrl: optionalWebUrl,
  })
  .strict();
const certificationSchema = z
  .object({
    id: z.string().uuid(),
    name: required("Certification"),
    issuer: text(),
    year,
    credentialUrl: optionalWebUrl,
  })
  .strict();
const skillEvidenceSchema = z
  .object({
    id: z.string().uuid(),
    skill: required("Skill"),
    level: z.enum(["foundation", "working", "advanced", "expert"]),
    evidence: text(2000),
    lastUsedYear: year,
  })
  .strict();

export const careerProfileSchema = z
  .object({
    summary: text(3000),
    experience: z.array(experienceEntrySchema).max(30),
    education: z.array(educationEntrySchema).max(20),
    achievements: z.array(achievementSchema).max(30),
    certifications: z.array(certificationSchema).max(30),
    skillEvidence: z.array(skillEvidenceSchema).max(100),
  })
  .strict()
  .superRefine((profile, ctx) => {
    for (const key of [
      "experience",
      "education",
      "achievements",
      "certifications",
      "skillEvidence",
    ] as const) {
      const ids = profile[key].map((entry) => entry.id);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: "custom", path: [key], message: "Duplicate entry IDs" });
      }
    }
  });

export type CareerProfile = z.infer<typeof careerProfileSchema>;
export type CareerProfileRecord = { document: CareerProfile; updated_at: string };
export function emptyCareerProfile(): CareerProfile {
  return {
    summary: "",
    experience: [],
    education: [],
    achievements: [],
    certifications: [],
    skillEvidence: [],
  };
}

export const careerProfileSaveSchema = z
  .object({
    document: careerProfileSchema,
    expectedUpdatedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
