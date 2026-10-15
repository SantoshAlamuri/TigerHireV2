import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const DOMAIN_PATTERN = /^[a-z0-9.-]+\.[a-z]{2,}$/i;
const PUBLIC_DOMAIN_BLOCKLIST = new Set([
  "gmail.com",
  "outlook.com",
  "yahoo.com",
  "hotmail.com",
  "icloud.com",
]);

export function extractEmailDomain(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const parts = normalized.split("@");
  if (parts.length !== 2) return null;
  const domain = parts[1]?.trim();
  if (!domain || !DOMAIN_PATTERN.test(domain)) return null;
  return domain;
}

export function isBlockedPublicDomain(domain: string): boolean {
  return PUBLIC_DOMAIN_BLOCKLIST.has(domain.toLowerCase());
}

export function generateDomainVerificationToken(): string {
  return randomBytes(16).toString("hex");
}

export function buildDomainVerificationTxtValue(companyId: string, token: string): string {
  return `tigerhire-domain-verify=${companyId}:${token}`;
}

export async function resolveCompanyFromEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<string | null> {
  const domain = extractEmailDomain(email);
  if (!domain) return null;
  const { data, error } = await supabase
    .from("company_sso_mappings")
    .select("company_id")
    .eq("primary_domain", domain)
    .not("domain_verified_at", "is", null)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return (data?.company_id as string | undefined) ?? null;
}
