import { isEnabled } from "@/lib/feature-flags";
import { ACK_FLAG_KEYS } from "@/lib/acknowledgements/flags";
import type {
  CandidateAcknowledgementChannel,
  CandidateAcknowledgementIngestionPath,
  CandidateAcknowledgementNotifierInput,
} from "@/lib/acknowledgements/types";

export interface CandidateAcknowledgementChannelPlan {
  channel: CandidateAcknowledgementChannel;
  shouldAttempt: boolean;
  suppressionReasonCode?: string;
}

export interface CandidateAcknowledgementPlan {
  enabled: boolean;
  channels: CandidateAcknowledgementChannelPlan[];
}

function pathFlagKey(path: CandidateAcknowledgementIngestionPath): string {
  switch (path) {
    case "logged_in_apply":
      return ACK_FLAG_KEYS.pathLoggedInApplyEnabled;
    case "public_apply":
      return ACK_FLAG_KEYS.pathPublicApplyEnabled;
    case "agency_single":
      return ACK_FLAG_KEYS.pathAgencySingleEnabled;
    case "agency_bulk":
      return ACK_FLAG_KEYS.pathAgencyBulkEnabled;
    case "email_intake":
      return ACK_FLAG_KEYS.pathEmailIntakeEnabled;
    case "referral_pre_consent":
      return ACK_FLAG_KEYS.pathReferralPreConsentEnabled;
    default:
      return ACK_FLAG_KEYS.pathPublicApplyEnabled;
  }
}

/**
 * PR-0a skeleton: computes whether acknowledgement attempts should run by flag/policy.
 * Live send wiring is intentionally deferred to path rollout PRs.
 */
export async function buildCandidateAcknowledgementPlan(
  input: CandidateAcknowledgementNotifierInput,
): Promise<CandidateAcknowledgementPlan> {
  const notifierEnabled = await isEnabled(ACK_FLAG_KEYS.notifierEnabled);
  if (!notifierEnabled) {
    return {
      enabled: false,
      channels: [
        { channel: "email", shouldAttempt: false, suppressionReasonCode: "notifier_disabled" },
        { channel: "whatsapp", shouldAttempt: false, suppressionReasonCode: "notifier_disabled" },
      ],
    };
  }

  const pathEnabled = await isEnabled(pathFlagKey(input.ingestionPath));
  if (!pathEnabled) {
    return {
      enabled: false,
      channels: [
        {
          channel: "email",
          shouldAttempt: false,
          suppressionReasonCode: "ingestion_path_disabled",
        },
        {
          channel: "whatsapp",
          shouldAttempt: false,
          suppressionReasonCode: "ingestion_path_disabled",
        },
      ],
    };
  }

  const [emailChannelEnabled, whatsappChannelEnabled] = await Promise.all([
    isEnabled(ACK_FLAG_KEYS.channelEmailEnabled),
    isEnabled(ACK_FLAG_KEYS.channelWhatsappEnabled),
  ]);

  const emailPlan: CandidateAcknowledgementChannelPlan = !emailChannelEnabled
    ? { channel: "email", shouldAttempt: false, suppressionReasonCode: "channel_disabled" }
    : !input.candidateEmail
      ? { channel: "email", shouldAttempt: false, suppressionReasonCode: "no_channel" }
      : input.emailConsent === false
        ? { channel: "email", shouldAttempt: false, suppressionReasonCode: "no_consent" }
        : { channel: "email", shouldAttempt: true };

  const whatsappPlan: CandidateAcknowledgementChannelPlan = !whatsappChannelEnabled
    ? { channel: "whatsapp", shouldAttempt: false, suppressionReasonCode: "channel_disabled" }
    : !input.candidatePhone
      ? { channel: "whatsapp", shouldAttempt: false, suppressionReasonCode: "no_channel" }
      : input.whatsappConsent === false
        ? { channel: "whatsapp", shouldAttempt: false, suppressionReasonCode: "no_consent" }
        : { channel: "whatsapp", shouldAttempt: true };

  return {
    enabled: true,
    channels: [emailPlan, whatsappPlan],
  };
}
