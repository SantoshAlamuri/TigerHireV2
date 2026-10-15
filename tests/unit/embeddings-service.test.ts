import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockQueryBuilder } from "../helpers";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/config/env", () => ({
  env: {
    openaiApiKey: "test-openai-key",
    baseUrl: "https://app.test.com",
  },
}));

// Mock circuit breaker to just execute the function
vi.mock("@/lib/utils/circuit-breaker", () => ({
  getCircuitBreaker: () => ({
    run: (fn: () => unknown) => fn(),
  }),
}));

// Mock retry to just execute the function
vi.mock("@/lib/utils/retry", () => ({
  withRetry: (fn: () => unknown) => fn(),
}));

// Mock global fetch for OpenAI embedding calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("EmbeddingsService", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
    mockFetch.mockReset();
  });

  describe("generateEmbedding", () => {
    it("returns embedding vector from OpenAI", async () => {
      const fakeEmbedding = Array.from({ length: 1536 }, (_, i) => i * 0.001);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ embedding: fakeEmbedding }] }),
        text: () => Promise.resolve(""),
      });

      const { generateEmbedding } = await import("@/lib/services/embeddings");
      const result = await generateEmbedding("test text for embedding");

      expect(result).toEqual(fakeEmbedding);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/embeddings",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-openai-key",
            "Content-Type": "application/json",
          }),
        }),
      );
    });

    it("truncates text to 8000 chars", async () => {
      const longText = "A".repeat(10000);
      const fakeEmbedding = [0.1, 0.2, 0.3];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ embedding: fakeEmbedding }] }),
        text: () => Promise.resolve(""),
      });

      const { generateEmbedding } = await import("@/lib/services/embeddings");
      await generateEmbedding(longText);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.input.length).toBe(8000);
    });

    it("sends correct model and dimensions", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ embedding: [0.1] }] }),
        text: () => Promise.resolve(""),
      });

      const { generateEmbedding } = await import("@/lib/services/embeddings");
      await generateEmbedding("test");

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.model).toBe("text-embedding-3-small");
      expect(callBody.dimensions).toBe(1536);
    });

    it("throws on OpenAI error response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Rate limited"),
      });

      const { generateEmbedding } = await import("@/lib/services/embeddings");
      await expect(generateEmbedding("test")).rejects.toThrow("OpenAI embedding failed: 429");
    });
  });

  describe("embedCandidate", () => {
    it("fetches candidate, generates embedding, and stores it", async () => {
      const candidateBuilder = createMockQueryBuilder({
        data: {
          name: "Alice Smith",
          current_role: "Senior Engineer",
          seniority_level: "senior",
          skills: ["TypeScript", "React"],
          experience_years: 5,
          location: "NYC",
        },
      });
      const updateBuilder = createMockQueryBuilder({ data: null });

      mockFrom.mockImplementation((table: string) => {
        if (table === "candidates") {
          // First call is select, subsequent is update
          return candidateBuilder;
        }
        return createMockQueryBuilder();
      });

      // Override: after single() resolves with candidate data, the next from("candidates")
      // should return an update builder
      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? candidateBuilder : updateBuilder;
      });

      const fakeEmbedding = [0.1, 0.2];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ embedding: fakeEmbedding }] }),
        text: () => Promise.resolve(""),
      });

      const { embedCandidate } = await import("@/lib/services/embeddings");
      await embedCandidate("cand-1");

      expect(mockFrom).toHaveBeenCalledWith("candidates");
      expect(mockFetch).toHaveBeenCalled();
    });

    it("throws when candidate not found", async () => {
      const builder = createMockQueryBuilder({ data: null });
      mockFrom.mockReturnValue(builder);

      const { embedCandidate } = await import("@/lib/services/embeddings");
      await expect(embedCandidate("missing-id")).rejects.toThrow("not found");
    });
  });

  describe("embedJob", () => {
    it("fetches job, generates embedding, and stores it", async () => {
      const jobBuilder = createMockQueryBuilder({
        data: {
          title: "Backend Engineer",
          description: "Build APIs",
          location: "Remote",
          seniority_level: "mid",
          role_function: "Engineering",
          skills_required: ["Go", "PostgreSQL"],
        },
      });
      const updateBuilder = createMockQueryBuilder({ data: null });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? jobBuilder : updateBuilder;
      });

      const fakeEmbedding = [0.5, 0.6];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ embedding: fakeEmbedding }] }),
        text: () => Promise.resolve(""),
      });

      const { embedJob } = await import("@/lib/services/embeddings");
      await embedJob("job-1");

      expect(mockFrom).toHaveBeenCalledWith("jobs");
      expect(mockFetch).toHaveBeenCalled();
    });

    it("throws when job not found", async () => {
      const builder = createMockQueryBuilder({ data: null });
      mockFrom.mockReturnValue(builder);

      const { embedJob } = await import("@/lib/services/embeddings");
      await expect(embedJob("missing-job")).rejects.toThrow("not found");
    });
  });

  describe("findSimilarCandidates", () => {
    it("calls match_candidates RPC with job embedding", async () => {
      // First mock: fetch the job's jd_embedding
      const jobBuilder = createMockQueryBuilder({
        data: { jd_embedding: "[0.1, 0.2, 0.3]" },
      });
      mockFrom.mockReturnValue(jobBuilder);

      mockRpc.mockResolvedValue({
        data: [
          { id: "c-1", similarity: 0.95 },
          { id: "c-2", similarity: 0.85 },
        ],
        error: null,
      });

      const { findSimilarCandidates } = await import("@/lib/services/embeddings");
      const results = await findSimilarCandidates("job-1", 10);

      expect(mockRpc).toHaveBeenCalledWith(
        "match_candidates",
        expect.objectContaining({
          query_embedding: "[0.1, 0.2, 0.3]",
          match_threshold: 0.6,
          match_count: 10,
        }),
      );
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ id: "c-1", similarity: 0.95 });
    });

    it("applies location filter when provided", async () => {
      const jobBuilder = createMockQueryBuilder({
        data: { jd_embedding: "[0.1]" },
      });
      mockFrom.mockReturnValue(jobBuilder);

      mockRpc.mockResolvedValue({ data: [], error: null });

      const { findSimilarCandidates } = await import("@/lib/services/embeddings");
      await findSimilarCandidates("job-1", 20, { locationFilter: "NYC" });

      expect(mockRpc).toHaveBeenCalledWith(
        "match_candidates",
        expect.objectContaining({
          location_filter: "NYC",
        }),
      );
    });

    it("respects match threshold option", async () => {
      const jobBuilder = createMockQueryBuilder({
        data: { jd_embedding: "[0.1]" },
      });
      mockFrom.mockReturnValue(jobBuilder);

      mockRpc.mockResolvedValue({ data: [], error: null });

      const { findSimilarCandidates } = await import("@/lib/services/embeddings");
      await findSimilarCandidates("job-1", 5, { matchThreshold: 0.8 });

      expect(mockRpc).toHaveBeenCalledWith(
        "match_candidates",
        expect.objectContaining({
          match_threshold: 0.8,
        }),
      );
    });

    it("applies intent minimum filter", async () => {
      const jobBuilder = createMockQueryBuilder({
        data: { jd_embedding: "[0.1]" },
      });
      mockFrom.mockReturnValue(jobBuilder);
      mockRpc.mockResolvedValue({ data: [], error: null });

      const { findSimilarCandidates } = await import("@/lib/services/embeddings");
      await findSimilarCandidates("job-1", 10, { intentMin: 40 });

      expect(mockRpc).toHaveBeenCalledWith(
        "match_candidates",
        expect.objectContaining({
          intent_min: 40,
        }),
      );
    });

    it("applies experience range filters", async () => {
      const jobBuilder = createMockQueryBuilder({
        data: { jd_embedding: "[0.1]" },
      });
      mockFrom.mockReturnValue(jobBuilder);
      mockRpc.mockResolvedValue({ data: [], error: null });

      const { findSimilarCandidates } = await import("@/lib/services/embeddings");
      await findSimilarCandidates("job-1", 10, {
        experienceMin: 3,
        experienceMax: 10,
      });

      expect(mockRpc).toHaveBeenCalledWith(
        "match_candidates",
        expect.objectContaining({
          experience_min: 3,
          experience_max: 10,
        }),
      );
    });

    it("throws when job has no embedding", async () => {
      const jobBuilder = createMockQueryBuilder({
        data: { jd_embedding: null },
      });
      mockFrom.mockReturnValue(jobBuilder);

      const { findSimilarCandidates } = await import("@/lib/services/embeddings");
      await expect(findSimilarCandidates("job-1")).rejects.toThrow("no embedding");
    });

    it("returns empty array on RPC error", async () => {
      const jobBuilder = createMockQueryBuilder({
        data: { jd_embedding: "[0.1]" },
      });
      mockFrom.mockReturnValue(jobBuilder);
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: "RPC failed" },
      });

      const { findSimilarCandidates } = await import("@/lib/services/embeddings");
      const results = await findSimilarCandidates("job-1");

      expect(results).toEqual([]);
    });

    it("uses default threshold of 0.6 and limit of 20", async () => {
      const jobBuilder = createMockQueryBuilder({
        data: { jd_embedding: "[0.1]" },
      });
      mockFrom.mockReturnValue(jobBuilder);
      mockRpc.mockResolvedValue({ data: [], error: null });

      const { findSimilarCandidates } = await import("@/lib/services/embeddings");
      await findSimilarCandidates("job-1");

      expect(mockRpc).toHaveBeenCalledWith(
        "match_candidates",
        expect.objectContaining({
          match_threshold: 0.6,
          match_count: 20,
        }),
      );
    });
  });

  describe("embedAllCandidates", () => {
    it("embeds candidates missing embeddings in batches", async () => {
      // Mock: list candidates without embeddings
      const listBuilder = createMockQueryBuilder({
        data: [{ id: "c-1" }, { id: "c-2" }],
      });
      // Mock: individual candidate fetch for embedCandidate
      const candidateBuilder = createMockQueryBuilder({
        data: {
          name: "Test",
          current_role: "Dev",
          seniority_level: "mid",
          skills: ["JS"],
          experience_years: 3,
          location: "SF",
        },
      });
      const updateBuilder = createMockQueryBuilder({ data: null });

      let fromCallCount = 0;
      mockFrom.mockImplementation(() => {
        fromCallCount++;
        // First call: list candidates with no embedding
        if (fromCallCount === 1) return listBuilder;
        // Even calls: candidate select, odd calls: update
        return fromCallCount % 2 === 0 ? candidateBuilder : updateBuilder;
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ embedding: [0.1] }] }),
        text: () => Promise.resolve(""),
      });

      const { embedAllCandidates } = await import("@/lib/services/embeddings");
      const result = await embedAllCandidates(50);

      expect(result).toHaveProperty("embedded");
      expect(result).toHaveProperty("errors");
      expect(result.embedded + result.errors).toBe(2);
    });
  });

  describe("embedAllJobs", () => {
    it("embeds jobs missing embeddings", async () => {
      const listBuilder = createMockQueryBuilder({
        data: [{ id: "j-1" }],
      });
      const jobBuilder = createMockQueryBuilder({
        data: {
          title: "Engineer",
          description: "Build things",
          location: "Remote",
          seniority_level: "senior",
          role_function: "Eng",
          skills_required: ["Go"],
        },
      });
      const updateBuilder = createMockQueryBuilder({ data: null });

      let fromCallCount = 0;
      mockFrom.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) return listBuilder;
        return fromCallCount % 2 === 0 ? jobBuilder : updateBuilder;
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ embedding: [0.1] }] }),
        text: () => Promise.resolve(""),
      });

      const { embedAllJobs } = await import("@/lib/services/embeddings");
      const result = await embedAllJobs(50);

      expect(result).toHaveProperty("embedded");
      expect(result).toHaveProperty("errors");
    });
  });
});
