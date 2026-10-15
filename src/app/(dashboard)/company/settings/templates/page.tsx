import { Suspense } from "react";
import { HiringTemplatesSettingsPageContent } from "@/features/settings/pages/hiring-settings-pages";

export default function CompanyHiringTemplatesPage() {
  return (
    <Suspense fallback={null}>
      <HiringTemplatesSettingsPageContent basePath="/company/settings" jobsHref="/company/jobs" />
    </Suspense>
  );
}
