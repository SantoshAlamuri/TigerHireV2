import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join as a referrer — TigerHire",
  description: "Get your personal referral links for open roles. No login required.",
};

export default function ReferJoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
