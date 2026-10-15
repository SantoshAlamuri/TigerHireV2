export type IdibuWebhookEvent = "candidate.create" | "candidate.update";

export interface IdibuVacancyRef {
  id?: string | number;
  reference?: string;
  title?: string;
  status?: string;
}

export interface IdibuAttachment {
  file_link?: string;
  type?: string;
}

export interface IdibuCustomField {
  name?: string;
  label?: string;
  value?: string;
}

export interface IdibuCandidatePayload {
  id?: string | number;
  firstname?: string;
  lastname?: string;
  email?: string;
  source?: string;
  vacancies?: IdibuVacancyRef[];
  attachments?: IdibuAttachment[];
  custom_fields?: IdibuCustomField[];
}

export interface IdibuWebhookBody {
  payload?: IdibuCandidatePayload;
  "payload-information"?: {
    webhook_event?: IdibuWebhookEvent | string;
  };
}

export type IdibuProcessOutcome = "success" | "duplicate" | "dead_letter" | "cv_failed" | "skipped";
