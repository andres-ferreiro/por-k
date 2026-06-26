import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertCanOrderForDelivery, canOrderForDelivery } from "@/lib/bodega-deadline";

export type BodegaBranchInfo = {
  id: string;
  name: string;
  bodega_display_name: string | null;
};

async function getMyBranchAndRoles(supabase: any, userId: string) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("branch_id").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const roleSet = new Set((roles ?? []).map((r: any) => r.role as string));
  return {
    branchId: (profile?.branch_id as string | null) ?? null,
    isOwner: roleSet.has("owner"),
    roles: roleSet,
  };
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

async function assertCanManageBodegaOrders(roles: Set<string>) {
  if (roles.has("owner") || roles.has("supervisor") || roles.has("cashier")) return;
  throw new Error("No tienes permiso para gestionar pedidos de bodega.");
}

async function isBodegaBranch(supabase: any, branchId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("branches")
    .select("is_bodega")
    .eq("id", branchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data?.is_bodega);
}

async function assertOrderingBranch(supabase: any, branchId: string) {
  if (await isBodegaBranch(supabase, branchId)) {
    throw new Error("La sucursal bodega recibe pedidos; usa la pestaña de pedidos a otra bodega.");
  }
}

async function assertBodegaBranch(supabase: any, branchId: string) {
  if (!(await isBodegaBranch(supabase, branchId))) {
    throw new Error("Esta sucursal no está configurada como bodega.");
  }
}

function bodegaLabel(row: { name: string; bodega_display_name?: string | null }) {
  return row.bodega_display_name?.trim() || row.name;
}

async function fetchActiveBodegas(supabase: any): Promise<BodegaBranchInfo[]> {
  const { data, error } = await supabase
    .from("branches")
    .select("id, name, bodega_display_name")
    .eq("is_bodega", true)
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((b: any) => ({
    id: b.id as string,
    name: b.name as string,
    bodega_display_name: (b.bodega_display_name as string | null) ?? null,
  }));
}

const SUPPLY_ORDER_LIST_SELECT =
  "id, branch_id, bodega_id, delivery_date, status, order_source, placed_at, notes, branch_receipt_status, branch_receipt_note, requesting_branch:branches!branch_supply_orders_branch_id_fkey(name), bodega:branches!branch_supply_orders_bodega_id_fkey(name, bodega_display_name), profiles:placed_by(full_name)";

const SUPPLY_ORDER_DETAIL_SELECT =
  "id, branch_id, bodega_id, delivery_date, status, order_source, placed_at, notes, branch_receipt_status, branch_receipt_note, requesting_branch:branches!branch_supply_orders_branch_id_fkey(name, address), bodega:branches!branch_supply_orders_bodega_id_fkey(name, bodega_display_name), profiles:placed_by(full_name)";

export const getBodegaList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const bodegas = await fetchActiveBodegas(context.supabase);
    return bodegas.map((b) => ({
      ...b,
      label: bodegaLabel(b),
    }));
  });

export const listBodegaProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("products")
      .select("id, name, unit, bodega_category, is_active, bodega_id, bodega:branches!products_bodega_id_fkey(name, bodega_display_name)")
      .eq("is_bodega_supply", true)
      .order("bodega_id")
      .order("bodega_category", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((p: any) => ({
      id: p.id as string,
      name: p.name as string,
      unit: p.unit as string,
      bodega_category: p.bodega_category as string | null,
      is_active: p.is_active as boolean,
      bodega_id: (p.bodega_id as string | null) ?? null,
      bodega_name: p.bodega ? bodegaLabel(p.bodega) : null,
    }));
  });

export const getBodegaBranchInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const bodegas = await fetchActiveBodegas(context.supabase);
    if (bodegas.length === 0) return null;
    const first = bodegas[0];
    return { id: first.id, name: bodegaLabel(first) };
  });

export const getBranchBodegaContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ branch_id: z.string().uuid().optional().nullable() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const branchId = await resolveBranchId(context.supabase, context.userId, data.branch_id);
    const { data: branch, error } = await context.supabase
      .from("branches")
      .select("id, name, is_bodega, bodega_display_name")
      .eq("id", branchId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!branch) throw new Error("Sucursal no encontrada.");

    const bodegas = await fetchActiveBodegas(context.supabase);
    const bodegaList = bodegas.map((b) => ({
      id: b.id,
      name: b.name,
      label: bodegaLabel(b),
    }));
    const firstBodega = bodegaList[0] ?? null;

    return {
      branch_id: branch.id as string,
      branch_name: branch.name as string,
      is_bodega: Boolean(branch.is_bodega),
      bodega_display_name: (branch.bodega_display_name as string | null) ?? null,
      bodegas: bodegaList,
      bodega_branch: firstBodega ? { id: firstBodega.id, name: firstBodega.label } : null,
      other_bodegas: bodegaList.filter((b) => b.id !== branchId),
    };
  });

function mapOrderRow(r: any, itemCounts: Map<string, number>) {
  const bodega = r.bodega as { name?: string; bodega_display_name?: string | null } | null;
  return {
    id: r.id as string,
    branch_id: r.branch_id as string,
    branch_name: r.requesting_branch?.name ?? "—",
    bodega_id: r.bodega_id as string,
    bodega_name: bodega ? bodegaLabel(bodega) : "—",
    delivery_date: r.delivery_date as string,
    status: r.status as string,
    order_source: (r.order_source as string) ?? "branch",
    placed_at: r.placed_at as string,
    placed_by_name: r.profiles?.full_name ?? null,
    notes: (r.notes as string | null) ?? null,
    branch_receipt_status: (r.branch_receipt_status as string | null) ?? null,
    branch_receipt_note: (r.branch_receipt_note as string | null) ?? null,
    item_count: itemCounts.get(r.id) ?? 0,
    can_edit:
      r.status === "pending" && canOrderForDelivery(r.delivery_date as string),
  };
}

export const listBodegaOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        branch_id: z.string().uuid().optional().nullable(),
        bodega_id: z.string().uuid().optional().nullable(),
        delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        order_source: z.enum(["branch", "bodega", "all"]).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { roles } = await getMyBranchAndRoles(context.supabase, context.userId);
    await assertCanManageBodegaOrders(roles);
    const branchId = await resolveBranchId(context.supabase, context.userId, data.branch_id);
    const isBodega = await isBodegaBranch(context.supabase, branchId);

    let q = context.supabase
      .from("branch_supply_orders")
      .select(SUPPLY_ORDER_LIST_SELECT)
      .order("delivery_date", { ascending: false })
      .order("placed_at", { ascending: false })
      .limit(data.limit ?? 50);

    if (data.delivery_date) q = q.eq("delivery_date", data.delivery_date);
    if (data.order_source && data.order_source !== "all") {
      q = q.eq("order_source", data.order_source);
    }

    if (isBodega) {
      const filterBodegaId = data.bodega_id ?? branchId;
      q = q.or(
        `bodega_id.eq.${filterBodegaId},and(order_source.eq.bodega,branch_id.eq.${branchId})`,
      );
    } else {
      q = q.eq("branch_id", branchId).eq("order_source", "branch");
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const orderIds = (rows ?? []).map((r: any) => r.id as string);
    const itemCounts = new Map<string, number>();
    if (orderIds.length > 0) {
      const { data: items, error: iErr } = await context.supabase
        .from("branch_supply_order_items")
        .select("order_id, quantity")
        .in("order_id", orderIds);
      if (iErr) throw new Error(iErr.message);
      for (const item of items ?? []) {
        const oid = item.order_id as string;
        itemCounts.set(oid, (itemCounts.get(oid) ?? 0) + 1);
      }
    }

    return (rows ?? []).map((r: any) => mapOrderRow(r, itemCounts));
  });

export const getBodegaOrderDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ order_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { roles, branchId } = await getMyBranchAndRoles(context.supabase, context.userId);
    await assertCanManageBodegaOrders(roles);

    const { data: order, error } = await context.supabase
      .from("branch_supply_orders")
      .select(SUPPLY_ORDER_LIST_SELECT)
      .eq("id", data.order_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Pedido no encontrado.");

    const isBodega = branchId ? await isBodegaBranch(context.supabase, branchId) : false;
    const { isOwner } = await getMyBranchAndRoles(context.supabase, context.userId);
    if (!isOwner && !isBodega && order.branch_id !== branchId) {
      throw new Error("No tienes permiso para ver este pedido.");
    }

    const { data: items, error: iErr } = await context.supabase
      .from("branch_supply_order_items")
      .select("id, product_id, quantity, received_quantity, correction_quantity, products(name, unit, bodega_category)")
      .eq("order_id", data.order_id)
      .order("product_id");
    if (iErr) throw new Error(iErr.message);

    const bodega = (order as any).bodega;

    return {
      id: order.id as string,
      branch_id: order.branch_id as string,
      branch_name: (order as any).requesting_branch?.name ?? "—",
      bodega_id: order.bodega_id as string,
      bodega_name: bodega ? bodegaLabel(bodega) : "—",
      delivery_date: order.delivery_date as string,
      status: order.status as string,
      order_source: (order.order_source as string) ?? "branch",
      placed_at: order.placed_at as string,
      placed_by_name: (order as any).profiles?.full_name ?? null,
      notes: (order.notes as string | null) ?? null,
      branch_receipt_status: (order.branch_receipt_status as string | null) ?? null,
      branch_receipt_note: (order.branch_receipt_note as string | null) ?? null,
      correction_status: (order.correction_status as string | null) ?? null,
      correction_delivered_at: (order.correction_delivered_at as string | null) ?? null,
      can_edit:
        order.status === "pending" && canOrderForDelivery(order.delivery_date as string),
      items: (items ?? []).map((i: any) => ({
        id: i.id as string,
        product_id: i.product_id as string,
        quantity: Number(i.quantity),
        received_quantity: i.received_quantity != null ? Number(i.received_quantity) : null,
        correction_quantity: i.correction_quantity != null ? Number(i.correction_quantity) : null,
        name: i.products?.name ?? "—",
        unit: i.products?.unit ?? "",
        bodega_category: i.products?.bodega_category ?? null,
      })),
    };
  });

export const getBodegaOrdersForDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        branch_id: z.string().uuid().optional().nullable(),
        delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        order_source: z.enum(["branch", "bodega"]).optional(),
        target_bodega_id: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const branchId = await resolveBranchId(context.supabase, context.userId, data.branch_id);
    const orderSource = data.order_source ?? "branch";

    if (orderSource === "branch") {
      await assertOrderingBranch(context.supabase, branchId);
    } else {
      await assertBodegaBranch(context.supabase, branchId);
    }

    let q = context.supabase
      .from("branch_supply_orders")
      .select("id, bodega_id, delivery_date, status, notes")
      .eq("branch_id", branchId)
      .eq("delivery_date", data.delivery_date)
      .eq("order_source", orderSource);

    if (data.target_bodega_id) {
      q = q.eq("bodega_id", data.target_bodega_id);
    }

    const { data: orders, error } = await q;
    if (error) throw new Error(error.message);

    if (!orders || orders.length === 0) return { orders: [], merged_items: [] as { product_id: string; quantity: number }[] };

    const orderIds = orders.map((o: any) => o.id as string);
    const { data: items, error: iErr } = await context.supabase
      .from("branch_supply_order_items")
      .select("order_id, product_id, quantity")
      .in("order_id", orderIds);
    if (iErr) throw new Error(iErr.message);

    const merged = new Map<string, number>();
    for (const item of items ?? []) {
      const pid = item.product_id as string;
      merged.set(pid, (merged.get(pid) ?? 0) + Number(item.quantity));
    }

    return {
      orders: orders.map((o: any) => ({
        id: o.id as string,
        bodega_id: o.bodega_id as string,
        delivery_date: o.delivery_date as string,
        status: o.status as string,
        notes: (o.notes as string | null) ?? null,
        can_edit: o.status === "pending" && canOrderForDelivery(o.delivery_date as string),
      })),
      merged_items: [...merged.entries()].map(([product_id, quantity]) => ({ product_id, quantity })),
    };
  });

/** @deprecated Use getBodegaOrdersForDate */
export const getBodegaOrderForDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        branch_id: z.string().uuid().optional().nullable(),
        delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const branchId = await resolveBranchId(context.supabase, context.userId, data.branch_id);
    await assertOrderingBranch(context.supabase, branchId);

    const { data: orders, error } = await context.supabase
      .from("branch_supply_orders")
      .select("id, delivery_date, status, notes")
      .eq("branch_id", branchId)
      .eq("delivery_date", data.delivery_date)
      .eq("order_source", "branch");

    if (error) throw new Error(error.message);
    if (!orders || orders.length === 0) return null;

    const orderIds = orders.map((o: any) => o.id as string);
    const { data: items, error: iErr } = await context.supabase
      .from("branch_supply_order_items")
      .select("product_id, quantity")
      .in("order_id", orderIds);
    if (iErr) throw new Error(iErr.message);

    const merged = new Map<string, number>();
    for (const item of items ?? []) {
      const pid = item.product_id as string;
      merged.set(pid, (merged.get(pid) ?? 0) + Number(item.quantity));
    }

    const firstOrder = orders[0];
    return {
      id: firstOrder.id as string,
      delivery_date: data.delivery_date,
      status: firstOrder.status as string,
      notes: (firstOrder.notes as string | null) ?? null,
      can_edit: orders.every(
        (o: any) => o.status === "pending" && canOrderForDelivery(o.delivery_date as string),
      ),
      items: [...merged.entries()].map(([product_id, quantity]) => ({ product_id, quantity })),
      order_count: orders.length,
    };
  });

const orderItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().positive().max(100000),
});

async function upsertOrderItems(
  supabase: any,
  orderId: string,
  items: { product_id: string; quantity: number }[],
) {
  const { error: delErr } = await supabase
    .from("branch_supply_order_items")
    .delete()
    .eq("order_id", orderId);
  if (delErr) throw new Error(delErr.message);

  if (items.length === 0) return;

  const { error: insErr } = await supabase.from("branch_supply_order_items").insert(
    items.map((i) => ({
      order_id: orderId,
      product_id: i.product_id,
      quantity: i.quantity,
    })),
  );
  if (insErr) throw new Error(insErr.message);
}

async function validateSupplyProducts(
  supabase: any,
  items: { product_id: string; quantity: number }[],
) {
  const productIds = items.map((i) => i.product_id);
  const { data: prods, error: pErr } = await supabase
    .from("products")
    .select("id, bodega_id")
    .eq("is_bodega_supply", true)
    .eq("is_active", true)
    .in("id", productIds);
  if (pErr) throw new Error(pErr.message);
  if ((prods ?? []).length !== productIds.length) {
    throw new Error("Uno o más productos no son válidos para pedidos de bodega.");
  }
  const missingBodega = (prods ?? []).find((p: any) => !p.bodega_id);
  if (missingBodega) {
    throw new Error("Hay productos sin bodega asignada. Contacta al administrador.");
  }
  return prods as { id: string; bodega_id: string }[];
}

async function upsertSupplyOrderForBodega(
  supabase: any,
  params: {
    branchId: string;
    bodegaId: string;
    deliveryDate: string;
    orderSource: "branch" | "bodega";
    notes: string | null;
    userId: string;
    items: { product_id: string; quantity: number }[];
  },
) {
  const { branchId, bodegaId, deliveryDate, orderSource, notes, userId, items } = params;

  const { data: existing } = await supabase
    .from("branch_supply_orders")
    .select("id, status")
    .eq("branch_id", branchId)
    .eq("delivery_date", deliveryDate)
    .eq("bodega_id", bodegaId)
    .eq("order_source", orderSource)
    .maybeSingle();

  if (existing) {
    if (existing.status !== "pending") {
      throw new Error("Ya existe un pedido confirmado o entregado para esta fecha y bodega.");
    }
    const { error: uErr } = await supabase
      .from("branch_supply_orders")
      .update({
        notes,
        placed_by: userId,
        placed_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (uErr) throw new Error(uErr.message);
    await upsertOrderItems(supabase, existing.id as string, items);
    return { id: existing.id as string, updated: true };
  }

  const { data: order, error } = await supabase
    .from("branch_supply_orders")
    .insert({
      branch_id: branchId,
      bodega_id: bodegaId,
      delivery_date: deliveryDate,
      order_source: orderSource,
      placed_by: userId,
      notes,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await upsertOrderItems(supabase, order.id as string, items);
  return { id: order.id as string, updated: false };
}

export const placeBodegaOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        branch_id: z.string().uuid().optional().nullable(),
        delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        notes: z.string().max(500).optional().nullable(),
        items: z.array(orderItemSchema).min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { roles } = await getMyBranchAndRoles(context.supabase, context.userId);
    await assertCanManageBodegaOrders(roles);
    const branchId = await resolveBranchId(context.supabase, context.userId, data.branch_id);
    await assertOrderingBranch(context.supabase, branchId);
    assertCanOrderForDelivery(data.delivery_date);

    const bodegas = await fetchActiveBodegas(context.supabase);
    if (bodegas.length === 0) throw new Error("No hay sucursales bodega configuradas.");

    const prods = await validateSupplyProducts(context.supabase, data.items);
    const bodegaByProduct = new Map(prods.map((p) => [p.id, p.bodega_id]));

    const byBodega = new Map<string, { product_id: string; quantity: number }[]>();
    for (const item of data.items) {
      const bodegaId = bodegaByProduct.get(item.product_id);
      if (!bodegaId) throw new Error("Producto sin bodega asignada.");
      if (!byBodega.has(bodegaId)) byBodega.set(bodegaId, []);
      byBodega.get(bodegaId)!.push(item);
    }

    const results: { id: string; bodega_id: string; updated: boolean }[] = [];
    for (const [bodegaId, items] of byBodega) {
      const result = await upsertSupplyOrderForBodega(context.supabase, {
        branchId,
        bodegaId,
        deliveryDate: data.delivery_date,
        orderSource: "branch",
        notes: data.notes ?? null,
        userId: context.userId,
        items,
      });
      results.push({ ...result, bodega_id: bodegaId });
    }

    // Clear pending orders for bodegas no longer in the cart
    const { data: existingOrders } = await context.supabase
      .from("branch_supply_orders")
      .select("id, bodega_id, status")
      .eq("branch_id", branchId)
      .eq("delivery_date", data.delivery_date)
      .eq("order_source", "branch");

    for (const order of existingOrders ?? []) {
      if (order.status !== "pending") continue;
      if (!byBodega.has(order.bodega_id as string)) {
        await context.supabase.from("branch_supply_order_items").delete().eq("order_id", order.id);
        await context.supabase.from("branch_supply_orders").delete().eq("id", order.id);
      }
    }

    return { orders: results };
  });

export const placeInterBodegaOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        from_bodega_id: z.string().uuid().optional().nullable(),
        to_bodega_id: z.string().uuid(),
        delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        notes: z.string().max(500).optional().nullable(),
        items: z.array(orderItemSchema).min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { roles } = await getMyBranchAndRoles(context.supabase, context.userId);
    await assertCanManageBodegaOrders(roles);

    const fromBodegaId = data.from_bodega_id
      ? data.from_bodega_id
      : await resolveBranchId(context.supabase, context.userId, null);

    await assertBodegaBranch(context.supabase, fromBodegaId);
    if (fromBodegaId === data.to_bodega_id) {
      throw new Error("No puedes pedir a la misma bodega.");
    }

    const { data: target } = await context.supabase
      .from("branches")
      .select("id, is_bodega, is_active")
      .eq("id", data.to_bodega_id)
      .maybeSingle();
    if (!target?.is_bodega || !target.is_active) {
      throw new Error("La bodega destino no es válida.");
    }

    assertCanOrderForDelivery(data.delivery_date);
    await validateSupplyProducts(context.supabase, data.items);

    const prods = await context.supabase
      .from("products")
      .select("id, bodega_id")
      .eq("is_bodega_supply", true)
      .in(
        "id",
        data.items.map((i) => i.product_id),
      );
    if (prods.error) throw new Error(prods.error.message);

    for (const item of data.items) {
      const prod = (prods.data ?? []).find((p: any) => p.id === item.product_id);
      if (!prod || prod.bodega_id !== data.to_bodega_id) {
        throw new Error("Todos los productos deben pertenecer al catálogo de la bodega destino.");
      }
    }

    const result = await upsertSupplyOrderForBodega(context.supabase, {
      branchId: fromBodegaId,
      bodegaId: data.to_bodega_id,
      deliveryDate: data.delivery_date,
      orderSource: "bodega",
      notes: data.notes ?? null,
      userId: context.userId,
      items: data.items,
    });

    return result;
  });

export const cancelBodegaOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ order_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { roles, branchId, isOwner } = await getMyBranchAndRoles(
      context.supabase,
      context.userId,
    );
    await assertCanManageBodegaOrders(roles);

    const { data: order, error } = await context.supabase
      .from("branch_supply_orders")
      .select("id, branch_id, delivery_date, status")
      .eq("id", data.order_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Pedido no encontrado.");
    if (order.status !== "pending") throw new Error("Solo se pueden cancelar pedidos pendientes.");
    if (!isOwner && order.branch_id !== branchId) {
      throw new Error("No tienes permiso para cancelar este pedido.");
    }
    assertCanOrderForDelivery(order.delivery_date as string);

    const { error: uErr } = await context.supabase
      .from("branch_supply_orders")
      .update({ status: "cancelled" })
      .eq("id", data.order_id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });

export const updateBodegaOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        order_id: z.string().uuid(),
        status: z.enum(["confirmed", "delivered", "cancelled"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { roles, branchId, isOwner } = await getMyBranchAndRoles(
      context.supabase,
      context.userId,
    );
    await assertCanManageBodegaOrders(roles);

    const { data: order, error } = await context.supabase
      .from("branch_supply_orders")
      .select("id, status, bodega_id")
      .eq("id", data.order_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Pedido no encontrado.");

    if (data.status === "cancelled") {
      if (!isOwner && branchId && !(await isBodegaBranch(context.supabase, branchId))) {
        throw new Error("Solo la bodega puede cancelar pedidos desde esta vista.");
      }
    } else {
      if (!branchId || !(await isBodegaBranch(context.supabase, branchId))) {
        if (!isOwner && !roles.has("transfer_driver")) {
          throw new Error("Solo la sucursal bodega puede actualizar el estado.");
        }
      } else if (order.bodega_id !== branchId && !isOwner) {
        throw new Error("Este pedido no corresponde a tu bodega.");
      }
    }

    const current = order.status as string;
    if (data.status === "confirmed" && current !== "pending") {
      throw new Error("Solo pedidos pendientes pueden confirmarse.");
    }
    if (data.status === "delivered" && current !== "confirmed" && current !== "pending") {
      throw new Error("Solo pedidos confirmados pueden marcarse como entregados.");
    }

    const { error: uErr } = await context.supabase
      .from("branch_supply_orders")
      .update({ status: data.status })
      .eq("id", data.order_id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });

const receiptItemSchema = z.object({
  item_id: z.string().uuid(),
  received_quantity: z.number().min(0).max(100000),
});

export const setBranchReceiptStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        order_id: z.string().uuid(),
        branch_receipt_status: z.enum(["received", "incomplete"]),
        branch_receipt_note: z.string().max(500).optional().nullable(),
        items: z.array(receiptItemSchema).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { roles, branchId, isOwner } = await getMyBranchAndRoles(
      context.supabase,
      context.userId,
    );
    await assertCanManageBodegaOrders(roles);

    const { data: order, error } = await context.supabase
      .from("branch_supply_orders")
      .select("id, branch_id, status, branch_receipt_status")
      .eq("id", data.order_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Pedido no encontrado.");

    if (!isOwner && order.branch_id !== branchId) {
      throw new Error("No tienes permiso para marcar este pedido.");
    }

    if (order.status !== "delivered") {
      throw new Error("Solo puedes marcar recibo cuando la bodega ha entregado el pedido.");
    }

    if (order.branch_receipt_status) {
      throw new Error("Este pedido ya fue marcado como recibido o incompleto.");
    }

    const { data: orderItems, error: itemsErr } = await context.supabase
      .from("branch_supply_order_items")
      .select("id, quantity")
      .eq("order_id", data.order_id);
    if (itemsErr) throw new Error(itemsErr.message);

    const orderedByItem = new Map(
      (orderItems ?? []).map((i: any) => [i.id as string, Number(i.quantity)]),
    );

    if (data.branch_receipt_status === "received") {
      for (const item of orderItems ?? []) {
        const { error: uErr } = await context.supabase
          .from("branch_supply_order_items")
          .update({ received_quantity: Number(item.quantity) })
          .eq("id", item.id);
        if (uErr) throw new Error(uErr.message);
      }

      const { error: uErr } = await context.supabase
        .from("branch_supply_orders")
        .update({
          branch_receipt_status: "received",
          branch_receipt_note: null,
          correction_status: null,
          correction_delivered_at: null,
        })
        .eq("id", data.order_id);
      if (uErr) throw new Error(uErr.message);
      return { ok: true };
    }

    if (!data.items?.length) {
      throw new Error("Indica cuánto recibiste de cada producto.");
    }

    const receivedByItem = new Map(data.items.map((i) => [i.item_id, i.received_quantity]));
    if (receivedByItem.size !== orderedByItem.size) {
      throw new Error("Debes indicar la cantidad recibida de todos los productos.");
    }

    let hasShortage = false;

    for (const [itemId, ordered] of orderedByItem) {
      const received = receivedByItem.get(itemId);
      if (received === undefined) {
        throw new Error("Falta la cantidad recibida de uno o más productos.");
      }
      if (received > ordered) {
        throw new Error("La cantidad recibida no puede ser mayor a la pedida.");
      }
      if (received < ordered) hasShortage = true;

      const { error: uErr } = await context.supabase
        .from("branch_supply_order_items")
        .update({ received_quantity: received })
        .eq("id", itemId);
      if (uErr) throw new Error(uErr.message);
    }

    if (!hasShortage) {
      throw new Error("Si recibiste todo completo, marca el pedido como recibido.");
    }

    const { error: uErr } = await context.supabase
      .from("branch_supply_orders")
      .update({
        branch_receipt_status: "incomplete",
        branch_receipt_note: data.branch_receipt_note?.trim() || null,
        correction_status: "pending",
        correction_delivered_at: null,
      })
      .eq("id", data.order_id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });
