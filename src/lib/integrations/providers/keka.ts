import { errorResult, fetchWithTimeout, okResult, type IntegrationValidationResult } from "./http";

function requireString(config: Record<string, unknown>, key: string): string | null {
  const value = config[key];
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim();
}

export async function validateKekaConnection(
  apiKey: string,
  config: Record<string, unknown>,
): Promise<IntegrationValidationResult> {
  const clientId = requireString(config, "clientId");
  const clientSecret = requireString(config, "clientSecret");
  const identityUrl =
    requireString(config, "identityUrl") ?? "https://login.keka.com/connect/token";

  if (!clientId || !clientSecret || !apiKey) {
    return errorResult("Keka validation requires clientId, clientSecret, and apiKey.");
  }

  const body = new URLSearchParams({
    grant_type: "kekaapi",
    scope: "kekaapi",
    client_id: clientId,
    client_secret: clientSecret,
    api_key: apiKey,
  });

  const response = await fetchWithTimeout(
    identityUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "TigerHire" },
      body: body.toString(),
    },
    12000,
  );

  if (!response.ok) {
    return errorResult(`Keka token exchange failed (${response.status}).`);
  }

  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) {
    return errorResult("Keka token response missing access_token.");
  }

  return okResult("Keka connection validated via token exchange.", {
    tokenExpiresIn: payload.expires_in ?? null,
  });
}
