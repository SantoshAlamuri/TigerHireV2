-- Allow agency users to read candidate_unlocks for their linked client organisations,
-- and allow company users to read unlocks made by their linked agency partners.
-- This enables cross-org unlock visibility so both sides see each other's unlocks.

CREATE POLICY "Agency can read linked client unlocks"
  ON candidate_unlocks FOR SELECT
  USING (
    organisation_id IN (
      SELECT client_organisation_id FROM agency_clients
      WHERE agency_organisation_id = public.auth_organisation_id()
    )
  );

CREATE POLICY "Company can read linked agency unlocks"
  ON candidate_unlocks FOR SELECT
  USING (
    organisation_id IN (
      SELECT agency_organisation_id FROM agency_clients
      WHERE client_organisation_id = public.auth_organisation_id()
    )
  );
