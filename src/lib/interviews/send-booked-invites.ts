import { sendEmail, sendInterviewBooked as sendInterviewBookedEmail } from "@/lib/services/resend";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { ACK_FLAG_KEYS } from "@/lib/acknowledgements/flags";
import { isEnabled } from "@/lib/feature-flags";
import { env } from "@/lib/config/env";
import {
  logInterviewNotificationAttempt,
  type InterviewNotificationAttemptInput,
} from "@/lib/interviews/notification-log";
import {
  type DeliveryChannelKey,
  type DeliveryChannelStatus,
  type SlotDeliveryFields,
  nextDeliveryStatus,
} from "@/lib/interviews/delivery-status";
import { buildInterviewInviteIcs } from "@/lib/interviews/ics";
import {
  isNotetakerDisclosureRequired,
  RECORDING_DISCLOSURE_TEXT,
} from "@/lib/interviews/notetaker-disclosure";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/locale/display";

export interface BookedInviteContext {
  jobId: string;
  jobTitle: string;
  stageName?: string | null;
  pipelineCandidateId?: string | null;
  candidateId?: string | null;
  candidateName?: string | null;
  candidatePhone?: string | null;
  candidateEmail?: string | null;
  interviewerName?: string | null;
  interviewerEmail?: string | null;
  slotStartAt: string;
  slotEndAt: string;
  slotId: string;
  /** Video link for the interview, when there is one. */
  meetingUrl?: string | null;
  /** The event is already on the interviewer's calendar (they got the invite from it). */
  onCalendar?: boolean;
}

function fmtDateTime(startAt: string): { date: string; time: string; timeLabel: string } {
  const timeLabel = formatDisplayDateTime(startAt);
  return {
    date: formatDisplayDate(startAt, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    time: timeLabel,
    timeLabel,
  };
}

async function logAttempt(
  ctx: BookedInviteContext,
  args: Omit<InterviewNotificationAttemptInput, "jobId" | "fromState" | "toState">,
) {
  await logInterviewNotificationAttempt({
    ...args,
    jobId: ctx.jobId,
    pipelineCandidateId: ctx.pipelineCandidateId ?? null,
    candidateId: ctx.candidateId ?? null,
    fromState: "slot_picked",
    toState: "booked",
  });
}

async function isCandidateWhatsAppCritical(
  organisationId: string | null | undefined,
): Promise<boolean> {
  if (!env.outboundNotificationsEnabled) return false;
  return isEnabled(ACK_FLAG_KEYS.channelWhatsappEnabled, organisationId ?? null);
}

export interface SendBookedInvitesOptions {
  organisationId?: string | null;
  previous?: SlotDeliveryFields | null;
  /** When set, only these channels are attempted (resend). When empty, all critical channels run. */
  channelsToRetry?: DeliveryChannelKey[] | null;
}

export interface SendBookedInvitesResult extends SlotDeliveryFields {
  channelResults: Record<DeliveryChannelKey, { status: DeliveryChannelStatus; attempted: boolean }>;
}

function shouldAttemptChannel(
  channel: DeliveryChannelKey,
  options: SendBookedInvitesOptions,
): boolean {
  const retry = options.channelsToRetry;
  if (retry == null) return true;
  if (retry.length === 0) return true;
  return retry.includes(channel);
}

/**
 * Delivers critical booked-invite channels (candidate email, interviewer ICS email,
 * candidate WhatsApp when enabled). Interviewer WA and recruiter copies are non-critical.
 */
export async function sendBookedInterviewInvites(
  ctx: BookedInviteContext,
  options: SendBookedInvitesOptions = {},
): Promise<SendBookedInvitesResult> {
  const when = fmtDateTime(ctx.slotStartAt);
  const candidateName = (ctx.candidateName ?? "Candidate").trim() || "Candidate";
  const interviewerName = (ctx.interviewerName ?? "Interviewer").trim() || "Interviewer";
  const previous = options.previous ?? null;
  // Recording disclosure appears only when the org's notetaker is actually on. (#354)
  const recordingNotice = (await isNotetakerDisclosureRequired(options.organisationId))
    ? RECORDING_DISCLOSURE_TEXT
    : null;

  const channelResults: SendBookedInvitesResult["channelResults"] = {
    candidate_email: { status: null, attempted: false },
    interviewer_email: { status: null, attempted: false },
    candidate_whatsapp: { status: null, attempted: false },
  };

  let candidateEmailStatus: DeliveryChannelStatus = previous?.candidate_email_status ?? null;
  let interviewerEmailStatus: DeliveryChannelStatus = previous?.interviewer_email_status ?? null;
  let candidateWhatsappStatus: DeliveryChannelStatus = previous?.candidate_whatsapp_status ?? null;

  if (shouldAttemptChannel("candidate_email", options)) {
    channelResults.candidate_email.attempted = true;
    if (!ctx.candidateEmail?.trim()) {
      candidateEmailStatus = nextDeliveryStatus(candidateEmailStatus, "failed");
      await logAttempt(ctx, {
        recipientType: "candidate",
        channel: "email",
        templateVariant: "interview_booked",
        outcome: "suppressed",
        reasonCode: "no_channel",
        provider: "resend",
      });
    } else {
      const ce = await sendInterviewBookedEmail({
        candidateEmail: ctx.candidateEmail.trim(),
        candidateName,
        jobTitle: ctx.jobTitle,
        interviewDate: when.date,
        interviewTime: when.time,
        timezone: "IST",
        recordingNotice,
        meetingUrl: ctx.meetingUrl ?? null,
      });
      const emailOk = !ce.skipped && !(ce.data as { error?: unknown } | null | undefined)?.error;
      candidateEmailStatus = nextDeliveryStatus(candidateEmailStatus, emailOk ? "sent" : "failed");
      await logAttempt(ctx, {
        recipientType: "candidate",
        channel: "email",
        templateVariant: "interview_booked",
        outcome: emailOk ? "sent" : "failed",
        reasonCode: ce.skipped
          ? (ce.reason ?? "skipped")
          : ce.data?.error
            ? "provider_error"
            : null,
        provider: "resend",
        providerMessageId: emailOk ? ((ce.data.data as { id?: string } | null)?.id ?? null) : null,
      });
    }
    channelResults.candidate_email.status = candidateEmailStatus;
  }

  if (shouldAttemptChannel("interviewer_email", options)) {
    channelResults.interviewer_email.attempted = true;
    if (!ctx.interviewerEmail?.trim() || !ctx.slotEndAt) {
      interviewerEmailStatus = nextDeliveryStatus(interviewerEmailStatus, "failed");
      await logAttempt(ctx, {
        recipientType: "interviewer",
        channel: "email",
        templateVariant: "interviewer_invite_booked",
        outcome: "suppressed",
        reasonCode: "no_channel",
        provider: "resend",
      });
    } else {
      const inviteIcs = buildInterviewInviteIcs({
        slotId: ctx.slotId,
        title: ctx.jobTitle,
        candidateName,
        startAt: ctx.slotStartAt,
        endAt: ctx.slotEndAt,
        recordingNotice: recordingNotice ?? undefined,
        meetingUrl: ctx.meetingUrl ?? undefined,
      });
      const join = ctx.meetingUrl
        ? `<p><strong>Join:</strong> <a href="${ctx.meetingUrl}">${ctx.meetingUrl}</a></p>`
        : "";
      const ie = await sendEmail({
        to: ctx.interviewerEmail.trim(),
        subject: `Interview invite: ${candidateName} - ${ctx.jobTitle}`,
        html: `<p>Hi ${interviewerName},</p><p>${candidateName} has been scheduled for ${ctx.stageName ?? "Interview"}.</p><p><strong>Date:</strong> ${when.date}<br/><strong>Time:</strong> ${when.time} (IST)</p>${join}${ctx.onCalendar ? "<p>It is already on your calendar.</p>" : ""}${recordingNotice ? `<p style="color:#666;font-size:13px">${recordingNotice}</p>` : ""}`,
        // When the event is already on their calendar, a second .ics would duplicate it.
        attachments: ctx.onCalendar
          ? []
          : [
              {
                filename: "interview-invite.ics",
                content: Buffer.from(inviteIcs, "utf-8").toString("base64"),
              },
            ],
      });
      const ok = !ie.error;
      interviewerEmailStatus = nextDeliveryStatus(interviewerEmailStatus, ok ? "sent" : "failed");
      await logAttempt(ctx, {
        recipientType: "interviewer",
        channel: "email",
        templateVariant: "interviewer_invite_booked",
        outcome: ok ? "sent" : "failed",
        reasonCode: ok ? null : "provider_error",
        reasonDetail: ie.error ? String(ie.error) : null,
        provider: "resend",
        providerMessageId: (ie.data as { id?: string } | null)?.id ?? null,
      });
      await logAttempt(ctx, {
        recipientType: "interviewer",
        channel: "ics",
        templateVariant: "interviewer_invite_booked_ics",
        outcome: ok ? "sent" : "failed",
        reasonCode: ok ? null : "provider_error",
        provider: "ics",
      });
    }
    channelResults.interviewer_email.status = interviewerEmailStatus;
  }

  if (shouldAttemptChannel("candidate_whatsapp", options)) {
    channelResults.candidate_whatsapp.attempted = true;
    const waCritical = await isCandidateWhatsAppCritical(options.organisationId);
    if (!waCritical || !ctx.candidatePhone?.trim()) {
      candidateWhatsappStatus = nextDeliveryStatus(candidateWhatsappStatus, "not_applicable");
      if (!ctx.candidatePhone?.trim()) {
        await logAttempt(ctx, {
          recipientType: "candidate",
          channel: "whatsapp",
          templateVariant: "interview_booked",
          outcome: "suppressed",
          reasonCode: "no_channel",
          provider: "meta_whatsapp",
        });
      }
    } else {
      const wa = await sendWhatsAppMessage(
        ctx.candidatePhone.trim(),
        `Interview confirmed for ${ctx.jobTitle} on ${when.timeLabel}. Check your email for details. We'll remind you before the interview.${
          recordingNotice ? ` ${recordingNotice}` : ""
        }`,
      );
      const ok = wa.success;
      candidateWhatsappStatus = nextDeliveryStatus(candidateWhatsappStatus, ok ? "sent" : "failed");
      await logAttempt(ctx, {
        recipientType: "candidate",
        channel: "whatsapp",
        templateVariant: "interview_booked",
        outcome: ok ? "sent" : "failed",
        reasonCode: ok ? null : "provider_error",
        reasonDetail: wa.error ?? null,
        provider: "meta_whatsapp",
        providerMessageId: wa.messageId ?? null,
      });
    }
    channelResults.candidate_whatsapp.status = candidateWhatsappStatus;
  }

  const now = new Date().toISOString();
  return {
    candidate_email_status: candidateEmailStatus,
    interviewer_email_status: interviewerEmailStatus,
    candidate_whatsapp_status: candidateWhatsappStatus,
    last_delivery_attempt_at: now,
    channelResults,
  };
}
