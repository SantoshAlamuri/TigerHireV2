import type { Metadata } from "next";
import { WorkShell } from "@/components/work/WorkShell";
import "./work.css";

export const metadata: Metadata = { title: "Your work" };

export default function WorkLayout({ children }: { children: React.ReactNode }) {
  return <WorkShell>{children}</WorkShell>;
}
