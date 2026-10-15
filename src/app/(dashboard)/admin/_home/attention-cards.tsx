import type { ReactNode } from "react";
import { Bot, CreditCard, MessageCircle, Users } from "lucide-react";

export interface AttentionCard {
  key: string;
  title: string;
  value: number | null;
  description: string;
  href: string;
  cta: string;
  icon: ReactNode;
}

export interface AttentionCardInputs {
  onboardingLoaded: boolean;
  onboardingError: string | null | undefined;
  pendingOnboarding: number;
  onboardingNeedsCompletion: number;
  billingLoaded: boolean;
  billingError: string | null | undefined;
  billingRowsAtRisk: number;
  inactiveSubscriptions: number;
  lowCreditRows: number;
  sessionsLoaded: boolean;
  sessionsError: string | null | undefined;
  handoverSessions: number;
  handoversStale: number;
}

/**
 * The admin home "needs attention" cards. Pure — split out of useAdminHome for
 * the file-size gate. A `value` of null renders as "—", never as a false zero:
 * that distinction is the point of these cards.
 */
export function buildAttentionCards(i: AttentionCardInputs): AttentionCard[] {
  return [
    {
      key: "onboarding",
      title: "Onboarding queue",
      value:
        i.onboardingLoaded && !i.onboardingError
          ? i.pendingOnboarding + i.onboardingNeedsCompletion
          : null,
      description: i.onboardingError
        ? "Could not load queue"
        : !i.onboardingLoaded
          ? "Loading queue…"
          : `${i.pendingOnboarding} pending · ${i.onboardingNeedsCompletion} to complete`,
      href: "/admin/onboarding-requests",
      cta: "Open queue",
      icon: <Users size={16} />,
    },
    {
      key: "billing",
      title: "Billing",
      value: i.billingLoaded && !i.billingError ? i.billingRowsAtRisk : null,
      description: i.billingError
        ? "Could not load billing"
        : !i.billingLoaded
          ? "Loading billing…"
          : `${i.inactiveSubscriptions} inactive · ${i.lowCreditRows} low credit`,
      href: "/admin/billing",
      cta: "Review billing",
      icon: <CreditCard size={16} />,
    },
    {
      key: "support",
      title: "Latest support handovers",
      value: i.sessionsLoaded && !i.sessionsError ? i.handoverSessions : null,
      description: i.sessionsError
        ? "Could not load support"
        : !i.sessionsLoaded
          ? "Loading support…"
          : `${i.handoverSessions} shown (up to 20) · ${i.handoversStale} older than 2 hours`,
      href: "/admin/whatsapp-sessions",
      cta: "Handle sessions",
      icon: <MessageCircle size={16} />,
    },
    {
      key: "reliability",
      title: "System health",
      value: null,
      description: "View service status and recent runs",
      href: "/admin/agents",
      cta: "Inspect runs",
      icon: <Bot size={16} />,
    },
  ];
}
