"use client";

import { JDWizard } from "@/components/dashboard/JDWizard";

export interface PostJobFormProps {
  initialClientId?: string;
  onBack?: () => void;
  onSuccess?: (jobId: string) => void;
}

export function PostJobForm({ initialClientId = "", onBack, onSuccess }: PostJobFormProps) {
  return (
    <div className="space-y-6">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-[var(--accent)] hover:underline"
        >
          &larr; Back to jobs
        </button>
      )}
      <JDWizard role="agency" initialClientId={initialClientId} onSuccess={onSuccess} />
    </div>
  );
}
