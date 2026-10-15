-- Waitlist: pre-launch signups (email + type). Used for counter and outreach.

CREATE TABLE waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  type text NOT NULL CHECK (type IN ('company', 'candidate')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_waitlist_created_at ON waitlist (created_at DESC);
CREATE INDEX idx_waitlist_type ON waitlist (type);

-- Contact form submissions (optional; can also send via Resend only)

CREATE TABLE contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text NOT NULL,
  company text,
  message text NOT NULL,
  type text NOT NULL CHECK (type IN ('company', 'candidate', 'press', 'partner', 'other')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contact_submissions_created_at ON contact_submissions (created_at DESC);
