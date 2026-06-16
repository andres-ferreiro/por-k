-- Ensure driver photo buckets exist (policies were added in an earlier migration).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('delivery-photos', 'delivery-photos', false, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  ('expense-photos', 'expense-photos', false, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO NOTHING;

-- Branch staff can view expense photos for drivers in their branch.
CREATE POLICY "Branch staff view expense photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'expense-photos'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (storage.foldername(name))[1]::uuid
        AND p.branch_id = public.current_branch_id()
    )
  );

-- Branch staff can view delivery photos for drivers in their branch.
CREATE POLICY "Branch staff view delivery photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'delivery-photos'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (storage.foldername(name))[1]::uuid
        AND p.branch_id = public.current_branch_id()
    )
  );

-- Owners can view all driver photos.
CREATE POLICY "Owners view expense photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'expense-photos'
    AND public.has_role(auth.uid(), 'owner'::public.app_role)
  );

CREATE POLICY "Owners view delivery photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'delivery-photos'
    AND public.has_role(auth.uid(), 'owner'::public.app_role)
  );
