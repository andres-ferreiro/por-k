import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { todayInTZ } from "@/lib/tz";
import { deliveryNetTotals } from "@/lib/delivery-totals";

async function getMyBranchAndRoles(supabase: any, userId: string) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("branch_id").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const roleSet = new Set((roles ?? []).map((r: any) => r.role as string));
  return { branchId: profile?.branch_id as string | null, isOwner: roleSet.has("owner"), roles: roleSet };
}

async function resolveBranchId(
  supabase: any,
  userId: string,
  inputBranchId: string | null | undefined,
): Promise<string> {
  const { branchId, isOwner } = await getMyBranchAndRoles(supabase, userId);
  if (isOwner) {
    if (!inputBranchId) throw new Error("Selecciona una sucursal.");
    return inputBranchId;
  }
  if (!branchId) throw new Error("Tu cuenta no tiene sucursal asignada.");
  return branchId;
}

async function assertCanManageOrders(roles: Set<string>) {
  if (roles.has("owner") || roles.has("supervisor") || roles.has("cashier")) return;
  throw new Error("No tienes permiso para gestionar pedidos.");
}

/** Prefer delivery outcome when order row was not synced after driver confirmation. */
function effectiveOrderStatus(
  orderStatus: string,
  deliveryStatus: string | null | undefined,
): string {
  if (orderStatus === "delivered" || orderStatus === "failed" || orderStatus === "cancelled") {
    return orderStatus;
  }
  if (deliveryStatus === "delivered" || deliveryStatus === "failed") return deliveryStatus;
  return orderStatus;
}

async function getPreorderRouteForBranch(supabase: any, branchId: string) {
  const { data: branch, error } = await supabase
    .from("branches")
    .select("preorder_enabled, preorder_route_id, routes:preorder_route_id(id, name, driver_id, route_mode)")
    .eq("id", branchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!branch?.preorder_enabled || !branch.preorder_route_id) {
    throw new Error("Esta sucursal no tiene ruta de pedidos activada.");
  }
  return {
    routeId: branch.preorder_route_id as string,
    route: (branch as any).routes as { id: string; name: string; driver_id: string | null; route_mode: string },
  };
}

async function resolveProductPrices(
  supabase: any,
  customerId: string,
  productIds: string[],
): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();
  if (productIds.length === 0) return priceMap;
  const [{ data: prods, error: pErr }, { data: ov, error: oErr }] = await Promise.all([
    supabase.from("products").select("id, price").in("id", productIds),
    supabase.from("customer_prices").select("product_id, price").eq("customer_id", customerId).in("product_id", productIds),
  ]);
  if (pErr) throw new Error(pErr.message);
  if (oErr) throw new Error(oErr.message);
  for (const p of prods ?? []) priceMap.set(p.id as string, Number((p as any).price));
  for (const o of ov ?? []) priceMap.set((o as any).product_id, Number((o as any).price));
  return priceMap;
}

async function syncPaymentForDeliveredPreorder(
  supabase: any,
  order: { branch_id: string; route_id: string; customer_id: string },
  deliveryId: string,
  driverId: string,
  total: number,
) {
  if (total <= 0) return;
  const payRow = {
    branch_id: order.branch_id,
    route_id: order.route_id,
    customer_id: order.customer_id,
    driver_id: driverId,
    delivery_id: deliveryId,
    amount: Number(total.toFixed(2)),
    method: "credit" as const,
    status: "pending" as const,
  };
  const { data: existingPay } = await supabase
    .from("payments")
    .select("id")
    .eq("delivery_id", deliveryId)
    .maybeSingle();
  if (existingPay) {
    const { error } = await supabase.from("payments").update(payRow).eq("id", existingPay.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("payments").insert(payRow);
    if (error) throw new Error(error.message);
  }
}

async function syncDeliveryFromOrder(
  supabase: any,
  order: { id: string; branch_id: string; route_id: string; customer_id: string; delivery_date: string; delivery_id: string | null },
  items: { product_id: string; quantity: number; unit_price: number }[],
  driverId: string,
  opts?: { photo_path?: string | null },
) {
  if (!driverId) {
    throw new Error("Selecciona un repartidor para este pedido.");
  }

  const deliveryRow = {
    branch_id: order.branch_id,
    route_id: order.route_id,
    customer_id: order.customer_id,
    driver_id: driverId,
    delivery_date: order.delivery_date,
    status: "pending" as const,
  };

  let deliveryId = order.delivery_id;
  let isDelivered = false;
  if (deliveryId) {
    const { data: existing } = await supabase
      .from("deliveries")
      .select("status")
      .eq("id", deliveryId)
      .maybeSingle();
    isDelivered = existing?.status === "delivered";
    const updatePayload: Record<string, unknown> = { driver_id: deliveryRow.driver_id };
    if (isDelivered) {
      if (opts?.photo_path) updatePayload.photo_url = opts.photo_path;
    } else {
      updatePayload.status = "pending";
    }
    const { error: uErr } = await supabase
      .from("deliveries")
      .update(updatePayload)
      .eq("id", deliveryId);
    if (uErr) throw new Error(uErr.message);
  } else {
    const { data: del, error: dErr } = await supabase
      .from("deliveries")
      .upsert(deliveryRow, { onConflict: "route_id,customer_id,delivery_date" })
      .select("id")
      .single();
    if (dErr) throw new Error(dErr.message);
    deliveryId = del.id as string;
    await supabase.from("customer_orders").update({ delivery_id: deliveryId }).eq("id", order.id);
  }

  await supabase.from("delivery_items").delete().eq("delivery_id", deliveryId);
  if (items.length > 0) {
    const rows = items.map((i) => ({
      delivery_id: deliveryId,
      product_id: i.product_id,
      quantity: i.quantity,
      unit_price: i.unit_price,
    }));
    const { error: iErr } = await supabase.from("delivery_items").insert(rows);
    if (iErr) throw new Error(iErr.message);
  }

  const total = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  if (isDelivered) {
    await syncPaymentForDeliveredPreorder(supabase, order, deliveryId, driverId, total);
  }
  return { delivery_id: deliveryId, total };
}

export const getPreorderRouteInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ branch_id: z.string().uuid().optional().nullable() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const branchId = await resolveBranchId(context.supabase, context.userId, data.branch_id ?? null);
    const { data: branch, error } = await context.supabase
      .from("branches")
      .select("preorder_enabled, preorder_route_id")
      .eq("id", branchId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!branch?.preorder_route_id) {
      return { preorder_enabled: Boolean(branch?.preorder_enabled), route: null };
    }
    const { data: route, error: rErr } = await context.supabase
      .from("routes")
      .select("id, name, driver_id")
      .eq("id", branch.preorder_route_id)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    return {
      preorder_enabled: Boolean(branch.preorder_enabled),
      route: route
        ? {
            id: route.id as string,
            name: route.name as string,
            driver_id: (route.driver_id as string | null) ?? null,
          }
        : null,
    };
  });

export const listPreorderCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ branch_id: z.string().uuid().optional().nullable() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { roles } = await getMyBranchAndRoles(context.supabase, context.userId);
    await assertCanManageOrders(roles);
    const branchId = await resolveBranchId(context.supabase, context.userId, data.branch_id ?? null);
    const { routeId } = await getPreorderRouteForBranch(context.supabase, branchId);

    const { data: stops, error } = await context.supabase
      .from("route_customers")
      .select("position, customers(id, name, phone, address, category, is_active)")
      .eq("route_id", routeId)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);

    return (stops ?? []).map((s: any) => ({
      position: s.position as number,
      id: s.customers.id as string,
      name: s.customers.name as string,
      phone: (s.customers.phone as string | null) ?? null,
      address: (s.customers.address as string | null) ?? null,
      category: s.customers.category as string,
      is_active: Boolean(s.customers.is_active),
    }));
  });

export const listOrdersForDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      branch_id: z.string().uuid().optional().nullable(),
      delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { roles } = await getMyBranchAndRoles(context.supabase, context.userId);
    await assertCanManageOrders(roles);
    const branchId = await resolveBranchId(context.supabase, context.userId, data.branch_id ?? null);
    const { routeId } = await getPreorderRouteForBranch(context.supabase, branchId);

    const { data: orders, error } = await context.supabase
      .from("customer_orders")
      .select(`
        id, customer_id, status, delivery_date, notes, delivery_id,
        deliveries(status),
        customers(name, category),
        customer_order_items(product_id, quantity, unit_price, products(name, unit))
      `)
      .eq("route_id", routeId)
      .eq("delivery_date", data.delivery_date)
      .neq("status", "cancelled");
    if (error) throw new Error(error.message);

    return (orders ?? []).map((o: any) => {
      const items = (o.customer_order_items ?? []).map((i: any) => ({
        product_id: i.product_id as string,
        product_name: i.products?.name ?? "",
        unit: i.products?.unit ?? "",
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        line_total: Number(i.quantity) * Number(i.unit_price),
      }));
      const total = items.reduce((s: number, i: any) => s + i.line_total, 0);
      const deliveryStatus = (o.deliveries as { status?: string } | null)?.status ?? null;
      return {
        id: o.id as string,
        customer_id: o.customer_id as string,
        customer_name: o.customers?.name ?? "",
        category: o.customers?.category ?? "retail",
        status: effectiveOrderStatus(o.status as string, deliveryStatus),
        delivery_date: o.delivery_date as string,
        notes: (o.notes as string | null) ?? null,
        delivery_id: (o.delivery_id as string | null) ?? null,
        items,
        total,
        item_count: items.reduce((s: number, i: any) => s + i.quantity, 0),
      };
    });
  });

export const getOrderDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      customer_id: z.string().uuid(),
      delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { roles } = await getMyBranchAndRoles(context.supabase, context.userId);
    await assertCanManageOrders(roles);

    const { data: order, error } = await context.supabase
      .from("customer_orders")
      .select(`
        id, status, notes, delivery_id, branch_id, route_id, customer_id, delivery_date,
        deliveries(driver_id, photo_url, status),
        customer_order_items(product_id, quantity, unit_price, products(name, unit))
      `)
      .eq("customer_id", data.customer_id)
      .eq("delivery_date", data.delivery_date)
      .neq("status", "cancelled")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) return { order: null, items: [], driver_id: null };

    const items = ((order as any).customer_order_items ?? []).map((i: any) => ({
      product_id: i.product_id as string,
      product_name: i.products?.name ?? "",
      unit: i.products?.unit ?? "",
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
    }));

    const delivery = (order as any).deliveries as { driver_id?: string | null; photo_url?: string | null; status?: string } | null;

    return {
      order: {
        id: order.id as string,
        status: effectiveOrderStatus(order.status as string, delivery?.status),
        notes: (order.notes as string | null) ?? null,
        delivery_id: (order.delivery_id as string | null) ?? null,
      },
      items,
      driver_id: delivery?.driver_id ?? null,
      photo_url: delivery?.photo_url ?? null,
      delivery_status: delivery?.status ?? null,
    };
  });

const orderLineSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().positive().max(100000),
});

export const upsertOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      branch_id: z.string().uuid().optional().nullable(),
      customer_id: z.string().uuid(),
      delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      driver_id: z.string().uuid(),
      items: z.array(orderLineSchema).min(1).max(100),
      notes: z.string().max(500).nullable().optional(),
      photo_path: z.string().max(500).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { roles } = await getMyBranchAndRoles(supabase, userId);
    await assertCanManageOrders(roles);
    const branchId = await resolveBranchId(supabase, userId, data.branch_id ?? null);
    const { routeId } = await getPreorderRouteForBranch(supabase, branchId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: driverRole } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", data.driver_id)
      .eq("role", "driver")
      .maybeSingle();
    if (!driverRole) throw new Error("El repartidor seleccionado no es válido.");

    const { data: driverProfile, error: driverErr } = await supabaseAdmin
      .from("profiles")
      .select("id, branch_id, is_active")
      .eq("id", data.driver_id)
      .maybeSingle();
    if (driverErr) throw new Error(driverErr.message);
    if (!driverProfile?.is_active || driverProfile.branch_id !== branchId) {
      throw new Error("El repartidor debe estar activo y pertenecer a esta sucursal.");
    }

    const { data: rc, error: rcErr } = await supabase
      .from("route_customers")
      .select("customer_id")
      .eq("route_id", routeId)
      .eq("customer_id", data.customer_id)
      .maybeSingle();
    if (rcErr) throw new Error(rcErr.message);
    if (!rc) throw new Error("Cliente no pertenece a la ruta de pedidos.");

    const { data: customer, error: cErr } = await supabase
      .from("customers")
      .select("category")
      .eq("id", data.customer_id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!customer || (customer.category !== "hotel" && customer.category !== "restaurant")) {
      throw new Error("Solo clientes hotel o restaurante pueden tener pedidos.");
    }

    const productIds = data.items.map((i) => i.product_id);
    const priceMap = await resolveProductPrices(supabase, data.customer_id, productIds);
    const orderItems = data.items.map((i) => ({
      product_id: i.product_id,
      quantity: i.quantity,
      unit_price: priceMap.get(i.product_id) ?? 0,
    }));

    const { data: existing, error: exErr } = await supabase
      .from("customer_orders")
      .select("id, status, delivery_id")
      .eq("customer_id", data.customer_id)
      .eq("delivery_date", data.delivery_date)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);

    let orderId: string;
    let deliveryId: string | null = existing?.delivery_id ?? null;

    if (existing) {
      orderId = existing.id as string;
      if (existing.status === "cancelled") {
        deliveryId = null;
      }
      const { error: uErr } = await supabase
        .from("customer_orders")
        .update({
          branch_id: branchId,
          route_id: routeId,
          status: existing.status === "delivered" ? "delivered" : "confirmed",
          notes: data.notes ?? null,
          placed_by: userId,
          placed_at: new Date().toISOString(),
          ...(existing.status === "cancelled" ? { delivery_id: null } : {}),
        })
        .eq("id", orderId);
      if (uErr) throw new Error(uErr.message);
    } else {
      const { data: order, error: oErr } = await supabase
        .from("customer_orders")
        .insert({
          branch_id: branchId,
          route_id: routeId,
          customer_id: data.customer_id,
          delivery_date: data.delivery_date,
          status: "confirmed",
          placed_by: userId,
          notes: data.notes ?? null,
        })
        .select("id")
        .single();
      if (oErr) throw new Error(oErr.message);
      orderId = order.id as string;
    }

    await supabase.from("customer_order_items").delete().eq("order_id", orderId);
    const { error: iErr } = await supabase.from("customer_order_items").insert(
      orderItems.map((i) => ({ order_id: orderId, ...i })),
    );
    if (iErr) throw new Error(iErr.message);

    const syncResult = await syncDeliveryFromOrder(
      supabase,
      {
        id: orderId,
        branch_id: branchId,
        route_id: routeId,
        customer_id: data.customer_id,
        delivery_date: data.delivery_date,
        delivery_id: deliveryId,
      },
      orderItems,
      data.driver_id,
      { photo_path: data.photo_path },
    );

    return { ok: true, order_id: orderId, delivery_id: syncResult.delivery_id, total: syncResult.total };
  });

export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      order_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { roles } = await getMyBranchAndRoles(supabase, userId);
    await assertCanManageOrders(roles);

    const { data: order, error: oErr } = await supabase
      .from("customer_orders")
      .select("id, status, delivery_id, branch_id")
      .eq("id", data.order_id)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!order) throw new Error("Pedido no encontrado.");
    if (order.status === "delivered") throw new Error("No se puede cancelar un pedido entregado.");

    const { error: uErr } = await supabase
      .from("customer_orders")
      .update({ status: "cancelled" })
      .eq("id", data.order_id);
    if (uErr) throw new Error(uErr.message);

    if (order.delivery_id) {
      const { data: del } = await supabase
        .from("deliveries")
        .select("status")
        .eq("id", order.delivery_id)
        .maybeSingle();
      if (del?.status === "pending") {
        await supabase.from("delivery_items").delete().eq("delivery_id", order.delivery_id);
        await supabase.from("deliveries").delete().eq("id", order.delivery_id);
      }
    }

    return { ok: true };
  });

export const getCustomerPricedProductsForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ customer_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: products, error: pErr } = await context.supabase
      .from("products")
      .select("id, name, unit, price")
      .eq("is_active", true)
      .eq("is_bodega_supply", false)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    if (pErr) throw new Error(pErr.message);
    const { data: overrides, error: oErr } = await context.supabase
      .from("customer_prices")
      .select("product_id, price")
      .eq("customer_id", data.customer_id);
    if (oErr) throw new Error(oErr.message);
    const ov = new Map((overrides ?? []).map((o: any) => [o.product_id, Number(o.price)]));
    return (products ?? []).map((p: any) => ({
      id: p.id as string,
      name: p.name as string,
      unit: p.unit as string,
      effective_price: ov.has(p.id) ? (ov.get(p.id) as number) : Number(p.price),
    }));
  });

export { todayInTZ };
