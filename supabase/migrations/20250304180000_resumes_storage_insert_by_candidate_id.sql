-- Allow candidates to upload to resumes bucket when path = {candidate_id}/...
-- (upload-resume API uses candidateId, not auth.uid(); existing policy only allowed auth.uid() as first segment)
CREATE POLICY "Candidates can upload own resume by candidate id path"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'resumes'
    AND EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.user_id = auth.uid() AND (storage.foldername(name))[1] = c.id::text
    )
  );
