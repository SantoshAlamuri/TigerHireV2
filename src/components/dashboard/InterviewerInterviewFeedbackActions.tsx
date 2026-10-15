"use client";

import { FeedbackSubmitButton } from "@/app/(dashboard)/recruit/jobs/[id]/components/FeedbackSubmitButton";
import { useApiQuery } from "@/lib/hooks/use-api";

type FeedbackTemplate = { id: string; name: string; fields?: unknown[] };

export function InterviewerInterviewFeedbackActions({
  jobId,
  pipelineCandidateId,
  candidateName,
  feedbackSubmitted,
  onSubmitted,
}: {
  jobId: string;
  pipelineCandidateId: string;
  candidateName: string;
  feedbackSubmitted: boolean;
  onSubmitted: () => void;
}) {
  const { data } = useApiQuery<{ templates: FeedbackTemplate[] }>(
    feedbackSubmitted ? null : `/api/jobs/${encodeURIComponent(jobId)}/feedback-templates`,
  );

  if (feedbackSubmitted) return null;

  return (
    <FeedbackSubmitButton
      jobId={jobId}
      pipelineCandidateId={pipelineCandidateId}
      candidateName={candidateName}
      templates={data?.templates ?? []}
      onSubmitted={onSubmitted}
    />
  );
}
