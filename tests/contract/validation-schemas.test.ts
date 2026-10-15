import { describe, it, expect } from "vitest";
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/validations/auth";
import { createJobSchema, updateJobSchema, jobQuerySchema } from "@/lib/validations/jobs";
import {
  candidateQuerySchema,
  updateCandidateSchema,
  unlockCandidateSchema,
} from "@/lib/validations/candidates";
import { createApplicationSchema, updateApplicationSchema } from "@/lib/validations/applications";
import { createHiringRequestSchema } from "@/lib/validations/hiring-requests";

/* ================================================================== */
/*  Auth Schemas                                                       */
/* ================================================================== */

describe("Validation Schema Contract Tests", () => {
  describe("Auth Schemas", () => {
    describe("loginSchema", () => {
      it("accepts valid email and password", () => {
        const result = loginSchema.safeParse({ email: "user@example.com", password: "secret123" });
        expect(result.success).toBe(true);
      });

      it("requires email", () => {
        const result = loginSchema.safeParse({ password: "secret123" });
        expect(result.success).toBe(false);
      });

      it("requires password", () => {
        const result = loginSchema.safeParse({ email: "user@example.com" });
        expect(result.success).toBe(false);
      });

      it("rejects invalid email format", () => {
        const result = loginSchema.safeParse({ email: "not-an-email", password: "secret123" });
        expect(result.success).toBe(false);
      });

      it("rejects empty password", () => {
        const result = loginSchema.safeParse({ email: "user@example.com", password: "" });
        expect(result.success).toBe(false);
      });

      it("accepts any non-empty password (no min-length enforced at login)", () => {
        const result = loginSchema.safeParse({ email: "user@example.com", password: "a" });
        expect(result.success).toBe(true);
      });
    });

    describe("registerSchema", () => {
      const validRegister = {
        email: "new@example.com",
        password: "strongpass1",
        fullName: "Jane Doe",
        userType: "company" as const,
      };

      it("accepts valid registration data", () => {
        const result = registerSchema.safeParse(validRegister);
        expect(result.success).toBe(true);
      });

      it("requires email", () => {
        const { email, ...rest } = validRegister;
        expect(registerSchema.safeParse(rest).success).toBe(false);
      });

      it("requires password", () => {
        const { password, ...rest } = validRegister;
        expect(registerSchema.safeParse(rest).success).toBe(false);
      });

      it("requires fullName", () => {
        const { fullName, ...rest } = validRegister;
        expect(registerSchema.safeParse(rest).success).toBe(false);
      });

      it("requires userType", () => {
        const { userType, ...rest } = validRegister;
        expect(registerSchema.safeParse(rest).success).toBe(false);
      });

      it("rejects short password (< 8 chars)", () => {
        const result = registerSchema.safeParse({ ...validRegister, password: "short" });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("8");
        }
      });

      it("rejects short fullName (< 2 chars)", () => {
        const result = registerSchema.safeParse({ ...validRegister, fullName: "A" });
        expect(result.success).toBe(false);
      });

      it("rejects invalid userType", () => {
        const result = registerSchema.safeParse({ ...validRegister, userType: "admin" });
        expect(result.success).toBe(false);
      });

      it("accepts valid userType enum values: company, agency, candidate", () => {
        for (const userType of ["company", "agency", "candidate"] as const) {
          const result = registerSchema.safeParse({ ...validRegister, userType });
          expect(result.success).toBe(true);
        }
      });

      it("allows optional organisationName", () => {
        const result = registerSchema.safeParse({
          ...validRegister,
          organisationName: "Acme Inc",
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.organisationName).toBe("Acme Inc");
        }
      });

      it("accepts missing organisationName", () => {
        const result = registerSchema.safeParse(validRegister);
        expect(result.success).toBe(true);
      });
    });

    describe("forgotPasswordSchema", () => {
      it("accepts valid email", () => {
        expect(forgotPasswordSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
      });

      it("rejects invalid email", () => {
        expect(forgotPasswordSchema.safeParse({ email: "bad" }).success).toBe(false);
      });

      it("rejects missing email", () => {
        expect(forgotPasswordSchema.safeParse({}).success).toBe(false);
      });
    });

    describe("resetPasswordSchema", () => {
      it("accepts password with 8+ chars", () => {
        expect(resetPasswordSchema.safeParse({ password: "newpass12" }).success).toBe(true);
      });

      it("rejects short password", () => {
        const result = resetPasswordSchema.safeParse({ password: "short" });
        expect(result.success).toBe(false);
      });
    });
  });

  /* ================================================================== */
  /*  Job Schemas                                                        */
  /* ================================================================== */

  describe("Job Schemas", () => {
    const validJob = {
      title: "Senior Engineer",
      description:
        "A ".repeat(30) +
        "long enough description for fifty words minimum requirement that needs to be at least fifty characters",
    };

    describe("createJobSchema", () => {
      it("accepts valid job data", () => {
        const result = createJobSchema.safeParse(validJob);
        expect(result.success).toBe(true);
      });

      it("requires title", () => {
        const { title, ...rest } = validJob;
        expect(createJobSchema.safeParse(rest).success).toBe(false);
      });

      it("rejects title shorter than 3 chars", () => {
        const result = createJobSchema.safeParse({ ...validJob, title: "AB" });
        expect(result.success).toBe(false);
      });

      it("rejects title longer than 200 chars", () => {
        const result = createJobSchema.safeParse({ ...validJob, title: "A".repeat(201) });
        expect(result.success).toBe(false);
      });

      it("requires description", () => {
        const { description, ...rest } = validJob;
        expect(createJobSchema.safeParse(rest).success).toBe(false);
      });

      it("rejects description shorter than 50 chars", () => {
        const result = createJobSchema.safeParse({ ...validJob, description: "Too short" });
        expect(result.success).toBe(false);
      });

      it("validates salary range: compensationMin must be >= 0", () => {
        const result = createJobSchema.safeParse({ ...validJob, compensationMin: -1 });
        expect(result.success).toBe(false);
      });

      it("validates salary range: compensationMax must be >= 0", () => {
        const result = createJobSchema.safeParse({ ...validJob, compensationMax: -5 });
        expect(result.success).toBe(false);
      });

      it("accepts valid compensation values", () => {
        const result = createJobSchema.safeParse({
          ...validJob,
          compensationMin: 50000,
          compensationMax: 100000,
        });
        expect(result.success).toBe(true);
      });

      it("defaults status to 'open'", () => {
        const result = createJobSchema.safeParse(validJob);
        if (result.success) {
          expect(result.data.status).toBe("open");
        }
      });

      it("accepts valid status enum: draft, open, closed", () => {
        for (const status of ["draft", "open", "closed"] as const) {
          const result = createJobSchema.safeParse({ ...validJob, status });
          expect(result.success).toBe(true);
        }
      });

      it("rejects invalid status", () => {
        const result = createJobSchema.safeParse({ ...validJob, status: "archived" });
        expect(result.success).toBe(false);
      });

      it("accepts optional skills arrays", () => {
        const result = createJobSchema.safeParse({
          ...validJob,
          skillsRequired: ["TypeScript", "React"],
          skillsPreferred: ["GraphQL"],
        });
        expect(result.success).toBe(true);
      });

      it("validates hiringManagerId is a valid UUID when provided", () => {
        const result = createJobSchema.safeParse({
          ...validJob,
          hiringManagerId: "not-a-uuid",
        });
        expect(result.success).toBe(false);
      });

      it("accepts null hiringManagerId", () => {
        const result = createJobSchema.safeParse({ ...validJob, hiringManagerId: null });
        expect(result.success).toBe(true);
      });
    });

    describe("updateJobSchema", () => {
      it("accepts partial updates (all fields optional)", () => {
        const result = updateJobSchema.safeParse({ title: "New Title" });
        expect(result.success).toBe(true);
      });

      it("accepts empty object (no fields)", () => {
        const result = updateJobSchema.safeParse({});
        expect(result.success).toBe(true);
      });

      it("still validates field constraints when provided", () => {
        const result = updateJobSchema.safeParse({ title: "AB" }); // too short
        expect(result.success).toBe(false);
      });
    });

    describe("jobQuerySchema", () => {
      it("accepts empty query (uses defaults)", () => {
        const result = jobQuerySchema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.page).toBe(1);
          expect(result.data.limit).toBe(20);
        }
      });

      it("coerces page and limit from strings", () => {
        const result = jobQuerySchema.safeParse({ page: "3", limit: "50" });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.page).toBe(3);
          expect(result.data.limit).toBe(50);
        }
      });

      it("rejects page < 1", () => {
        expect(jobQuerySchema.safeParse({ page: "0" }).success).toBe(false);
      });

      it("rejects limit > 100", () => {
        expect(jobQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
      });

      it("rejects invalid status", () => {
        expect(jobQuerySchema.safeParse({ status: "invalid" }).success).toBe(false);
      });
    });
  });

  /* ================================================================== */
  /*  Candidate Schemas                                                  */
  /* ================================================================== */

  describe("Candidate Schemas", () => {
    describe("candidateQuerySchema", () => {
      it("accepts empty query (uses defaults)", () => {
        const result = candidateQuerySchema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.page).toBe(1);
          expect(result.data.limit).toBe(20);
          expect(result.data.sortBy).toBe("intent_score");
          expect(result.data.sortOrder).toBe("desc");
        }
      });

      it("validates sortBy enum", () => {
        expect(candidateQuerySchema.safeParse({ sortBy: "intent_score" }).success).toBe(true);
        expect(candidateQuerySchema.safeParse({ sortBy: "experience_years" }).success).toBe(true);
        expect(candidateQuerySchema.safeParse({ sortBy: "created_at" }).success).toBe(true);
        expect(candidateQuerySchema.safeParse({ sortBy: "INVALID" }).success).toBe(false);
      });

      it("validates sortOrder enum", () => {
        expect(candidateQuerySchema.safeParse({ sortOrder: "asc" }).success).toBe(true);
        expect(candidateQuerySchema.safeParse({ sortOrder: "desc" }).success).toBe(true);
        expect(candidateQuerySchema.safeParse({ sortOrder: "random" }).success).toBe(false);
      });

      it("validates minIntentScore range 0-100", () => {
        expect(candidateQuerySchema.safeParse({ minIntentScore: "50" }).success).toBe(true);
        expect(candidateQuerySchema.safeParse({ minIntentScore: "0" }).success).toBe(true);
        expect(candidateQuerySchema.safeParse({ minIntentScore: "100" }).success).toBe(true);
        expect(candidateQuerySchema.safeParse({ minIntentScore: "-1" }).success).toBe(false);
        expect(candidateQuerySchema.safeParse({ minIntentScore: "101" }).success).toBe(false);
      });

      it("validates cursor is a UUID when provided", () => {
        expect(
          candidateQuerySchema.safeParse({
            cursor: "00000000-0000-4000-8000-000000000001",
          }).success,
        ).toBe(true);
        expect(candidateQuerySchema.safeParse({ cursor: "not-uuid" }).success).toBe(false);
      });
    });

    describe("updateCandidateSchema", () => {
      it("accepts valid update data", () => {
        const result = updateCandidateSchema.safeParse({
          name: "John Doe",
          email: "john@example.com",
          skills: ["TypeScript"],
          experienceYears: 5,
        });
        expect(result.success).toBe(true);
      });

      it("validates email format when provided", () => {
        expect(updateCandidateSchema.safeParse({ email: "bad-email" }).success).toBe(false);
        expect(updateCandidateSchema.safeParse({ email: "good@email.com" }).success).toBe(true);
      });

      it("rejects name shorter than 2 chars", () => {
        expect(updateCandidateSchema.safeParse({ name: "A" }).success).toBe(false);
      });

      it("validates experienceYears range 0-50", () => {
        expect(updateCandidateSchema.safeParse({ experienceYears: 0 }).success).toBe(true);
        expect(updateCandidateSchema.safeParse({ experienceYears: 50 }).success).toBe(true);
        expect(updateCandidateSchema.safeParse({ experienceYears: -1 }).success).toBe(false);
        expect(updateCandidateSchema.safeParse({ experienceYears: 51 }).success).toBe(false);
      });

      it("accepts empty object (all fields optional)", () => {
        expect(updateCandidateSchema.safeParse({}).success).toBe(true);
      });

      it("accepts boolean visibility", () => {
        expect(updateCandidateSchema.safeParse({ visibility: true }).success).toBe(true);
        expect(updateCandidateSchema.safeParse({ visibility: false }).success).toBe(true);
      });
    });

    describe("unlockCandidateSchema", () => {
      it("requires a valid UUID jobId", () => {
        expect(
          unlockCandidateSchema.safeParse({
            jobId: "00000000-0000-4000-8000-000000000001",
          }).success,
        ).toBe(true);
      });

      it("rejects missing jobId", () => {
        expect(unlockCandidateSchema.safeParse({}).success).toBe(false);
      });

      it("rejects non-UUID jobId", () => {
        const result = unlockCandidateSchema.safeParse({ jobId: "not-a-uuid" });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("job ID");
        }
      });
    });
  });

  /* ================================================================== */
  /*  Application Schemas                                                */
  /* ================================================================== */

  describe("Application Schemas", () => {
    describe("createApplicationSchema", () => {
      const validApp = {
        jobId: "00000000-0000-4000-8000-000000000001",
      };

      it("accepts valid application with just jobId", () => {
        expect(createApplicationSchema.safeParse(validApp).success).toBe(true);
      });

      it("requires jobId", () => {
        expect(createApplicationSchema.safeParse({}).success).toBe(false);
      });

      it("rejects non-UUID jobId", () => {
        expect(createApplicationSchema.safeParse({ jobId: "bad" }).success).toBe(false);
      });

      it("defaults interest to 'interested'", () => {
        const result = createApplicationSchema.safeParse(validApp);
        if (result.success) {
          expect(result.data.interest).toBe("interested");
        }
      });

      it("accepts valid interest values", () => {
        expect(
          createApplicationSchema.safeParse({ ...validApp, interest: "interested" }).success,
        ).toBe(true);
        expect(
          createApplicationSchema.safeParse({ ...validApp, interest: "strong_interest" }).success,
        ).toBe(true);
      });

      it("rejects invalid interest value", () => {
        expect(createApplicationSchema.safeParse({ ...validApp, interest: "meh" }).success).toBe(
          false,
        );
      });

      it("rejects coverNote exceeding 2000 chars", () => {
        const result = createApplicationSchema.safeParse({
          ...validApp,
          coverNote: "x".repeat(2001),
        });
        expect(result.success).toBe(false);
      });

      it("accepts coverNote within limit", () => {
        const result = createApplicationSchema.safeParse({
          ...validApp,
          coverNote: "I am excited about this role.",
        });
        expect(result.success).toBe(true);
      });

      it("accepts optional fitScoreId as UUID", () => {
        expect(
          createApplicationSchema.safeParse({
            ...validApp,
            fitScoreId: "00000000-0000-4000-8000-000000000002",
          }).success,
        ).toBe(true);
      });

      it("rejects invalid fitScoreId", () => {
        expect(createApplicationSchema.safeParse({ ...validApp, fitScoreId: "bad" }).success).toBe(
          false,
        );
      });

      it("accepts optional source field", () => {
        expect(createApplicationSchema.safeParse({ ...validApp, source: "linkedin" }).success).toBe(
          true,
        );
      });

      it("rejects source exceeding 64 chars", () => {
        expect(
          createApplicationSchema.safeParse({ ...validApp, source: "x".repeat(65) }).success,
        ).toBe(false);
      });
    });

    describe("updateApplicationSchema", () => {
      it("accepts valid status values", () => {
        for (const status of ["applied", "viewed", "shortlisted", "rejected", "hired"] as const) {
          expect(updateApplicationSchema.safeParse({ status }).success).toBe(true);
        }
      });

      it("rejects invalid status", () => {
        expect(updateApplicationSchema.safeParse({ status: "pending" }).success).toBe(false);
        expect(updateApplicationSchema.safeParse({ status: "withdrawn" }).success).toBe(false);
      });

      it("allows empty object (all fields optional for partial PATCH)", () => {
        expect(updateApplicationSchema.safeParse({}).success).toBe(true);
      });
    });
  });

  /* ================================================================== */
  /*  Hiring Request Schemas                                             */
  /* ================================================================== */

  describe("Hiring Request Schemas", () => {
    describe("createHiringRequestSchema", () => {
      it("accepts valid hiring request", () => {
        const result = createHiringRequestSchema.safeParse({
          title: "Backend Engineer",
        });
        expect(result.success).toBe(true);
      });

      it("requires title", () => {
        expect(createHiringRequestSchema.safeParse({}).success).toBe(false);
      });

      it("rejects empty title (after trim)", () => {
        const result = createHiringRequestSchema.safeParse({ title: "   " });
        expect(result.success).toBe(false);
      });

      it("rejects title exceeding 500 chars", () => {
        expect(createHiringRequestSchema.safeParse({ title: "A".repeat(501) }).success).toBe(false);
      });

      it("defaults headcount to 1", () => {
        const result = createHiringRequestSchema.safeParse({ title: "Engineer" });
        if (result.success) {
          expect(result.data.headcount).toBe(1);
        }
      });

      it("validates headcount range 1-100", () => {
        expect(createHiringRequestSchema.safeParse({ title: "Eng", headcount: 0 }).success).toBe(
          false,
        );
        expect(createHiringRequestSchema.safeParse({ title: "Eng", headcount: 101 }).success).toBe(
          false,
        );
        expect(createHiringRequestSchema.safeParse({ title: "Eng", headcount: 50 }).success).toBe(
          true,
        );
      });

      it("defaults urgency to 'normal'", () => {
        const result = createHiringRequestSchema.safeParse({ title: "Engineer" });
        if (result.success) {
          expect(result.data.urgency).toBe("normal");
        }
      });

      it("accepts valid urgency values: low, normal, high, urgent, critical", () => {
        for (const urgency of ["low", "normal", "high", "urgent", "critical"] as const) {
          expect(createHiringRequestSchema.safeParse({ title: "Eng", urgency }).success).toBe(true);
        }
      });

      it("rejects invalid urgency", () => {
        expect(createHiringRequestSchema.safeParse({ title: "Eng", urgency: "mega" }).success).toBe(
          false,
        );
      });

      it("accepts nullable department, description, notes", () => {
        const result = createHiringRequestSchema.safeParse({
          title: "Engineer",
          department: null,
          description: null,
          notes: null,
        });
        expect(result.success).toBe(true);
      });

      it("rejects description exceeding 10000 chars", () => {
        expect(
          createHiringRequestSchema.safeParse({
            title: "Eng",
            description: "x".repeat(10001),
          }).success,
        ).toBe(false);
      });

      it("rejects notes exceeding 2000 chars", () => {
        expect(
          createHiringRequestSchema.safeParse({
            title: "Eng",
            notes: "x".repeat(2001),
          }).success,
        ).toBe(false);
      });
    });
  });
});
