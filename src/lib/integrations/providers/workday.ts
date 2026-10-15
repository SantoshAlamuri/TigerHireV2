import { errorResult, fetchWithTimeout, okResult, type IntegrationValidationResult } from "./http";

function requireString(config: Record<string, unknown>, key: string): string | null {
  const value = config[key];
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim();
}

export async function validateWorkdayConnection(
  _apiKey: string,
  config: Record<string, unknown>,
): Promise<IntegrationValidationResult> {
  const tokenUrl = requireString(config, "tokenUrl");
  const clientId = requireString(config, "clientId");
  const clientSecret = requireString(config, "clientSecret");
  const scope = requireString(config, "scope");

  if (!tokenUrl || !clientId || !clientSecret) {
    return errorResult("Workday validation requires tokenUrl, clientId, and clientSecret.");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
  });
  if (scope) body.set("scope", scope);

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetchWithTimeout(
    tokenUrl,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    },
    12000,
  );

  if (response.status === 401 || response.status === 403) {
    return errorResult(`Workday OAuth credentials rejected (${response.status}).`);
  }
  if (!response.ok) {
    return errorResult(`Workday token request failed (${response.status}).`);
  }

  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) {
    return errorResult("Workday token response missing access_token.");
  }

  return okResult("Workday OAuth connection validated.", {
    tokenExpiresIn: payload.expires_in ?? null,
  });
}
