"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, LogOut } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { useOptimisticMutation } from "@/lib/hooks/use-api";

interface ResignResponse {
  resignation: Record<string, unknown>;
  message: string;
}

export default function ResignPage() {
  const { toast } = useToast();
  const [confirmed, setConfirmed] = useState(false);
  const { mutate, loading, error } = useOptimisticMutation<ResignResponse, Record<string, never>>(
    "/api/employees/resign",
    {
      method: "POST",
      onSuccess: (response) => {
        toast({
          title: "Resignation submitted",
          description: response.message,
          tone: "warning",
        });
      },
      onError: (err) => {
        toast({
          title: "Submission failed",
          description: err.message,
          tone: "error",
        });
      },
    },
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmed) return;

    setSuccessMessage(null);
    const result = await mutate({});
    if (result?.message) {
      setSuccessMessage(result.message);
      setConfirmed(false);
    }
  }

  return (
    <>
      <PageHeader title="Resign" subtitle="Declare your resignation" />
      <div className="mx-auto max-w-lg">
        {successMessage && (
          <div className="mb-6 flex items-start gap-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-4">
            <CheckCircle2 size={20} className=" shrink-0 text-emerald-500" />
            <p className="text-sm text-emerald-600 dark:text-emerald-400">{successMessage}</p>
          </div>
        )}

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-md border border-red-500/20 bg-red-500/5 p-4">
            <AlertTriangle size={20} className="shrink-0 text-red-500" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="card-lifted p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
              <LogOut size={20} className="text-amber-500" />
            </div>
            <h2 className="heading-section text-lg text-[var(--text)]">Declare Resignation</h2>
          </div>

          <p className="mb-4 text-body text-sm text-white/60">
            By declaring your resignation, your profile will be unlocked for recruiters after 48
            hours, making you visible for new opportunities.
          </p>

          <p className="mb-5 text-body text-sm text-white/60">
            This action will mark your employment status as resigned and trigger a 48-hour hold
            period. After that period, your profile becomes discoverable by recruiters for new job
            opportunities.
          </p>

          <form onSubmit={handleSubmit}>
            <label className="mb-5 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
              />
              <span className="text-body text-sm text-white/60">
                I understand this action cannot be undone
              </span>
            </label>

            <button
              type="submit"
              disabled={!confirmed || loading}
              className="w-full rounded-md bg-[var(--accent)] py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Submitting...
                </span>
              ) : (
                "Submit Resignation"
              )}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
