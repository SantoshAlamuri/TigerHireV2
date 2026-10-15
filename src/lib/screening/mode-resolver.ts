import type { ScreeningDefaultMode, ScreeningMode, ScreeningTenantSettings } from "./types";

export type ResolveScreeningModeInput = {
  fitScore: number;
  tenant: ScreeningTenantSettings;
  reqModeOverride?: ScreeningDefaultMode | null;
  monthToDateVoiceSpendInr?: number;
  expectedNextVoiceChargeInr?: number;
};

export type ResolveScreeningModeResult = {
  mode: ScreeningMode;
  thresholdPassed: boolean;
  preferredDefaultMode: ScreeningDefaultMode;
  fallbackApplied: boolean;
  reason:
    | "below_threshold"
    | "mode_off"
    | "whatsapp_default"
    | "voice_default"
    | "voice_disabled_fallback_whatsapp"
    | "voice_cap_fallback_whatsapp";
};

function toPipelineMode(defaultMode: ScreeningDefaultMode): ScreeningMode {
  if (defaultMode === "off") return "none";
  return defaultMode;
}

function shouldFallbackFromVoice(args: {
  voiceEnabled: boolean;
  capInr: number | null;
  monthToDateVoiceSpendInr?: number;
  expectedNextVoiceChargeInr?: number;
}): { fallback: boolean; reason: ResolveScreeningModeResult["reason"] | null } {
  if (!args.voiceEnabled) {
    return { fallback: true, reason: "voice_disabled_fallback_whatsapp" };
  }

  if (args.capInr == null || args.capInr <= 0) {
    return { fallback: false, reason: null };
  }

  const monthToDate = args.monthToDateVoiceSpendInr ?? 0;
  const nextCharge = args.expectedNextVoiceChargeInr ?? 99;
  if (monthToDate + nextCharge > args.capInr) {
    return { fallback: true, reason: "voice_cap_fallback_whatsapp" };
  }
  return { fallback: false, reason: null };
}

export function resolveScreeningMode(input: ResolveScreeningModeInput): ResolveScreeningModeResult {
  const thresholdPassed = input.fitScore >= input.tenant.screening_fitscore_threshold;
  const preferredDefaultMode = input.reqModeOverride ?? input.tenant.screening_default_mode;

  if (!thresholdPassed) {
    return {
      mode: "none",
      thresholdPassed: false,
      preferredDefaultMode,
      fallbackApplied: false,
      reason: "below_threshold",
    };
  }

  const preferredMode = toPipelineMode(preferredDefaultMode);
  if (preferredMode === "none") {
    return {
      mode: "none",
      thresholdPassed: true,
      preferredDefaultMode,
      fallbackApplied: false,
      reason: "mode_off",
    };
  }

  if (preferredMode === "whatsapp") {
    return {
      mode: "whatsapp",
      thresholdPassed: true,
      preferredDefaultMode,
      fallbackApplied: false,
      reason: "whatsapp_default",
    };
  }

  const fallback = shouldFallbackFromVoice({
    voiceEnabled: input.tenant.voice_screening_enabled,
    capInr: input.tenant.voice_screening_monthly_cap_inr,
    monthToDateVoiceSpendInr: input.monthToDateVoiceSpendInr,
    expectedNextVoiceChargeInr: input.expectedNextVoiceChargeInr,
  });

  if (fallback.fallback) {
    return {
      mode: "whatsapp",
      thresholdPassed: true,
      preferredDefaultMode,
      fallbackApplied: true,
      reason: fallback.reason ?? "voice_disabled_fallback_whatsapp",
    };
  }

  return {
    mode: "voice",
    thresholdPassed: true,
    preferredDefaultMode,
    fallbackApplied: false,
    reason: "voice_default",
  };
}
