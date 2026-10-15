import { sendEmail } from "@/lib/services/resend";
import {
  sendInterviewCancelledTemplate,
  sendInterviewReminderTemplate,
  sendInterviewSlotsTemplate,
  sendInterviewRescheduledTemplate,
  sendWhatsAppMessage,
} from "@/lib/services/whatsapp";
import {
  sendInterviewCancelled,
  sendInterviewReminder,
  sendInterviewRescheduled,
} from "@/lib/services/resend";
import {
  logInterviewNotificationAttempt,
  type InterviewNotificationAttemptInput,
} from "@/lib/interviews/notification-log";
import { assertTransition, type InterviewState } from "@/lib/interviews/state-machine";
import { buildInterviewInviteIcs } from "@/lib/interviews/ics";
import { sendBookedInterviewInvites } from "@/lib/interviews/send-booked-invites";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/locale/display";

interface TransitionContext {
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
  interviewerPhone?: string | null;
  slotStartAt?: string | null;
  slotEndAt?: string | null;
  slotOptions?: Array<string>;
  slotId?: string | null;
  organisationId?: string | null;
}

function fmtDateTime(startAt: string): { date: string; time: string; timeLabel: string } {
  const date = new Date(startAt);
  const timeLabel = formatDisplayDateTime(startAt);
  return {
    date: formatDisplayDate(startAt, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    time: timeLabel.replace(/ IST$/, ""),
    timeLabel,
  };
}

export async function onInterviewTransition(
  from: InterviewState,
  to: InterviewState,
  ctx: TransitionContext,
): Promise<void> {
  assertTransition(from, to);

  const candidateName = (ctx.candidateName ?? "Candidate").trim() || "Candidate";
  const interviewerName = (ctx.interviewerName ?? "Interviewer").trim() || "Interviewer";

  const attempt = async (
    args: Omit<InterviewNotificationAttemptInput, "jobId" | "fromState" | "toState">,
  ) =>
    logInterviewNotificationAttempt({
      ...args,
      jobId: ctx.jobId,
      pipelineCandidateId: ctx.pipelineCandidateId ?? null,
      candidateId: ctx.candidateId ?? null,
      fromState: from,
      toState: to,
    });

  // Transition: slots_sent
  if (to === "slots_sent") {
    if (!ctx.candidatePhone) {
      await attempt({
        recipientType: "candidate",
        channel: "whatsapp",
        templateVariant: "th_interview_slots",
        outcome: "suppressed",
        reasonCode: "no_channel",
        provider: "meta_whatsapp",
      });
      return;
    }
    const [slot1, slot2, slot3] = ctx.slotOptions ?? ["TBD", "TBD", "TBD"];
    const wa = await sendInterviewSlotsTemplate({
      phone: ctx.candidatePhone,
      candidateName,
      jobTitle: ctx.jobTitle,
      slot1,
      slot2,
      slot3,
      applicationId: ctx.pipelineCandidateId ?? undefined,
    });
    await attempt({
      recipientType: "candidate",
      channel: "whatsapp",
      templateVariant: "th_interview_slots",
      outcome: wa.success ? "sent" : "failed",
      reasonCode: wa.success ? null : "provider_error",
      reasonDetail: wa.error ?? null,
      provider: "meta_whatsapp",
      providerMessageId: wa.messageId ?? null,
      metadata: { slot1, slot2, slot3 },
    });
    return;
  }

  if (!ctx.slotStartAt) {
    await attempt({
      recipientType: "candidate",
      channel: "email",
      templateVariant: `interview_${to}`,
      outcome: "suppressed",
      reasonCode: "missing_slot_time",
      provider: "resend",
    });
    return;
  }
  const when = fmtDateTime(ctx.slotStartAt);

  if (to === "booked") {
    if (ctx.slotId && ctx.slotEndAt) {
      await sendBookedInterviewInvites(
        {
          jobId: ctx.jobId,
          jobTitle: ctx.jobTitle,
          stageName: ctx.stageName,
          pipelineCandidateId: ctx.pipelineCandidateId,
          candidateId: ctx.candidateId,
          candidateName: ctx.candidateName,
          candidateEmail: ctx.candidateEmail,
          candidatePhone: ctx.candidatePhone,
          interviewerEmail: ctx.interviewerEmail,
          interviewerName: ctx.interviewerName,
          slotStartAt: ctx.slotStartAt,
          slotEndAt: ctx.slotEndAt,
          slotId: ctx.slotId,
        },
        { organisationId: ctx.organisationId },
      );
    }
    if (ctx.interviewerPhone) {
      const iw = await sendWhatsAppMessage(
        ctx.interviewerPhone,
        `Interview booked: ${candidateName} for ${ctx.jobTitle} on ${when.timeLabel}.`,
      );
      await attempt({
        recipientType: "interviewer",
        channel: "whatsapp",
        templateVariant: "interviewer_invite_booked",
        outcome: iw.success ? "sent" : "failed",
        reasonCode: iw.success ? null : "provider_error",
        reasonDetail: iw.error ?? null,
        provider: "meta_whatsapp",
        providerMessageId: iw.messageId ?? null,
      });
    } else {
      await attempt({
        recipientType: "interviewer",
        channel: "whatsapp",
        templateVariant: "interviewer_invite_booked",
        outcome: "suppressed",
        reasonCode: "no_channel",
        provider: "meta_whatsapp",
      });
    }
    return;
  }

  if (to === "reminded") {
    if (ctx.candidateEmail) {
      const ce = await sendInterviewReminder({
        recipientEmail: ctx.candidateEmail,
        recipientName: candidateName,
        jobTitle: ctx.jobTitle,
        interviewDate: when.date,
        interviewTime: when.time,
        timezone: "IST",
      });
      await attempt({
        recipientType: "candidate",
        channel: "email",
        templateVariant: "interview_reminder",
        outcome: ce.skipped ? "suppressed" : "sent",
        reasonCode: ce.skipped ? ce.reason : null,
        provider: "resend",
        providerMessageId: ce.skipped
          ? null
          : ((ce.data.data as { id?: string } | null)?.id ?? null),
      });
    } else {
      await attempt({
        recipientType: "candidate",
        channel: "email",
        templateVariant: "interview_reminder",
        outcome: "suppressed",
        reasonCode: "no_channel",
        provider: "resend",
      });
    }
    if (ctx.candidatePhone) {
      const cw = await sendInterviewReminderTemplate({
        phone: ctx.candidatePhone,
        candidateName,
        jobTitle: ctx.jobTitle,
        interviewTime: when.timeLabel,
      });
      await attempt({
        recipientType: "candidate",
        channel: "whatsapp",
        templateVariant: "th_interview_reminder",
        outcome: cw.success ? "sent" : "failed",
        reasonCode: cw.success ? null : "provider_error",
        reasonDetail: cw.error ?? null,
        provider: "meta_whatsapp",
        providerMessageId: cw.messageId ?? null,
      });
    } else {
      await attempt({
        recipientType: "candidate",
        channel: "whatsapp",
        templateVariant: "th_interview_reminder",
        outcome: "suppressed",
        reasonCode: "no_channel",
        provider: "meta_whatsapp",
      });
    }
    if (ctx.interviewerEmail) {
      const ie = await sendInterviewReminder({
        recipientEmail: ctx.interviewerEmail,
        recipientName: interviewerName,
        jobTitle: ctx.jobTitle,
        interviewDate: when.date,
        interviewTime: when.time,
        timezone: "IST",
      });
      await attempt({
        recipientType: "interviewer",
        channel: "email",
        templateVariant: "interview_reminder",
        outcome: ie.skipped ? "suppressed" : "sent",
        reasonCode: ie.skipped ? ie.reason : null,
        provider: "resend",
        providerMessageId: ie.skipped
          ? null
          : ((ie.data.data as { id?: string } | null)?.id ?? null),
      });
    } else {
      await attempt({
        recipientType: "interviewer",
        channel: "email",
        templateVariant: "interview_reminder",
        outcome: "suppressed",
        reasonCode: "no_channel",
        provider: "resend",
      });
    }
    if (ctx.interviewerPhone) {
      const iw = await sendWhatsAppMessage(
        ctx.interviewerPhone,
        `Reminder: interview with ${candidateName} for ${ctx.jobTitle} at ${when.timeLabel}.`,
      );
      await attempt({
        recipientType: "interviewer",
        channel: "whatsapp",
        templateVariant: "interview_reminder",
        outcome: iw.success ? "sent" : "failed",
        reasonCode: iw.success ? null : "provider_error",
        reasonDetail: iw.error ?? null,
        provider: "meta_whatsapp",
        providerMessageId: iw.messageId ?? null,
      });
    } else {
      await attempt({
        recipientType: "interviewer",
        channel: "whatsapp",
        templateVariant: "interview_reminder",
        outcome: "suppressed",
        reasonCode: "no_channel",
        provider: "meta_whatsapp",
      });
    }
    return;
  }

  if (to === "rescheduled") {
    if (ctx.candidateEmail) {
      const ce = await sendInterviewRescheduled({
        recipientEmail: ctx.candidateEmail,
        recipientName: candidateName,
        jobTitle: ctx.jobTitle,
        oldDate: "Previously scheduled",
        newDate: when.date,
        newTime: when.time,
        timezone: "IST",
      });
      await attempt({
        recipientType: "candidate",
        channel: "email",
        templateVariant: "interview_rescheduled",
        outcome: ce.skipped ? "suppressed" : "sent",
        reasonCode: ce.skipped ? ce.reason : null,
        provider: "resend",
        providerMessageId: ce.skipped
          ? null
          : ((ce.data.data as { id?: string } | null)?.id ?? null),
      });
    }
    if (ctx.candidatePhone) {
      const cw = await sendInterviewRescheduledTemplate({
        phone: ctx.candidatePhone,
        candidateName,
        jobTitle: ctx.jobTitle,
        newTime: when.timeLabel,
      });
      await attempt({
        recipientType: "candidate",
        channel: "whatsapp",
        templateVariant: "th_interview_rescheduled",
        outcome: cw.success ? "sent" : "failed",
        reasonCode: cw.success ? null : "provider_error",
        reasonDetail: cw.error ?? null,
        provider: "meta_whatsapp",
        providerMessageId: cw.messageId ?? null,
      });
    } else {
      await attempt({
        recipientType: "candidate",
        channel: "whatsapp",
        templateVariant: "th_interview_rescheduled",
        outcome: "suppressed",
        reasonCode: "no_channel",
        provider: "meta_whatsapp",
      });
    }
    if (ctx.interviewerEmail && ctx.slotEndAt) {
      const inviteIcs = buildInterviewInviteIcs({
        slotId: ctx.pipelineCandidateId ?? ctx.jobId,
        title: ctx.jobTitle,
        candidateName,
        startAt: ctx.slotStartAt,
        endAt: ctx.slotEndAt,
      });
      const ie = await sendEmail({
        to: ctx.interviewerEmail,
        subject: `Interview rescheduled: ${candidateName} - ${ctx.jobTitle}`,
        html: `<p>Hi ${interviewerName},</p><p>The interview with ${candidateName} has been rescheduled.</p><p><strong>New time:</strong> ${when.date} ${when.time} (IST)</p>`,
        attachments: [
          {
            filename: "interview-invite.ics",
            content: Buffer.from(inviteIcs, "utf-8").toString("base64"),
          },
        ],
      });
      await attempt({
        recipientType: "interviewer",
        channel: "email",
        templateVariant: "interviewer_invite_rescheduled",
        outcome: ie.error ? "failed" : "sent",
        reasonCode: ie.error ? "provider_error" : null,
        reasonDetail: ie.error ? String(ie.error) : null,
        provider: "resend",
        providerMessageId: (ie.data as { id?: string } | null)?.id ?? null,
      });
      await attempt({
        recipientType: "interviewer",
        channel: "ics",
        templateVariant: "interviewer_invite_rescheduled_ics",
        outcome: "sent",
        provider: "ics",
      });
    } else {
      await attempt({
        recipientType: "interviewer",
        channel: "email",
        templateVariant: "interviewer_invite_rescheduled",
        outcome: "suppressed",
        reasonCode: "no_channel",
        provider: "resend",
      });
      await attempt({
        recipientType: "interviewer",
        channel: "ics",
        templateVariant: "interviewer_invite_rescheduled_ics",
        outcome: "suppressed",
        reasonCode: "no_channel",
        provider: "ics",
      });
    }
    if (ctx.interviewerPhone) {
      const iw = await sendWhatsAppMessage(
        ctx.interviewerPhone,
        `Interview rescheduled: ${candidateName} for ${ctx.jobTitle} is now at ${when.timeLabel}.`,
      );
      await attempt({
        recipientType: "interviewer",
        channel: "whatsapp",
        templateVariant: "interviewer_invite_rescheduled",
        outcome: iw.success ? "sent" : "failed",
        reasonCode: iw.success ? null : "provider_error",
        reasonDetail: iw.error ?? null,
        provider: "meta_whatsapp",
        providerMessageId: iw.messageId ?? null,
      });
    } else {
      await attempt({
        recipientType: "interviewer",
        channel: "whatsapp",
        templateVariant: "interviewer_invite_rescheduled",
        outcome: "suppressed",
        reasonCode: "no_channel",
        provider: "meta_whatsapp",
      });
    }
    return;
  }

  if (to === "cancelled") {
    if (ctx.candidateEmail) {
      const ce = await sendInterviewCancelled({
        recipientEmail: ctx.candidateEmail,
        recipientName: candidateName,
        jobTitle: ctx.jobTitle,
        originalDate: when.date,
      });
      await attempt({
        recipientType: "candidate",
        channel: "email",
        templateVariant: "interview_cancelled",
        outcome: ce.skipped ? "suppressed" : "sent",
        reasonCode: ce.skipped ? ce.reason : null,
        provider: "resend",
        providerMessageId: ce.skipped
          ? null
          : ((ce.data.data as { id?: string } | null)?.id ?? null),
      });
    } else {
      await attempt({
        recipientType: "candidate",
        channel: "email",
        templateVariant: "interview_cancelled",
        outcome: "suppressed",
        reasonCode: "no_channel",
        provider: "resend",
      });
    }
    if (ctx.candidatePhone) {
      const cw = await sendInterviewCancelledTemplate({
        phone: ctx.candidatePhone,
        candidateName,
        jobTitle: ctx.jobTitle,
        originalTime: when.timeLabel,
      });
      await attempt({
        recipientType: "candidate",
        channel: "whatsapp",
        templateVariant: "th_interview_cancelled",
        outcome: cw.success ? "sent" : "failed",
        reasonCode: cw.success ? null : "provider_error",
        reasonDetail: cw.error ?? null,
        provider: "meta_whatsapp",
        providerMessageId: cw.messageId ?? null,
      });
    } else {
      await attempt({
        recipientType: "candidate",
        channel: "whatsapp",
        templateVariant: "th_interview_cancelled",
        outcome: "suppressed",
        reasonCode: "no_channel",
        provider: "meta_whatsapp",
      });
    }
    if (ctx.interviewerEmail && ctx.slotEndAt) {
      const inviteIcs = buildInterviewInviteIcs({
        slotId: ctx.pipelineCandidateId ?? ctx.jobId,
        title: ctx.jobTitle,
        candidateName,
        startAt: ctx.slotStartAt,
        endAt: ctx.slotEndAt,
        method: "CANCEL",
        cancelled: true,
      });
      const ie = await sendEmail({
        to: ctx.interviewerEmail,
        subject: `Interview cancelled: ${candidateName} - ${ctx.jobTitle}`,
        html: `<p>Hi ${interviewerName},</p><p>The interview with ${candidateName} has been cancelled.</p><p><strong>Original time:</strong> ${when.date} ${when.time} (IST)</p>`,
        attachments: [
          {
            filename: "interview-cancelled.ics",
            content: Buffer.from(inviteIcs, "utf-8").toString("base64"),
          },
        ],
      });
      await attempt({
        recipientType: "interviewer",
        channel: "email",
        templateVariant: "interviewer_invite_cancelled",
        outcome: ie.error ? "failed" : "sent",
        reasonCode: ie.error ? "provider_error" : null,
        reasonDetail: ie.error ? String(ie.error) : null,
        provider: "resend",
        providerMessageId: (ie.data as { id?: string } | null)?.id ?? null,
      });
      await attempt({
        recipientType: "interviewer",
        channel: "ics",
        templateVariant: "interviewer_invite_cancelled_ics",
        outcome: "sent",
        provider: "ics",
      });
    } else {
      await attempt({
        recipientType: "interviewer",
        channel: "email",
        templateVariant: "interviewer_invite_cancelled",
        outcome: "suppressed",
        reasonCode: "no_channel",
        provider: "resend",
      });
      await attempt({
        recipientType: "interviewer",
        channel: "ics",
        templateVariant: "interviewer_invite_cancelled_ics",
        outcome: "suppressed",
        reasonCode: "no_channel",
        provider: "ics",
      });
    }
    if (ctx.interviewerPhone) {
      const iw = await sendWhatsAppMessage(
        ctx.interviewerPhone,
        `Interview cancelled: ${candidateName} for ${ctx.jobTitle} (${when.timeLabel}).`,
      );
      await attempt({
        recipientType: "interviewer",
        channel: "whatsapp",
        templateVariant: "interviewer_invite_cancelled",
        outcome: iw.success ? "sent" : "failed",
        reasonCode: iw.success ? null : "provider_error",
        reasonDetail: iw.error ?? null,
        provider: "meta_whatsapp",
        providerMessageId: iw.messageId ?? null,
      });
    } else {
      await attempt({
        recipientType: "interviewer",
        channel: "whatsapp",
        templateVariant: "interviewer_invite_cancelled",
        outcome: "suppressed",
        reasonCode: "no_channel",
        provider: "meta_whatsapp",
      });
    }
  }
}
