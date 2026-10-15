import { errorResult, fetchWithTimeout, okResult, type IntegrationValidationResult } from "./http";

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function validateSsoProviderConfig(
  provider: "google_sso" | "microsoft_sso" | "okta_sso",
  config: Record<string, unknown>,
): Promise<IntegrationValidationResult> {
  if (provider === "google_sso") {
    if (!isNonEmpty(config.clientId) || !isNonEmpty(config.clientSecret)) {
      return errorResult("Google SSO requires clientId and clientSecret.");
    }
    if (!String(config.clientId).includes(".apps.googleusercontent.com")) {
      return errorResult("Google clientId must be a valid Google OAuth Web Client ID.");
    }
    const response = await fetchWithTimeout(
      "https://accounts.google.com/.well-known/openid-configuration",
    );
    if (!response.ok) {
      return errorResult("Google OIDC discovery failed.");
    }
    return okResult("Google SSO metadata validated.");
  }

  if (provider === "microsoft_sso") {
    if (
      !isNonEmpty(config.tenantId) ||
      !isNonEmpty(config.clientId) ||
      !isNonEmpty(config.clientSecret)
    ) {
      return errorResult("Microsoft SSO requires tenantId, clientId, and clientSecret.");
    }
    const tenant = encodeURIComponent(String(config.tenantId));
    const url = `https://login.microsoftonline.com/${tenant}/v2.0/.well-known/openid-configuration`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      return errorResult("Microsoft Entra OIDC discovery failed for the tenant.");
    }
    return okResult("Microsoft SSO metadata validated.");
  }

  if (
    !isNonEmpty(config.issuer) ||
    !isNonEmpty(config.clientId) ||
    !isNonEmpty(config.clientSecret)
  ) {
    return errorResult("Okta SSO requires issuer, clientId, and clientSecret.");
  }
  const issuer = String(config.issuer).replace(/\/+$/, "");
  const discoveryUrl = `${issuer}/.well-known/openid-configuration`;
  const response = await fetchWithTimeout(discoveryUrl);
  if (!response.ok) {
    return errorResult("Okta OIDC discovery failed for issuer URL.");
  }
  return okResult("Okta SSO metadata validated.");
}
