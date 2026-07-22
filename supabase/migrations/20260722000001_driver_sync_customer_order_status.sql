-- Drivers confirming preorder deliveries must update customer_orders.status.
-- Previously only SELECT was granted, so delivery.status synced but order.status stayed "confirmed".

CREATE POLICY "Drivers update own route orders"
  ON public.customer_orders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.routes r
      WHERE r.id = customer_orders.route_id
        AND r.driver_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.routes r
      WHERE r.id = customer_orders.route_id
        AND r.driver_id = auth.uid()
    )
  );

-- Backfill orders where the linked delivery was already marked delivered/failed.
UPDATE public.customer_orders co
SET status = CASE d.status
  WHEN 'delivered' THEN 'delivered'::public.order_status
  WHEN 'failed' THEN 'failed'::public.order_status
  ELSE co.status
END
FROM public.deliveries d
WHERE d.id = co.delivery_id
  AND co.status = 'confirmed'
  AND d.status IN ('delivered', 'failed');
