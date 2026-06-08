
CREATE POLICY "Owners manage customer photos"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'customer-photos' AND has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (bucket_id = 'customer-photos' AND has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Branch view customer photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'customer-photos' AND (storage.foldername(name))[1] = current_branch_id()::text);

CREATE POLICY "Branch upload customer photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'customer-photos' AND (storage.foldername(name))[1] = current_branch_id()::text);

CREATE POLICY "Branch update customer photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'customer-photos' AND (storage.foldername(name))[1] = current_branch_id()::text)
  WITH CHECK (bucket_id = 'customer-photos' AND (storage.foldername(name))[1] = current_branch_id()::text);

CREATE POLICY "Branch delete customer photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'customer-photos' AND (storage.foldername(name))[1] = current_branch_id()::text);
