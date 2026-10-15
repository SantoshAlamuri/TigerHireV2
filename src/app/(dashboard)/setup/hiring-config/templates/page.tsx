import { Suspense } from "react";
import { HiringTemplatesSettingsPageContent } from "@/features/settings/pages/hiring-settings-pages";

export default function SetupHiringTemplatesPage() {
  return (
    <Suspense fallback={null}>
      <HiringTemplatesSettingsPageContent
        basePath="/setup/hiring-config"
        jobsHref="/company/jobs"
      />
    </Suspense>
  );
}
