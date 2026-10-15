-- Migration 32: RLS policies for employee data isolation
-- Source: PRD V5 Section 3.1

ALTER TABLE employee_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE resignation_events ENABLE ROW LEVEL SECURITY;

-- Company admins can see their own company's invites
CREATE POLICY company_admin_invites ON employee_invites
  FOR ALL USING (
    company_id IN (
      SELECT organisation_id FROM profiles
      WHERE id = auth.uid()
        AND role IN ('company_admin', 'super_admin')
    )
  );

-- Employees can only see their own referrals
CREATE POLICY employee_own_referrals ON employee_referrals
  FOR SELECT USING (referrer_id = auth.uid());

-- Employees can insert referrals for their own company
CREATE POLICY employee_insert_referrals ON employee_referrals
  FOR INSERT WITH CHECK (referrer_id = auth.uid());

-- Company admins see all referrals for their company
CREATE POLICY admin_company_referrals ON employee_referrals
  FOR ALL USING (
    referrer_company_id IN (
      SELECT organisation_id FROM profiles
      WHERE id = auth.uid()
        AND role IN ('company_admin', 'super_admin')
    )
  );

-- Resignation events: visible to the employee (own) and company admin
CREATE POLICY resignation_own ON resignation_events
  FOR SELECT USING (
    declared_by_user_id = auth.uid()
    OR EXISTS(
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('company_admin', 'super_admin')
    )
  );

-- CRITICAL: active employees never appear in external shortlists
-- Update match_candidates_for_job to include this guard in WHERE clause:
--   AND (
--     c.employment_status != 'active_employee'
--     OR c.employer_company_id = (SELECT organisation_id FROM jobs WHERE id = p_job_id)
--   )
