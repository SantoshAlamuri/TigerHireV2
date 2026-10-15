"use client";

import { useParams } from "next/navigation";
import { RecruitAssessmentsWorkspace } from "@/app/(dashboard)/recruit/assessments/page";

export default function JobAssessmentsPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <RecruitAssessmentsWorkspace jobId={id} />;
}
