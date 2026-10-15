import { redirect } from "next/navigation";
import { getDefaultSetupPathForArea } from "@/features/setup/config/manifest";

export default function SetupPlatformIndexPage() {
  redirect(getDefaultSetupPathForArea("platform"));
}
