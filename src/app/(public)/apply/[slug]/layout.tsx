import type { Metadata } from "next";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { OrganisationRepository } from "@/lib/repositories/OrganisationRepository";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createSupabaseAdmin();
  const org = await OrganisationRepository.getBySlug(supabase, slug);

  if (!org) {
    return { title: "Company not found" };
  }

  const title = `Apply at ${org.name}`;
  const description = `Apply to open roles at ${org.name} on TigerHire — explainable scoring and WhatsApp-friendly applications.`;

  return {
    title,
    description,
    openGraph: {
      title: `Apply at ${org.name} — TigerHire`,
      description,
      url: `https://tigerhire.io/apply/${slug}`,
      siteName: "TigerHire",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `Apply at ${org.name} — TigerHire`,
      description,
    },
  };
}

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
