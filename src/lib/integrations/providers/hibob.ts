import { errorResult, fetchWithTimeout, okResult, type IntegrationValidationResult } from "./http";

function requireString(config: Record<string, unknown>, key: string): string | null {
  const value = config[key];
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim();
}

export async function validateHiBobConnection(
  apiKey: string,
  config: Record<string, unknown>,
): Promise<IntegrationValidationResult> {
  const serviceUserId = requireString(config, "serviceUserId");
  const baseUrl = requireString(config, "baseUrl") ?? "https://api.hibob.com";

  if (!serviceUserId || !apiKey) {
    return errorResult("HiBob validation requires serviceUserId and apiKey.");
  }

  const auth = Buffer.from(`${serviceUserId}:${apiKey}`).toString("base64");
  const response = await fetchWithTimeout(
    `${baseUrl.replace(/\/+$/, "")}/v1/metadata/fields`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    },
    12000,
  );

  if (response.status === 401) {
    return errorResult("HiBob authentication failed (401).");
  }
  if (!response.ok) {
    return errorResult(`HiBob connectivity check failed (${response.status}).`);
  }

  return okResult("HiBob connection validated.");
}
