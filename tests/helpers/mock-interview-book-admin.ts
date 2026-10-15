import { vi } from "vitest";

/** Supabase error shape that triggers fallback in `bookInterviewSlotAtomically` (no RPC in test DB). */
export const MOCK_RPC_MISSING_FN_MESSAGE =
  "Could not find the function public.th_book_interview_slot (PGRST202)";

export const mockInterviewBookAdminRpc = vi.fn();

const defaultPipelineCandidate = {
  id: "pc1",
  candidate_id: "c1",
  stage_id: null,
  candidates: { name: "Test Candidate", email: "candidate@example.com", phone: null },
};

/**
 * Minimal admin client for interview book route tests: invite context reads and `th_book_interview_slot` RPC.
 */
export function createInterviewBookMockAdmin(
  overrides: {
    pipelineCandidate?: Record<string, unknown> | null;
    jobTitle?: string;
  } = {},
) {
  const pcData =
    overrides.pipelineCandidate === undefined
      ? defaultPipelineCandidate
      : overrides.pipelineCandidate;

  return {
    from: vi.fn((table: string) => {
      if (table === "pipeline_candidates") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: pcData, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "jobs") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { title: overrides.jobTitle ?? "Test Job" },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "pipeline_stages") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      }
      if (table === "interview_availability_slots") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    id: "s1",
                    candidate_email_status: null,
                    interviewer_email_status: null,
                    candidate_whatsapp_status: null,
                    last_delivery_attempt_at: null,
                  },
                  error: null,
                }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      };
    }),
    rpc: (fn: string, args: Record<string, unknown>) => mockInterviewBookAdminRpc(fn, args),
  };
}

export function resetInterviewBookAdminRpc() {
  mockInterviewBookAdminRpc.mockReset();
}

export function mockInterviewBookRpcSuccess(startAt: string, endAt: string | null) {
  mockInterviewBookAdminRpc.mockResolvedValue({
    data: [{ success: true, start_at: startAt, end_at: endAt }],
    error: null,
  });
}

export function mockInterviewBookRpcMissingFunction() {
  mockInterviewBookAdminRpc.mockResolvedValue({
    data: null,
    error: { message: MOCK_RPC_MISSING_FN_MESSAGE },
  });
}
