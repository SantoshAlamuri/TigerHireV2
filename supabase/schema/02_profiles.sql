-- Profiles: extend Supabase auth.users with role and org. One row per auth user.

CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role app_role NOT NULL,
  organisation_id uuid REFERENCES organisations (id) ON DELETE SET NULL,
  full_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_organisation_id ON profiles (organisation_id);
CREATE INDEX idx_profiles_role ON profiles (role);

COMMENT ON TABLE profiles IS 'App user profile: role + org. id matches auth.users(id).';
