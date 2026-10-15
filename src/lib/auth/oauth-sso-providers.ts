/**
 * Supabase Auth OAuth provider IDs for login (`/api/auth/sso`) and linking (`/api/auth/link`).
 * Keep in sync with Supabase Dashboard → Authentication → Providers.
 */
export const OAUTH_SSO_PROVIDERS = ["google", "linkedin_oidc", "azure"] as const;

export type OAuthSsoProvider = (typeof OAUTH_SSO_PROVIDERS)[number];

export function isOAuthSsoProvider(value: string): value is OAuthSsoProvider {
  return (OAUTH_SSO_PROVIDERS as readonly string[]).includes(value);
}
