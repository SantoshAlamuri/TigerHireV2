import type { Provider } from "@/lib/validations/integrations";

export type IntegrationAuthType = "api_key" | "oauth";
export type IntegrationStatus = "connected" | "disconnected" | "error";

export interface IntegrationField {
  key: string;
  label: string;
  helpText?: string;
  helpLink?: string;
  secret?: boolean;
  optional?: boolean;
}

export interface IntegrationDescriptor {
  provider: Provider;
  name: string;
  description: string;
  logoInitial: string;
  logoColor: { bg: string; text: string };
  authType: IntegrationAuthType;
  scopeSupport?: Array<"user" | "organisation" | "platform">;
  fields?: IntegrationField[];
  defaultConfig?: Record<string, unknown>;
  oauthScopes?: string[];
}

export interface SettingsSection {
  id: string;
  label: string;
  href: string;
  description: string;
}
