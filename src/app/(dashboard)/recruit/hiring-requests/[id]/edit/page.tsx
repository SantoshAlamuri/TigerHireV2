"use client";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery } from "@/lib/hooks/use-api";
import { HiringRequestForm } from "@/app/(dashboard)/company/hiring-requests/HiringRequestForm";
export default function EditHiringRequest() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data, loading, error } = useApiQuery<{ request: Record<string, unknown> }>(
    `/api/hiring-requests/${id}`,
  );
  if (loading) return <p role="status">Loading draft…</p>;
  const request = data?.request;
  if (
    error ||
    !request ||
    !user ||
    request.status !== "draft" ||
    request.created_by !== user.id ||
    request.organisation_id !== user.organisationId
  )
    return <p role="alert">Only your own draft request can be edited here.</p>;
  return <HiringRequestForm key={id} requestId={id} initial={request} />;
}
