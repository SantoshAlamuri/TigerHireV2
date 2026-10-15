-- In-app messaging: conversations and messages between recruiters and candidates.
-- Real-time delivery powered by Supabase Realtime (postgres_changes).

BEGIN;

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs (id) ON DELETE SET NULL,
  organisation_id uuid REFERENCES organisations (id) ON DELETE CASCADE,
  subject text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_participants_unique UNIQUE (conversation_id, user_id)
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body text NOT NULL,
  attachment_url text,
  attachment_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);

CREATE INDEX idx_conversations_org ON conversations (organisation_id);
CREATE INDEX idx_conversations_job ON conversations (job_id);
CREATE INDEX idx_conversations_updated ON conversations (updated_at DESC);
CREATE INDEX idx_conversation_participants_user ON conversation_participants (user_id);
CREATE INDEX idx_conversation_participants_conv ON conversation_participants (conversation_id);
CREATE INDEX idx_messages_conversation ON messages (conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages (sender_id);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can read own conversations"
  ON conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = conversations.id
      AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      organisation_id IS NULL
      OR public.auth_can_see_organisation(organisation_id)
      OR public.auth_role() = 'super_admin'
    )
    AND (
      job_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM jobs j
        WHERE j.id = conversations.job_id
          AND (
            public.auth_can_see_organisation(j.organisation_id)
            OR public.auth_role() = 'super_admin'
          )
      )
    )
    AND (
      job_id IS NULL
      OR organisation_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM jobs j
        WHERE j.id = conversations.job_id
          AND j.organisation_id = conversations.organisation_id
      )
    )
  );

CREATE POLICY "Participants can update conversations"
  ON conversations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = conversations.id
      AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Participants can read own participations"
  ON conversation_participants FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM conversation_participants cp2
    WHERE cp2.conversation_id = conversation_participants.conversation_id
    AND cp2.user_id = auth.uid()
  ));

CREATE POLICY "Authenticated users can join conversations"
  ON conversation_participants FOR INSERT
  WITH CHECK (
    (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM conversations c
        WHERE c.id = conversation_participants.conversation_id
          AND (
            c.organisation_id IS NULL
            OR public.auth_can_see_organisation(c.organisation_id)
            OR public.auth_role() = 'super_admin'
          )
      )
    )
    OR (
      EXISTS (
        SELECT 1
        FROM conversation_participants cp
        WHERE cp.conversation_id = conversation_participants.conversation_id
          AND cp.user_id = auth.uid()
      )
      AND EXISTS (
        SELECT 1
        FROM conversations c
        WHERE c.id = conversation_participants.conversation_id
          AND (
            c.organisation_id IS NULL
            OR public.auth_can_see_organisation(c.organisation_id)
            OR public.auth_role() = 'super_admin'
          )
      )
    )
  );

CREATE POLICY "Users can update own participation"
  ON conversation_participants FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Participants can read messages in their conversations"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Participants can send messages"
  ON messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
    )
  );

COMMENT ON TABLE conversations IS 'Message threads between recruiters and candidates, optionally linked to a job';
COMMENT ON TABLE messages IS 'Individual messages within a conversation; real-time via Supabase Realtime';

-- Enable Supabase Realtime for messages table
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

COMMIT;
