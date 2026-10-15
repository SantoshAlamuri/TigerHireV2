"use client";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { TeamManagementContent } from "@/components/dashboard/TeamManagementContent";

export function TeamSettingsPageContent({ showHeader = true }: { showHeader?: boolean }) {
  return (
    <div className="space-y-6">
      {showHeader ? <PageHeader title="Team" subtitle="Manage your organisation members" /> : null}
      <TeamManagementContent />
    </div>
  );
}
