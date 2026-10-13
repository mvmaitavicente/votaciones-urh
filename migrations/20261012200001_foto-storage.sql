-- Storage is new in this test project. Restrict this bucket to server writes.
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY urh_candidate_server_write ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (bucket <> 'urh-candidatos')
  WITH CHECK (bucket <> 'urh-candidatos');
