"use client";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { TeamManagementContent } from "@/components/dashboard/TeamManagementContent";

export default function AgencyTeamPage() {
  return (
    <>
      <PageHeader title="Team" subtitle="Manage your agency members" />
      <section className="card-lifted overflow-hidden">
        <TeamManagementContent />
      </section>
    </>
  );
}
