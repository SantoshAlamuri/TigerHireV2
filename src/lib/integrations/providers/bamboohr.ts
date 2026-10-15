import { errorResult, fetchWithTimeout, okResult, type IntegrationValidationResult } from "./http";

function requireString(config: Record<string, unknown>, key: string): string | null {
  const value = config[key];
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim();
}

export async function validateBambooHrConnection(
  apiKey: string,
  config: Record<string, unknown>,
): Promise<IntegrationValidationResult> {
  const companyDomain = requireString(config, "companyDomain");

  if (!companyDomain || !apiKey) {
    return errorResult("BambooHR validation requires companyDomain and apiKey.");
  }

  const baseUrl = `https://${companyDomain}.bamboohr.com`;
  const auth = Buffer.from(`${apiKey}:x`).toString("base64");
  const response = await fetchWithTimeout(
    `${baseUrl}/api/v1/meta/fields`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    },
    12000,
  );

  if (response.status === 401 || response.status === 403) {
    return errorResult(`BambooHR authentication failed (${response.status}).`);
  }
  if (response.status === 404) {
    return errorResult("BambooHR endpoint not found. Verify companyDomain.");
  }
  if (!response.ok) {
    return errorResult(`BambooHR connectivity check failed (${response.status}).`);
  }

  return okResult("BambooHR connection validated.");
}
