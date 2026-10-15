import { InstallPrompt } from "@/components/dashboard/InstallPrompt";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DashboardShell>{children}</DashboardShell>
      <InstallPrompt />
    </>
  );
}
