-- Seed default feedback form templates for every job that has none.
-- These provide a ready-to-use feedback form out of the box.

BEGIN;

INSERT INTO feedback_form_templates (job_id, name, fields, created_by)
SELECT j.id,
       'Default Interview Feedback',
       '[
         {"label": "Technical Skills", "type": "rating", "required": true, "description": "Rate the candidate''s technical ability (1-5)"},
         {"label": "Communication", "type": "rating", "required": true, "description": "Rate clarity and communication skills (1-5)"},
         {"label": "Problem Solving", "type": "rating", "required": true, "description": "Rate approach to problem solving (1-5)"},
         {"label": "Culture Fit", "type": "rating", "required": true, "description": "Rate alignment with team culture (1-5)"},
         {"label": "Strengths", "type": "text", "required": false, "description": "Key strengths observed"},
         {"label": "Areas for Improvement", "type": "text", "required": false, "description": "Areas where the candidate could improve"},
         {"label": "Additional Notes", "type": "text", "required": false, "description": "Any other observations"}
       ]'::jsonb,
       NULL
FROM jobs j
WHERE NOT EXISTS (
  SELECT 1 FROM feedback_form_templates ft WHERE ft.job_id = j.id
);

COMMIT;
