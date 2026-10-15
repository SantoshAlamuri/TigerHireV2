import { CompensationBandsSettingsPageContent } from "@/features/settings/pages/hiring-settings-pages";
export default function SetupCompensationBandsPage() {
  return (
    <CompensationBandsSettingsPageContent
      basePath="/setup/hiring-config"
      jobsHref="/company/jobs"
    />
  );
}
