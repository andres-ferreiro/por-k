import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertTransferDriver(supabase: any, userId: string) {
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roleSet = new Set((roles ?? []).map((r: any) => r.role as string));
  if (!roleSet.has("transfer_driver") && !roleSet.has("owner")) {
    throw new Error("No tienes permiso para acceder a abastecimiento.");
  }
}

function bodegaLabel(row: { name: string; bodega_display_name?: string | null }) {
  return row.bodega_display_name?.trim() || row.name;
}

const TRANSFER_ORDER_SELECT =
  "id, branch_id, bodega_id, status, order_source, requesting_branch:branches!branch_supply_orders_branch_id_fkey(name), bodega:branches!branch_supply_orders_bodega_id_fkey(name, bodega_display_name)";

const TRANSFER_STOP_SELECT =
  "id, branch_id, bodega_id, status, order_source, notes, branch_receipt_status, correction_status, requesting_branch:branches!branch_supply_orders_branch_id_fkey(name, address), bodega:branches!branch_supply_orders_bodega_id_fkey(name, bodega_display_name)";

const TRANSFER_ORDER_DETAIL_SELECT =
  "id, branch_id, bodega_id, delivery_date, status, order_source, notes, branch_receipt_status, correction_status, correction_delivered_at, requesting_branch:branches!branch_supply_orders_branch_id_fkey(name, address), bodega:branches!branch_supply_orders_bodega_id_fkey(name, bodega_display_name)";

const TRANSFER_HISTORY_SELECT =
  "id, delivery_date, status, order_source, placed_at, requesting_branch:branches!branch_supply_orders_branch_id_fkey(name), bodega:branches!branch_supply_orders_bodega_id_fkey(name, bodega_display_name)";

export const getTransferDayOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertTransferDriver(context.supabase, context.userId);

    const { data: orders, error } = await context.supabase
      .from("branch_supply_orders")
      .select(TRANSFER_ORDER_SELECT)
      .eq("delivery_date", data.delivery_date)
      .neq("status", "cancelled");
    if (error) throw new Error(error.message);

    const orderIds = (orders ?? []).map((o: any) => o.id as string);
    if (orderIds.length === 0) {
      return { delivery_date: data.delivery_date, bodegas: [] as any[] };
    }

    const { data: items, error: iErr } = await context.supabase
      .from("branch_supply_order_items")
      .select("order_id, product_id, quantity, products(name, unit, bodega_category)")
      .in("order_id", orderIds);
    if (iErr) throw new Error(iErr.message);

    const ordersById = new Map((orders ?? []).map((o: any) => [o.id, o]));
    const bodegaMap = new Map<
      string,
      {
        bodega_id: string;
        bodega_name: string;
        branch_count: Set<string>;
        products: Map<
          string,
          {
            product_id: string;
            name: string;
            unit: string;
            bodega_category: string | null;
            total_quantity: number;
            branches: Map<string, { branch_id: string; branch_name: string; quantity: number }>;
          }
        >;
      }
    >();

    for (const item of items ?? []) {
      const order = ordersById.get(item.order_id as string);
      if (!order) continue;
      const bodegaId = order.bodega_id as string;
      const bodegaInfo = order.bodega as { name: string; bodega_display_name?: string | null };
      if (!bodegaMap.has(bodegaId)) {
        bodegaMap.set(bodegaId, {
          bodega_id: bodegaId,
          bodega_name: bodegaLabel(bodegaInfo),
          branch_count: new Set(),
          products: new Map(),
        });
      }
      const bucket = bodegaMap.get(bodegaId)!;
      bucket.branch_count.add(order.branch_id as string);

      const productId = item.product_id as string;
      const prod = item.products as { name: string; unit: string; bodega_category: string | null };
      if (!bucket.products.has(productId)) {
        bucket.products.set(productId, {
          product_id: productId,
          name: prod?.name ?? "—",
          unit: prod?.unit ?? "",
          bodega_category: prod?.bodega_category ?? null,
          total_quantity: 0,
          branches: new Map(),
        });
      }
      const pBucket = bucket.products.get(productId)!;
      const qty = Number(item.quantity);
      pBucket.total_quantity += qty;

      const branchId = order.branch_id as string;
      const branchName = (order.requesting_branch as { name?: string })?.name ?? "—";
      const existing = pBucket.branches.get(branchId);
      if (existing) existing.quantity += qty;
      else pBucket.branches.set(branchId, { branch_id: branchId, branch_name: branchName, quantity: qty });
    }

    const bodegas = [...bodegaMap.values()]
      .map((b) => ({
        bodega_id: b.bodega_id,
        bodega_name: b.bodega_name,
        branch_count: b.branch_count.size,
        products: [...b.products.values()]
          .map((p) => ({
            product_id: p.product_id,
            name: p.name,
            unit: p.unit,
            bodega_category: p.bodega_category,
            total_quantity: p.total_quantity,
            branches: [...p.branches.values()].sort((a, c) => a.branch_name.localeCompare(c.branch_name, "es")),
          }))
          .sort((a, c) => a.name.localeCompare(c.name, "es")),
      }))
      .sort((a, b) => a.bodega_name.localeCompare(b.bodega_name, "es"));

    return { delivery_date: data.delivery_date, bodegas };
  });

export const getTransferStops = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertTransferDriver(context.supabase, context.userId);

    const { data: orders, error } = await context.supabase
      .from("branch_supply_orders")
      .select(TRANSFER_STOP_SELECT)
      .eq("delivery_date", data.delivery_date)
      .neq("status", "cancelled")
      .order("order_source")
      .order("status");
    if (error) throw new Error(error.message);

    const orderIds = (orders ?? []).map((o: any) => o.id as string);
    const itemCounts = new Map<string, number>();
    if (orderIds.length > 0) {
      const { data: items, error: iErr } = await context.supabase
        .from("branch_supply_order_items")
        .select("order_id")
        .in("order_id", orderIds);
      if (iErr) throw new Error(iErr.message);
      for (const item of items ?? []) {
        const oid = item.order_id as string;
        itemCounts.set(oid, (itemCounts.get(oid) ?? 0) + 1);
      }
    }

    return (orders ?? []).map((o: any) => {
      const branch = o.requesting_branch as { name?: string; address?: string | null };
      const bodega = o.bodega as { name: string; bodega_display_name?: string | null };
      const isInterBodega = o.order_source === "bodega";
      return {
        order_id: o.id as string,
        branch_id: o.branch_id as string,
        branch_name: branch?.name ?? "—",
        branch_address: branch?.address ?? null,
        bodega_id: o.bodega_id as string,
        bodega_name: bodegaLabel(bodega),
        status: o.status as string,
        order_source: o.order_source as string,
        is_inter_bodega: isInterBodega,
        stop_label: isInterBodega
          ? `${bodegaLabel(bodega)} → ${branch?.name ?? "—"}`
          : `${branch?.name ?? "—"}`,
        item_count: itemCounts.get(o.id) ?? 0,
        notes: (o.notes as string | null) ?? null,
        branch_receipt_status: (o.branch_receipt_status as string | null) ?? null,
        correction_status: (o.correction_status as string | null) ?? null,
        needs_correction:
          o.branch_receipt_status === "incomplete" && o.correction_status === "pending",
      };
    });
  });

export const getTransferOrderDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ order_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertTransferDriver(context.supabase, context.userId);

    const { data: order, error } = await context.supabase
      .from("branch_supply_orders")
      .select(TRANSFER_ORDER_DETAIL_SELECT)
      .eq("id", data.order_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Pedido no encontrado.");

    const { data: items, error: iErr } = await context.supabase
      .from("branch_supply_order_items")
      .select("id, product_id, quantity, received_quantity, correction_quantity, products(name, unit, bodega_category)")
      .eq("order_id", data.order_id);
    if (iErr) throw new Error(iErr.message);

    const branch = (order as any).requesting_branch;
    const bodega = (order as any).bodega;

    const mappedItems = (items ?? []).map((i: any) => {
      const quantity = Number(i.quantity);
      const received =
        i.received_quantity != null ? Number(i.received_quantity) : null;
      const correction =
        i.correction_quantity != null ? Number(i.correction_quantity) : null;
      const shortage =
        received != null && received < quantity ? quantity - received : 0;
      return {
        id: i.id as string,
        product_id: i.product_id as string,
        name: i.products?.name ?? "—",
        unit: i.products?.unit ?? "",
        bodega_category: i.products?.bodega_category ?? null,
        quantity,
        received_quantity: received,
        correction_quantity: correction,
        shortage_quantity: shortage,
      };
    });

    return {
      id: order.id as string,
      branch_name: branch?.name ?? "—",
      branch_address: branch?.address ?? null,
      bodega_name: bodega ? bodegaLabel(bodega) : "—",
      delivery_date: order.delivery_date as string,
      status: order.status as string,
      order_source: order.order_source as string,
      notes: (order.notes as string | null) ?? null,
      branch_receipt_status: (order.branch_receipt_status as string | null) ?? null,
      correction_status: (order.correction_status as string | null) ?? null,
      correction_delivered_at: (order.correction_delivered_at as string | null) ?? null,
      needs_correction:
        order.branch_receipt_status === "incomplete" &&
        order.correction_status === "pending",
      items: mappedItems,
    };
  });

const correctionItemSchema = z.object({
  item_id: z.string().uuid(),
  correction_quantity: z.number().min(0).max(100000),
});

export const markCorrectionDelivered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        order_id: z.string().uuid(),
        items: z.array(correctionItemSchema).min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertTransferDriver(context.supabase, context.userId);

    const { data: order, error } = await context.supabase
      .from("branch_supply_orders")
      .select("id, status, branch_receipt_status, correction_status")
      .eq("id", data.order_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Pedido no encontrado.");

    if (order.status !== "delivered") {
      throw new Error("Solo se pueden registrar correcciones en pedidos ya entregados.");
    }
    if (order.branch_receipt_status !== "incomplete" || order.correction_status !== "pending") {
      throw new Error("Este pedido no tiene corrección pendiente.");
    }

    const { data: orderItems, error: itemsErr } = await context.supabase
      .from("branch_supply_order_items")
      .select("id, quantity, received_quantity")
      .eq("order_id", data.order_id);
    if (itemsErr) throw new Error(itemsErr.message);

    const itemMap = new Map(
      (orderItems ?? []).map((i: any) => [
        i.id as string,
        {
          quantity: Number(i.quantity),
          received: i.received_quantity != null ? Number(i.received_quantity) : null,
        },
      ]),
    );

    const correctionByItem = new Map(
      data.items.map((i) => [i.item_id, i.correction_quantity]),
    );

    let hasDelivery = false;
    for (const [itemId, info] of itemMap) {
      const correction = correctionByItem.get(itemId) ?? 0;
      if (info.received == null) continue;
      const shortage = info.quantity - info.received;
      if (correction > shortage) {
        throw new Error("La corrección no puede superar lo que faltó.");
      }
      if (correction > 0) hasDelivery = true;

      const { error: uErr } = await context.supabase
        .from("branch_supply_order_items")
        .update({ correction_quantity: correction })
        .eq("id", itemId);
      if (uErr) throw new Error(uErr.message);
    }

    if (!hasDelivery) {
      throw new Error("Indica al menos una cantidad entregada en la corrección.");
    }

    const { error: uErr } = await context.supabase
      .from("branch_supply_orders")
      .update({
        correction_status: "delivered",
        correction_delivered_at: new Date().toISOString(),
      })
      .eq("id", data.order_id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });

export const markTransferOrderDelivered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ order_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertTransferDriver(context.supabase, context.userId);

    const { data: order, error } = await context.supabase
      .from("branch_supply_orders")
      .select("id, status")
      .eq("id", data.order_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Pedido no encontrado.");

    const current = order.status as string;
    if (current === "delivered") return { ok: true };
    if (current === "cancelled") throw new Error("Este pedido fue cancelado.");
    if (current !== "pending" && current !== "confirmed") {
      throw new Error("No se puede marcar como entregado.");
    }

    const { error: uErr } = await context.supabase
      .from("branch_supply_orders")
      .update({ status: "delivered" })
      .eq("id", data.order_id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });

export const getTransferHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertTransferDriver(context.supabase, context.userId);

    const { data: orders, error } = await context.supabase
      .from("branch_supply_orders")
      .select(TRANSFER_HISTORY_SELECT)
      .eq("status", "delivered")
      .order("delivery_date", { ascending: false })
      .order("placed_at", { ascending: false })
      .limit(data.limit ?? 30);
    if (error) throw new Error(error.message);

    return (orders ?? []).map((o: any) => ({
      id: o.id as string,
      delivery_date: o.delivery_date as string,
      status: o.status as string,
      order_source: o.order_source as string,
      branch_name: o.requesting_branch?.name ?? "—",
      bodega_name: o.bodega ? bodegaLabel(o.bodega) : "—",
      placed_at: o.placed_at as string,
    }));
  });
