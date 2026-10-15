-- In-app notification system.

BEGIN;

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON notifications (user_id, read, created_at DESC);
CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at DESC);

COMMENT ON TABLE notifications IS 'In-app notifications. type: shortlist_ready | approval_needed | approval_given | interview_scheduled | application_update | hiring_request_new | general';

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service-role inserts bypass RLS; no INSERT policy needed for end users.

COMMIT;
