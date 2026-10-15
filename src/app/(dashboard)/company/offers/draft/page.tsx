"use client";

import { Suspense } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { RecruitOfferDraftWorkspace } from "@/components/dashboard/RecruitOfferDraftWorkspace";

function DraftBody() {
  return <RecruitOfferDraftWorkspace offersListHref="/company/offers" />;
}

export default function CompanyOfferDraftPage() {
  return (
    <div className="alive-air space-y-6">
      <PageHeader
        title="Draft offer"
        subtitle="Use this workspace only from Pipeline-stage candidate flow."
      />
      <Suspense fallback={<p className="text-sm text-white/60">Loading…</p>}>
        <DraftBody />
      </Suspense>
    </div>
  );
}
