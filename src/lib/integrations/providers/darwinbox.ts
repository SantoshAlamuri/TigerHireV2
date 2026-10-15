import { errorResult, fetchWithTimeout, okResult, type IntegrationValidationResult } from "./http";

function requireString(config: Record<string, unknown>, key: string): string | null {
  const value = config[key];
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim();
}

export async function validateDarwinboxConnection(
  apiKey: string,
  config: Record<string, unknown>,
): Promise<IntegrationValidationResult> {
  const clientId = requireString(config, "clientId");
  const clientSecret = requireString(config, "clientSecret");
  const baseUrl = requireString(config, "baseUrl");
  const authPath = requireString(config, "authPath") ?? "/oauth/token";

  if (!clientId || !clientSecret || !apiKey || !baseUrl) {
    return errorResult(
      "Darwinbox validation requires baseUrl, clientId, clientSecret, and apiKey.",
    );
  }

  const tokenUrl = `${baseUrl.replace(/\/+$/, "")}${authPath.startsWith("/") ? authPath : `/${authPath}`}`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    api_key: apiKey,
  });

  const response = await fetchWithTimeout(
    tokenUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    },
    12000,
  );

  if (response.status === 401 || response.status === 403) {
    return errorResult(`Darwinbox credentials rejected (${response.status}).`);
  }
  if (response.status === 404) {
    return errorResult("Darwinbox token endpoint not found. Verify baseUrl/authPath.");
  }
  if (!response.ok) {
    return errorResult(`Darwinbox token request failed (${response.status}).`);
  }

  return okResult("Darwinbox connection validated.");
}
