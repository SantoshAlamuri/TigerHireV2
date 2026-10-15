-- Richer prescreen answer types: single-select (with per-option knockout) alongside yes/no.
-- Backward compatible: existing rows default to answer_type 'yes_no' and keep fail_on_yes/answer_yes.
ALTER TABLE public.job_screening_questions
  ADD COLUMN IF NOT EXISTS answer_type text NOT NULL DEFAULT 'yes_no',
  ADD COLUMN IF NOT EXISTS options jsonb;

ALTER TABLE public.application_screening_answers
  ADD COLUMN IF NOT EXISTS answer_text text;

COMMENT ON COLUMN public.job_screening_questions.answer_type IS
  'yes_no | single_select. single_select uses options[]; yes_no uses fail_on_yes.';
COMMENT ON COLUMN public.job_screening_questions.options IS
  'For single_select: array of { "label": text, "knockout": bool }. Selecting a knockout option fails the gate.';
COMMENT ON COLUMN public.application_screening_answers.answer_text IS
  'Selected option label for a single_select question (yes_no questions use answer_yes).';
