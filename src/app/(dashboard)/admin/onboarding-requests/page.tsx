"use client";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { useOnboardingWorkflow } from "./_hooks/useOnboardingWorkflow";
import { RequestDetailPanel } from "./_components/RequestDetailPanel";
import { RequestQueuePanel } from "./_components/RequestQueuePanel";

export default function AdminOnboardingRequestsPage() {
  const wf = useOnboardingWorkflow();
  const { access, pendingCount } = wf;

  if (!access?.is_platform_admin) {
    return (
      <>
        <PageHeader title="Onboarding Requests" subtitle="Platform admin only" />
        <div className="card-lifted rounded-xl p-4 text-sm text-white/60">
          You do not have platform admin access.
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Onboarding Requests"
        subtitle={`Unified queue workflow: request → approve → billing/credits/overrides → complete (${pendingCount} pending)`}
      />
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1.9fr]">
        <RequestQueuePanel wf={wf} />
        <RequestDetailPanel wf={wf} />
      </div>
    </>
  );
}
