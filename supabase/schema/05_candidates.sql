-- Candidates: enriched profiles (from Talent Scout). May be claimed by a user (profiles.id).

CREATE TABLE candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  name text,
  email text,
  phone text,
  resume_url text,
  skills text[],
  experience_years numeric(4,1),
  location text,
  intent_score smallint CHECK (intent_score >= 0 AND intent_score <= 100),
  profile_embedding vector(1536),
  visibility boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_candidates_user_id ON candidates (user_id);
CREATE INDEX idx_candidates_phone_digits
  ON candidates ((regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')))
  WHERE phone IS NOT NULL;
CREATE INDEX idx_candidates_visibility ON candidates (visibility) WHERE visibility = true;
CREATE INDEX idx_candidates_skills ON candidates USING GIN (skills);
CREATE INDEX idx_candidates_location ON candidates (location) WHERE location IS NOT NULL;
CREATE INDEX idx_candidates_intent_score ON candidates (intent_score DESC) WHERE intent_score IS NOT NULL;
CREATE INDEX idx_candidates_profile_embedding ON candidates USING ivfflat (profile_embedding vector_cosine_ops) WITH (lists = 100);

COMMENT ON TABLE candidates IS 'Enriched candidate profiles. user_id set when profile is claimed. profile_embedding for similarity (e.g. OpenAI 1536).';

-- Link signals.candidate_id to candidates (run after 04_signals and 05_candidates)
ALTER TABLE signals
  ADD CONSTRAINT signals_candidate_id_fkey
  FOREIGN KEY (candidate_id) REFERENCES candidates (id) ON DELETE SET NULL;
