
CREATE POLICY "Drivers upload delivery photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'delivery-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Drivers read own delivery photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'delivery-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Drivers delete own delivery photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'delivery-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Drivers upload expense photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expense-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Drivers read own expense photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'expense-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Drivers delete own expense photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'expense-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
