import { PipelineSettingsPageContent } from "@/features/settings/pages/hiring-settings-pages";
export default function SetupHiringPipelinePage() {
  return <PipelineSettingsPageContent basePath="/setup/hiring-config" jobsHref="/company/jobs" />;
}
