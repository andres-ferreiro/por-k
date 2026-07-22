-- Allow superadmin (owner) and branch staff to upload/replace delivery note photos
-- from the preorders (hotel/restaurant) admin UI, not only from the driver app.

CREATE POLICY "Owners manage delivery photos"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'delivery-photos'
    AND public.has_role(auth.uid(), 'owner'::public.app_role)
  )
  WITH CHECK (
    bucket_id = 'delivery-photos'
    AND public.has_role(auth.uid(), 'owner'::public.app_role)
  );

CREATE POLICY "Branch staff update own delivery photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'delivery-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (
      public.has_role(auth.uid(), 'supervisor'::public.app_role)
      OR public.has_role(auth.uid(), 'cashier'::public.app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'delivery-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (
      public.has_role(auth.uid(), 'supervisor'::public.app_role)
      OR public.has_role(auth.uid(), 'cashier'::public.app_role)
    )
  );

CREATE POLICY "Branch staff delete own delivery photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'delivery-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (
      public.has_role(auth.uid(), 'supervisor'::public.app_role)
      OR public.has_role(auth.uid(), 'cashier'::public.app_role)
    )
  );

-- Branch staff can preview photos uploaded by superadmin (owner profile has no branch_id).
DROP POLICY IF EXISTS "Branch staff view delivery photos" ON storage.objects;

CREATE POLICY "Branch staff view delivery photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'delivery-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = (storage.foldername(name))[1]::uuid
          AND p.branch_id = public.current_branch_id()
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = (storage.foldername(name))[1]::uuid
          AND ur.role = 'owner'::public.app_role
      )
    )
  );
