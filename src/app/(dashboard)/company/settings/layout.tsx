"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SetupCompanySettingsBanner } from "@/features/setup/components/SetupCompanySettingsBanner";

const COMPANY_SETTINGS_TABS = [
  {
    href: "/company/settings",
    label: "Company profile",
    isActive: (pathname: string) => pathname === "/company/settings",
  },
  {
    href: "/company/settings/integrations",
    label: "Integrations",
    isActive: (pathname: string) =>
      pathname === "/company/settings/integrations" ||
      pathname.startsWith("/company/settings/integrations/"),
  },
  {
    href: "/company/settings/job-boards",
    label: "Job boards",
    isActive: (pathname: string) =>
      pathname === "/company/settings/job-boards" ||
      pathname.startsWith("/company/settings/job-boards/"),
  },
  {
    href: "/company/settings/permissions",
    label: "Permissions",
    isActive: (pathname: string) =>
      pathname === "/company/settings/permissions" ||
      pathname.startsWith("/company/settings/permissions/"),
  },
  {
    href: "/company/settings/privacy",
    label: "Privacy",
    isActive: (pathname: string) =>
      pathname === "/company/settings/privacy" || pathname.startsWith("/company/settings/privacy/"),
  },
] as const;

function showCompanySettingsTabs(pathname: string): boolean {
  return COMPANY_SETTINGS_TABS.some((tab) => tab.isActive(pathname));
}

export default function CompanySettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showTabs = showCompanySettingsTabs(pathname);

  if (!showTabs) {
    return (
      <>
        <SetupCompanySettingsBanner />
        {children}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Company settings"
        subtitle="Organisation profile, integrations, job boards, access controls, and privacy."
      />
      <div className="mx-auto w-full max-w-4xl lg:max-w-6xl">
        <nav
          className="-mx-1 flex gap-1 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible"
          aria-label="Company settings sections"
        >
          {COMPANY_SETTINGS_TABS.map((tab) => {
            const active = tab.isActive(pathname);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                scroll={false}
                className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
                  active
                    ? "bg-white/[0.08] text-[var(--text)] ring-1 ring-[var(--accent)]/40"
                    : "text-white/60 hover:bg-white/[0.04] hover:text-white/90"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-6 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] backdrop-blur-sm lg:p-8">
          <SetupCompanySettingsBanner />
          {children}
        </div>
      </div>
    </>
  );
}
