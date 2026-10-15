import type { SupabaseClient } from "@supabase/supabase-js";
import { getConnection } from "@/lib/repositories/integration-connections.repository";
import { retrieveSecret } from "@/lib/services/secrets";
import type { HrisProvider, HrisSyncMode } from "@/lib/validations/hris-sync";
import { validateKekaConnection } from "@/lib/integrations/providers/keka";
import { validateDarwinboxConnection } from "@/lib/integrations/providers/darwinbox";
import { validateHiBobConnection } from "@/lib/integrations/providers/hibob";
import { validateBambooHrConnection } from "@/lib/integrations/providers/bamboohr";
import { validateWorkdayConnection } from "@/lib/integrations/providers/workday";

interface ExecuteHrisSyncArgs {
  supabase: SupabaseClient;
  organisationId: string;
  provider: HrisProvider;
  mode: HrisSyncMode;
}

export interface HrisSyncSummary {
  provider: HrisProvider;
  mode: HrisSyncMode;
  connectivity: {
    ok: boolean;
    message: string;
  };
  capabilities: {
    employeePull: "pending_build";
    requisitionPull: "pending_build";
    hirePushback: "pending_build";
    reconciliationReport: "started";
  };
  report: {
    generatedAt: string;
    gapCount: number;
    gaps: string[];
  };
}

const DEFAULT_GAPS = [
  "Employee pull mapping and upsert pipeline not implemented yet.",
  "Requisition pull mapping and de-duplication pipeline not implemented yet.",
  "Hire pushback worker with idempotency guarantees not implemented yet.",
];

export async function executeHrisSync(args: ExecuteHrisSyncArgs): Promise<HrisSyncSummary> {
  const connection = await getConnection(args.supabase, {
    scope: "organisation",
    provider: args.provider,
    organisationId: args.organisationId,
  });

  if (!connection) {
    return {
      provider: args.provider,
      mode: args.mode,
      connectivity: { ok: false, message: "Integration is not connected for this organisation." },
      capabilities: {
        employeePull: "pending_build",
        requisitionPull: "pending_build",
        hirePushback: "pending_build",
        reconciliationReport: "started",
      },
      report: {
        generatedAt: new Date().toISOString(),
        gapCount: DEFAULT_GAPS.length + 1,
        gaps: ["Integration connection missing. Configure credentials first.", ...DEFAULT_GAPS],
      },
    };
  }

  if (!connection.secret_ref) {
    return {
      provider: args.provider,
      mode: args.mode,
      connectivity: { ok: false, message: "Integration secret reference is missing." },
      capabilities: {
        employeePull: "pending_build",
        requisitionPull: "pending_build",
        hirePushback: "pending_build",
        reconciliationReport: "started",
      },
      report: {
        generatedAt: new Date().toISOString(),
        gapCount: DEFAULT_GAPS.length + 1,
        gaps: ["No secret configured for provider connection.", ...DEFAULT_GAPS],
      },
    };
  }

  const apiKey = await retrieveSecret(connection.secret_ref);
  const config = (connection.config ?? {}) as Record<string, unknown>;

  let validationMessage = "Provider validation is not implemented.";
  let connectivityOk = false;
  if (args.provider === "keka") {
    const result = await validateKekaConnection(apiKey, config);
    connectivityOk = result.ok;
    validationMessage = result.message;
  } else if (args.provider === "darwinbox") {
    const result = await validateDarwinboxConnection(apiKey, config);
    connectivityOk = result.ok;
    validationMessage = result.message;
  } else if (args.provider === "hibob") {
    const result = await validateHiBobConnection(apiKey, config);
    connectivityOk = result.ok;
    validationMessage = result.message;
  } else if (args.provider === "bamboohr") {
    const result = await validateBambooHrConnection(apiKey, config);
    connectivityOk = result.ok;
    validationMessage = result.message;
  } else if (args.provider === "workday") {
    const result = await validateWorkdayConnection(apiKey, config);
    connectivityOk = result.ok;
    validationMessage = result.message;
  }

  return {
    provider: args.provider,
    mode: args.mode,
    connectivity: {
      ok: connectivityOk,
      message: validationMessage,
    },
    capabilities: {
      employeePull: "pending_build",
      requisitionPull: "pending_build",
      hirePushback: "pending_build",
      reconciliationReport: "started",
    },
    report: {
      generatedAt: new Date().toISOString(),
      gapCount: connectivityOk ? DEFAULT_GAPS.length : DEFAULT_GAPS.length + 1,
      gaps: connectivityOk
        ? DEFAULT_GAPS
        : [`Connectivity check failed: ${validationMessage}`, ...DEFAULT_GAPS],
    },
  };
}
