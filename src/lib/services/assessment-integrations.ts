export type CodingProvider = "hackerrank" | "codility";

export interface CodingTestSessionRequest {
  provider: CodingProvider;
  candidateEmail: string;
  assessmentTitle: string;
  webhookUrl?: string;
}

export interface CodingTestSessionResponse {
  externalAssessmentId: string;
  launchUrl: string;
}

/**
 * Adapter entrypoint for coding providers.
 * Replace stub implementations with real OAuth/webhook integrations.
 */
export async function createCodingTestSession(
  input: CodingTestSessionRequest,
): Promise<CodingTestSessionResponse> {
  const provider = input.provider.toLowerCase() as CodingProvider;
  if (provider === "hackerrank") {
    return {
      externalAssessmentId: `hr_${Date.now()}`,
      launchUrl: `https://www.hackerrank.com/tests/${encodeURIComponent(input.assessmentTitle)}`,
    };
  }
  return {
    externalAssessmentId: `cd_${Date.now()}`,
    launchUrl: `https://app.codility.com/test/${encodeURIComponent(input.assessmentTitle)}`,
  };
}
