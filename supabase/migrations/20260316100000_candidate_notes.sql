-- Candidate notes / recruiter comments on pipeline candidates
CREATE TABLE IF NOT EXISTS candidate_notes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidate_notes_candidate ON candidate_notes(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_notes_job ON candidate_notes(job_id);
CREATE INDEX IF NOT EXISTS idx_candidate_notes_author ON candidate_notes(author_id);

-- RLS
ALTER TABLE candidate_notes ENABLE ROW LEVEL SECURITY;

-- Recruiters can read notes for candidates in their org
DROP POLICY IF EXISTS "Org members can read candidate notes" ON candidate_notes;
CREATE POLICY "Org members can read candidate notes"
  ON candidate_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'company_admin', 'recruiter', 'agency', 'hiring_manager')
    )
  );

-- Users can insert their own notes
DROP POLICY IF EXISTS "Authenticated users can create notes" ON candidate_notes;
CREATE POLICY "Authenticated users can create notes"
  ON candidate_notes FOR INSERT
  WITH CHECK (author_id = auth.uid());

-- Users can update their own notes
DROP POLICY IF EXISTS "Authors can update own notes" ON candidate_notes;
CREATE POLICY "Authors can update own notes"
  ON candidate_notes FOR UPDATE
  USING (author_id = auth.uid());

-- Users can delete their own notes
DROP POLICY IF EXISTS "Authors can delete own notes" ON candidate_notes;
CREATE POLICY "Authors can delete own notes"
  ON candidate_notes FOR DELETE
  USING (author_id = auth.uid());
