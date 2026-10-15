import { getPilotJobId } from "./pilot-job";

/** Mutable state shared across serial pilot lifecycle specs in one run. */
export const lifecycleState = {
  jobId: getPilotJobId(),
  hiringRequestId: undefined as string | undefined,
  requisitionTitle: undefined as string | undefined,
  pipelineCandidateId: undefined as string | undefined,
  applicationId: undefined as string | undefined,
};

export function setLifecycleJobId(id: string) {
  lifecycleState.jobId = id;
}
