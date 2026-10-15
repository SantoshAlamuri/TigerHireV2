import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { WorkShell } from "@/components/work/WorkShell";
import "./work.css";

export const metadata: Metadata = { title: "Your work" };

export default function WorkLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={GeistSans.variable}>
      <WorkShell>{children}</WorkShell>
    </div>
  );
}
