import { createSupabaseAdmin } from "@/lib/supabase/admin";

const DOMAIN_PATTERN = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

/**
 * Consumer / free-email domains that must never be treated as corporate SSO domains.
 * Kept in sync with `blocked_public_domains` seed in migrations so auth still routes
 * individuals through the public OAuth path even if the DB table is empty or drifted.
 */
const BUILTIN_BLOCKED_PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "rocketmail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "zoho.com",
  "yandex.com",
  "mail.com",
  "gmx.com",
  "gmx.net",
  "fastmail.com",
]);

export function extractDomain(email: string): string {
  const normalized = email.trim().toLowerCase();
  const [, domain = ""] = normalized.split("@");
  return domain.trim();
}

export function isValidDomain(domain: string): boolean {
  return DOMAIN_PATTERN.test(domain);
}

export async function isPublicDomain(domain: string): Promise<boolean> {
  const normalized = domain.trim().toLowerCase();
  if (!normalized) return true;
  if (BUILTIN_BLOCKED_PUBLIC_EMAIL_DOMAINS.has(normalized)) return true;
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("blocked_public_domains")
    .select("domain")
    .eq("domain", normalized)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function resolveCompanyFromDomain(
  domain: string,
): Promise<{ company_id: string; verified: boolean; provider_type?: string | null } | null> {
  const normalized = domain.trim().toLowerCase();
  if (!normalized || !isValidDomain(normalized)) return null;
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("company_sso_mappings")
    .select("company_id, domain_verified_at, provider_type")
    .eq("primary_domain", normalized)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data?.company_id) return null;
  return {
    company_id: String(data.company_id),
    verified: Boolean(data.domain_verified_at),
    provider_type: typeof data.provider_type === "string" ? data.provider_type : null,
  };
}

export type OAuthDomainResolutionReason =
  | "invalid_domain"
  | "public_domain_blocked"
  | "domain_not_claimed"
  | "domain_unverified"
  | "domain_verified";

export interface OAuthDomainResolution {
  reason: OAuthDomainResolutionReason;
  domain: string;
  companyId: string | null;
  providerType: string | null;
}

/**
 * Resolve OAuth email domain to a company and explicit deny reason.
 * This powers callback routing decisions and makes denial auditing deterministic.
 */
export async function resolveOauthCompanyFromEmail(email: string): Promise<OAuthDomainResolution> {
  const domain = extractDomain(email);
  if (!domain || !isValidDomain(domain)) {
    return { reason: "invalid_domain", domain, companyId: null, providerType: null };
  }

  if (await isPublicDomain(domain)) {
    return { reason: "public_domain_blocked", domain, companyId: null, providerType: null };
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("company_sso_mappings")
    .select("company_id, domain_verified_at, provider_type")
    .eq("primary_domain", domain)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;

  if (!data?.company_id) {
    return { reason: "domain_not_claimed", domain, companyId: null, providerType: null };
  }

  const companyId = String(data.company_id);
  const providerType = typeof data.provider_type === "string" ? data.provider_type : null;
  if (!data.domain_verified_at) {
    return { reason: "domain_unverified", domain, companyId, providerType };
  }

  return { reason: "domain_verified", domain, companyId, providerType };
}
