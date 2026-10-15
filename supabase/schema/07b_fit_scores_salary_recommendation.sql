-- PRD: salary_recommendation for recruiter value (suggested_offer, candidate_expectation, acceptance_probability).

ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS salary_recommendation jsonb;

COMMENT ON COLUMN fit_scores.salary_recommendation IS 'Optional: { suggested_offer_lpa, candidate_expectation_lpa, job_budget_min_lpa, job_budget_max_lpa, acceptance_probability }';