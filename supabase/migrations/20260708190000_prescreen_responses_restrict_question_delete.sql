-- Candidate answers must never be silently destroyed by deleting a question.
-- The 2026-07-08 incident: JD re-approval regenerated prescreen_questions
-- (delete-then-insert) and this CASCADE wiped all 155 recorded answers on a
-- live job. RESTRICT turns that class of bug into a loud failure; code paths
-- that legitimately remove an answered question must delete (or migrate) the
-- responses explicitly first.
ALTER TABLE public.prescreen_responses
  DROP CONSTRAINT IF EXISTS prescreen_responses_question_id_fkey;

ALTER TABLE public.prescreen_responses
  ADD CONSTRAINT prescreen_responses_question_id_fkey
  FOREIGN KEY (question_id) REFERENCES public.prescreen_questions(id) ON DELETE RESTRICT;
