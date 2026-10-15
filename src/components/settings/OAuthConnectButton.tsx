"use client";

import { usePathname } from "next/navigation";
import type { Provider } from "@/lib/validations/integrations";

export function OAuthConnectButton({
  provider,
  oauthPathBase = "/api/settings/integrations/oauth",
}: {
  provider: Provider;
  oauthPathBase?: string;
}) {
  const pathname = usePathname();
  const query = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
  return (
    <a
      href={`${oauthPathBase}/${provider}${query}`}
      className="inline-flex items-center rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-black"
    >
      Connect with OAuth
    </a>
  );
}
