import { SetupShell } from "@/features/setup/components/SetupShell";

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <SetupShell>{children}</SetupShell>;
}
