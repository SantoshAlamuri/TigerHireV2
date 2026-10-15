-- Interview feedback forms: templates and responses

CREATE TABLE feedback_form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default Feedback Form',
  fields jsonb NOT NULL DEFAULT '[]',
  created_by uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE feedback_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES feedback_form_templates (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  pipeline_candidate_id uuid NOT NULL REFERENCES pipeline_candidates (id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL REFERENCES auth.users (id),
  responses jsonb NOT NULL DEFAULT '{}',
  overall_rating smallint CHECK (overall_rating >= 1 AND overall_rating <= 5),
  recommendation text CHECK (recommendation IN ('strong_hire', 'hire', 'no_hire', 'strong_no_hire')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_templates_job ON feedback_form_templates (job_id);
CREATE INDEX idx_feedback_responses_job ON feedback_responses (job_id);
CREATE INDEX idx_feedback_responses_candidate ON feedback_responses (pipeline_candidate_id);
CREATE INDEX idx_feedback_responses_template ON feedback_responses (template_id);

COMMENT ON TABLE feedback_form_templates IS 'Customizable interview feedback form structure per job';
COMMENT ON COLUMN feedback_form_templates.fields IS 'JSON array of {label, type, required, options?} field definitions';
COMMENT ON TABLE feedback_responses IS 'Individual interviewer feedback submissions';
