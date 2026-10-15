import { RequisitionDelegationsSettingsPageContent } from "@/features/settings/pages/hiring-settings-pages";
export default function SetupRequisitionDelegationsPage() {
  return (
    <RequisitionDelegationsSettingsPageContent
      basePath="/setup/hiring-config"
      jobsHref="/company/jobs"
    />
  );
}
