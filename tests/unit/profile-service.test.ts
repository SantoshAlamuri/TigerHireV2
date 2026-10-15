import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../helpers";

let mockAdminClient: unknown = null;
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockAdminClient,
}));

describe("ProfileService", () => {
  beforeEach(() => {
    vi.resetModules();
    mockAdminClient = null;
  });

  describe("get", () => {
    it("returns profile without candidate record for non-candidate role", async () => {
      const profile = {
        id: "u1",
        full_name: "Admin User",
        role: "leadership",
      };
      const profileBuilder = createMockQueryBuilder({ data: profile });
      const supabase = createMockSupabase({ profiles: profileBuilder });

      const { ProfileService } = await import("@/lib/services/ProfileService");
      const result = await ProfileService.get(supabase, "u1", "leadership");

      expect(result.profile).toEqual(profile);
      expect(result.candidate).toBeNull();
    });

    it("returns profile with candidate record for candidate_pro", async () => {
      const profile = { id: "u1", full_name: "Jane", role: "candidate_pro" };
      const candidate = { id: "c1", user_id: "u1", name: "Jane" };
      const profileBuilder = createMockQueryBuilder({ data: profile });
      const candidateBuilder = createMockQueryBuilder({ data: candidate });
      const supabase = createMockSupabase({
        profiles: profileBuilder,
        candidates: candidateBuilder,
      });

      const { ProfileService } = await import("@/lib/services/ProfileService");
      const result = await ProfileService.get(supabase, "u1", "candidate_pro");

      expect(result.profile).toEqual({
        ...profile,
        skills: null,
        experience_years: null,
        role_title: null,
        current_company: null,
        location: null,
        seniority_level: null,
        salary_min: null,
        salary_max: null,
        resume_url: null,
        visibility: null,
        name: "Jane",
        full_name: "Jane",
        linkedin_url: null,
        portfolio_url: null,
        github_url: null,
        remote_preference: "any",
      });
      expect(result.candidate).toEqual(candidate);
    });

    it("returns profile with candidate record for candidate_free", async () => {
      const profile = { id: "u1", full_name: "John", role: "candidate_free" };
      const candidate = { id: "c2", user_id: "u1", name: "John" };
      const profileBuilder = createMockQueryBuilder({ data: profile });
      const candidateBuilder = createMockQueryBuilder({ data: candidate });
      const supabase = createMockSupabase({
        profiles: profileBuilder,
        candidates: candidateBuilder,
      });

      const { ProfileService } = await import("@/lib/services/ProfileService");
      const result = await ProfileService.get(supabase, "u1", "candidate_free");

      expect(result.candidate).toEqual(candidate);
    });
  });

  describe("update", () => {
    it("updates profile fields and returns result", async () => {
      const updated = { id: "u1", full_name: "New Name" };
      const profileBuilder = createMockQueryBuilder({ data: updated });
      const supabase = createMockSupabase({ profiles: profileBuilder });

      const { ProfileService } = await import("@/lib/services/ProfileService");
      const result = await ProfileService.update(supabase, "u1", "leadership", {
        name: "New Name",
      });

      expect(result.profile).toEqual(updated);
      expect(result.candidate).toBeNull();
    });

    it("updates candidate fields for candidate_pro role", async () => {
      const updatedProfile = { id: "u1", full_name: "Jane Updated" };
      const updatedCandidate = {
        id: "c1",
        name: "Jane Updated",
        skills: ["React"],
      };
      const profileBuilder = createMockQueryBuilder({ data: updatedProfile });
      const candidateBuilder = createMockQueryBuilder({
        data: updatedCandidate,
      });
      const supabase = createMockSupabase({
        profiles: profileBuilder,
        candidates: candidateBuilder,
      });
      mockAdminClient = supabase;

      const { ProfileService } = await import("@/lib/services/ProfileService");
      const result = await ProfileService.update(supabase, "u1", "candidate_pro", {
        name: "Jane Updated",
        roleTitle: "Senior Engineer",
        location: "Mumbai",
        skills: ["React"],
        experienceYears: 5,
      });

      expect(result.profile).toEqual(updatedProfile);
      expect(result.candidate).toEqual(updatedCandidate);
    });

    it("handles fullName alias", async () => {
      const updated = { id: "u1", full_name: "Via FullName" };
      const profileBuilder = createMockQueryBuilder({ data: updated });
      const supabase = createMockSupabase({ profiles: profileBuilder });

      const { ProfileService } = await import("@/lib/services/ProfileService");
      const result = await ProfileService.update(supabase, "u1", "recruiter", {
        fullName: "Via FullName",
      });

      const updateCall = (profileBuilder.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.full_name).toBe("Via FullName");
      expect(result.profile).toEqual(updated);
    });

    it("skips candidate update if no candidate fields provided", async () => {
      const updatedProfile = { id: "u1", full_name: "Jane" };
      const profileBuilder = createMockQueryBuilder({ data: updatedProfile });
      const candidateBuilder = createMockQueryBuilder();
      const supabase = createMockSupabase({
        profiles: profileBuilder,
        candidates: candidateBuilder,
      });
      mockAdminClient = supabase;

      const { ProfileService } = await import("@/lib/services/ProfileService");
      const result = await ProfileService.update(supabase, "u1", "candidate_free", {
        avatarUrl: "https://img.example.com/avatar.png",
      });

      expect(candidateBuilder.update).not.toHaveBeenCalled();
      expect(result.candidate).toBeNull();
    });

    it("does not update candidate for non-candidate role even with candidate fields", async () => {
      const updatedProfile = { id: "u1", full_name: "Admin" };
      const profileBuilder = createMockQueryBuilder({ data: updatedProfile });
      const candidateBuilder = createMockQueryBuilder();
      const supabase = createMockSupabase({
        profiles: profileBuilder,
        candidates: candidateBuilder,
      });

      const { ProfileService } = await import("@/lib/services/ProfileService");
      const result = await ProfileService.update(supabase, "u1", "recruiter", {
        name: "Admin",
        roleTitle: "Lead Recruiter",
        skills: ["Sourcing"],
      });

      expect(candidateBuilder.update).not.toHaveBeenCalled();
      expect(result.candidate).toBeNull();
    });

    it("maps all candidate update fields correctly for candidate_free", async () => {
      const updatedProfile = { id: "u1", full_name: "Bob" };
      const updatedCandidate = { id: "c1", name: "Bob" };
      const profileBuilder = createMockQueryBuilder({ data: updatedProfile });
      const candidateBuilder = createMockQueryBuilder({
        data: updatedCandidate,
      });
      const supabase = createMockSupabase({
        profiles: profileBuilder,
        candidates: candidateBuilder,
      });
      mockAdminClient = supabase;

      const { ProfileService } = await import("@/lib/services/ProfileService");
      const result = await ProfileService.update(supabase, "u1", "candidate_free", {
        name: "Bob",
        roleTitle: "Frontend Dev",
        currentCompany: "Acme Inc",
        location: "Mumbai",
        remotePreference: "remote",
        experienceYears: 3,
        seniorityLevel: "mid",
        salaryMin: 50000,
        salaryMax: 80000,
        visibility: true,
        skills: ["React", "TypeScript"],
        linkedinUrl: "https://linkedin.com/in/bob",
        portfolioUrl: "https://bob.dev",
        githubUrl: "https://github.com/bob",
      });

      expect(result.candidate).toEqual(updatedCandidate);
      const updateCall = (candidateBuilder.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.name).toBe("Bob");
      expect(updateCall.role_title).toBeUndefined();
      expect(updateCall.current_role).toBe("Frontend Dev");
      expect(updateCall.current_company).toBe("Acme Inc");
      expect(updateCall.location).toBe("Mumbai");
      expect(updateCall.remote_preference).toBeUndefined();
      expect(updateCall.experience_years).toBe(3);
      expect(updateCall.seniority_level).toBe("mid");
      expect(updateCall.salary_expectation_min).toBe(50000);
      expect(updateCall.salary_expectation_max).toBe(80000);
      expect(updateCall.visibility).toBe(true);
      expect(updateCall.skills).toEqual(["React", "TypeScript"]);
      expect(updateCall.linkedin_url).toBe("https://linkedin.com/in/bob");
      expect(updateCall.portfolio_url).toBe("https://bob.dev");
      expect(updateCall.github_url).toBe("https://github.com/bob");
      expect(updateCall.updated_at).toBeDefined();
    });

    it("saves work mode without dropping existing job preferences", async () => {
      const preferenceBuilder = createMockQueryBuilder({
        data: { preferences: { preferred_locations: ["Pune"], salary_min_lpa: 20 } },
      });
      const candidateBuilder = createMockQueryBuilder({ data: { id: "c1" } });
      const supabase = createMockSupabase({
        profiles: createMockQueryBuilder({ data: { id: "u1" } }),
        candidates: candidateBuilder,
        candidate_preferences: preferenceBuilder,
      });
      mockAdminClient = supabase;
      const { ProfileService } = await import("@/lib/services/ProfileService");
      await ProfileService.update(supabase, "u1", "candidate_free", { remotePreference: "remote" });
      expect(preferenceBuilder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          candidate_id: "c1",
          preferences: {
            preferred_locations: ["Pune"],
            salary_min_lpa: 20,
            remote_preference: "remote",
          },
        }),
        { onConflict: "candidate_id" },
      );
    });

    it("creates a candidate record when onboarding saves before one exists", async () => {
      const updatedProfile = { id: "u1", full_name: "Bob" };
      const insertedCandidate = {
        id: "c-new",
        user_id: "u1",
        name: "Bob",
        full_name: "Bob",
        current_role: "Frontend Dev",
        location: "Mumbai",
        skills: ["React"],
        experience_years: 3,
      };
      const profileBuilder = createMockQueryBuilder({ data: updatedProfile });
      const candidateBuilder = createMockQueryBuilder();
      (candidateBuilder.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: null,
        error: null,
      });
      (candidateBuilder.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: insertedCandidate,
        error: null,
      });
      const supabase = createMockSupabase({
        profiles: profileBuilder,
        candidates: candidateBuilder,
      });
      mockAdminClient = supabase;

      const { ProfileService } = await import("@/lib/services/ProfileService");
      const result = await ProfileService.update(supabase, "u1", "candidate_free", {
        name: "Bob",
        roleTitle: "Frontend Dev",
        location: "Mumbai",
        experienceYears: 3,
        skills: ["React"],
      });

      expect(result.candidate).toEqual(insertedCandidate);
      expect(candidateBuilder.update).toHaveBeenCalled();
      expect(candidateBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "u1",
          visibility: true,
          name: "Bob",
          full_name: "Bob",
          current_role: "Frontend Dev",
          location: "Mumbai",
          experience_years: 3,
          skills: ["React"],
        }),
      );
    });

    it("returns null candidate when candidate update errors", async () => {
      const updatedProfile = { id: "u1", full_name: "Error" };
      const profileBuilder = createMockQueryBuilder({ data: updatedProfile });
      const candidateBuilder = createMockQueryBuilder({
        data: null,
        error: { message: "update error" },
      });
      const supabase = createMockSupabase({
        profiles: profileBuilder,
        candidates: candidateBuilder,
      });
      mockAdminClient = supabase;

      const { ProfileService } = await import("@/lib/services/ProfileService");
      await expect(
        ProfileService.update(supabase, "u1", "candidate_pro", {
          name: "Error",
        }),
      ).rejects.toThrow("update error");
    });

    it("updates avatarUrl on profile", async () => {
      const updated = {
        id: "u1",
        avatar_url: "https://img.example.com/new.png",
      };
      const profileBuilder = createMockQueryBuilder({ data: updated });
      const supabase = createMockSupabase({ profiles: profileBuilder });

      const { ProfileService } = await import("@/lib/services/ProfileService");
      await ProfileService.update(supabase, "u1", "recruiter", {
        avatarUrl: "https://img.example.com/new.png",
      });

      const updateCall = (profileBuilder.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.avatar_url).toBe("https://img.example.com/new.png");
    });

    it("does not set full_name when neither name nor fullName is provided", async () => {
      const updated = { id: "u1" };
      const profileBuilder = createMockQueryBuilder({ data: updated });
      const supabase = createMockSupabase({ profiles: profileBuilder });

      const { ProfileService } = await import("@/lib/services/ProfileService");
      await ProfileService.update(supabase, "u1", "recruiter", {
        avatarUrl: "https://img.example.com/av.png",
      });

      const updateCall = (profileBuilder.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.full_name).toBeUndefined();
    });

    it("prefers name over fullName when both provided", async () => {
      const updated = { id: "u1", full_name: "From Name" };
      const profileBuilder = createMockQueryBuilder({ data: updated });
      const supabase = createMockSupabase({ profiles: profileBuilder });

      const { ProfileService } = await import("@/lib/services/ProfileService");
      await ProfileService.update(supabase, "u1", "recruiter", {
        name: "From Name",
        fullName: "From FullName",
      });

      const updateCall = (profileBuilder.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.full_name).toBe("From Name");
    });
  });
});
