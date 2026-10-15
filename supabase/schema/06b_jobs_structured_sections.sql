-- Add structured JD sections and missing metadata columns to jobs table.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS role_function text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS seniority_level text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS skills_required text[] DEFAULT '{}';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS skills_preferred text[] DEFAULT '{}';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS remote_allowed boolean DEFAULT false;

-- Structured JD sections stored as JSONB for flexible sub-section rendering.
-- Keys: designation, reportingTo, aboutCompany, rolesAndResponsibilities,
--        technicalSkills, leadershipSkills, softSkills, preferredSkills,
--        niceToHave, benefits, educationRequirements, employmentType,
--        experienceRange, noticePeriod
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS jd_sections jsonb DEFAULT '{}';
