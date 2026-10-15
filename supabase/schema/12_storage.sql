-- Storage bucket for candidate resumes
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resumes',
  'resumes',
  false,
  10485760,  -- 10 MB
  ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword','text/plain']
) ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload their own resume
CREATE POLICY "Users can upload own resume"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Users can read their own resume
CREATE POLICY "Users can read own resume"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Company admins and recruiters can read any resume (for candidate review)
CREATE POLICY "Company users can read resumes"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'resumes'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('company_admin', 'recruiter', 'super_admin', 'agency')
    )
  );

-- Users can update/replace their own resume
CREATE POLICY "Users can update own resume"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Users can delete their own resume
CREATE POLICY "Users can delete own resume"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);

-- VerifyKit: bucket for 60-second video intros (90-day retention per spec)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification-videos',
  'verification-videos',
  false,
  52428800,
  ARRAY['video/mp4','video/webm','video/quicktime']
) ON CONFLICT (id) DO NOTHING;

-- Service role can insert/update/delete (backend uploads after WhatsApp flow)
-- Authenticated users (candidates) upload to path: {candidate_id}/{upload_id}.mp4
CREATE POLICY "Service role full access verification-videos"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'verification-videos')
  WITH CHECK (bucket_id = 'verification-videos');

-- Company admins and recruiters can read verification videos (shortlist view)
CREATE POLICY "Company users can read verification videos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'verification-videos'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('company_admin', 'recruiter', 'super_admin', 'agency')
    )
  );
