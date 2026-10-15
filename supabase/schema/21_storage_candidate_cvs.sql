-- Storage bucket for CVs uploaded via WhatsApp (Scout Agent).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'candidate-cvs',
  'candidate-cvs',
  false,
  10485760,
  ARRAY['application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Service role only (Scout Agent uploads after WhatsApp download)
CREATE POLICY "Service role full access candidate-cvs"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'candidate-cvs')
  WITH CHECK (bucket_id = 'candidate-cvs');

-- Company/recruiter can read (shortlist view)
CREATE POLICY "Company users can read candidate-cvs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'candidate-cvs'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('company_admin', 'recruiter', 'super_admin', 'agency')
    )
  );
