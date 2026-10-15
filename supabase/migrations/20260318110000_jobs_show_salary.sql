-- Add show_salary to jobs for job feeds and distribution (XML feed, JSON-LD, Adzuna).
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS show_salary boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN jobs.show_salary IS 'When true, salary_min/salary_max are included in public feeds and job boards.';
