import type { Metadata } from "next";
import { getPublicJobPageMetadata } from "@/lib/jobs/public-job-metadata";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return getPublicJobPageMetadata(id, `/jobs/${id}`);
}

export default function JobLayout({ children }: { children: React.ReactNode }) {
  return children;
}
