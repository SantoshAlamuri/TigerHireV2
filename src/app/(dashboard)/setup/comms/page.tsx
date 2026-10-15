import { redirect } from "next/navigation";
import { getDefaultSetupPathForArea } from "@/features/setup/config/manifest";

export default function SetupCommsIndexPage() {
  redirect(getDefaultSetupPathForArea("comms"));
}
