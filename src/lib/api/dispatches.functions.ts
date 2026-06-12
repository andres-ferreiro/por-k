import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { todayInTZ, tzDayRange } from "@/lib/tz";

async function resolveBranchId(
  supabase: any,
  userId: string,
  override?: string | null,
): Promise<string | null> {
  if (override) return override;
  const { data, error } = await supabase
    .from("profiles")
    .select("branch_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.branch_id as string | null) ?? null;
}

async function fetchProfileNames(ids: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return map;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", unique);
  for (const r of data ?? []) map.set(r.id, r.full_name);
  return map;
}

export const listRoutesForDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ branch_id: z.string().uuid().optional().nullable() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const branchId = await resolveBranchId(context.supabase, context.userId, data.branch_id);
    let q = context.supabase
      .from("routes")
      .select("id, name, driver_id, branch_id")
      .eq("is_active", true)
      .order("name");
    if (branchId) q = q.eq("branch_id", branchId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const names = await fetchProfileNames((rows ?? []).map((r: any) => r.driver_id).filter(Boolean));
    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      name: r.name as string,
      branch_id: r.branch_id as string,
      driver_id: (r.driver_id as string | null) ?? null,
      driver_name: r.driver_id ? names.get(r.driver_id) ?? null : null,
    }));
  });

export const listProductsActive = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("products")
      .select("id, name, unit")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; name: string; unit: string }[];
  });

const itemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().positive().max(1_000_000),
});

const createDispatchSchema = z.object({
  route_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  notes: z.string().trim().max(500).optional().nullable(),
  items: z.array(itemSchema).min(1).max(50),
});

export const createDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const parsed = createDispatchSchema.parse(d);
    const ids = parsed.items.map((i) => i.product_id);
    if (new Set(ids).size !== ids.length) throw new Error("No repitas productos en las líneas.");
    return parsed;
  })
  .handler(async ({ data, context }) => {
    const { data: route, error: rErr } = await context.supabase
      .from("routes")
      .select("id, branch_id")
      .eq("id", data.route_id)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!route) throw new Error("Ruta inválida.");

    const userBranchId = await resolveBranchId(context.supabase, context.userId, null);
    if (userBranchId && route.branch_id !== userBranchId) {
      throw new Error("Ruta inválida.");
    }

    const branchId = route.branch_id as string;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: driverProfile }, { data: driverRoles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, branch_id, is_active").eq("id", data.driver_id).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", data.driver_id).eq("role", "driver"),
    ]);
    if (!driverProfile || driverProfile.branch_id !== branchId || !driverProfile.is_active) {
      throw new Error("Repartidor inválido para esta sucursal.");
    }
    if (!driverRoles || driverRoles.length === 0) {
      throw new Error("El usuario seleccionado no es repartidor.");
    }

    const { data: inserted, error: insErr } = await context.supabase
      .from("dispatches")
      .insert({
        branch_id: branchId,
        route_id: data.route_id,
        driver_id: data.driver_id,
        dispatched_by: context.userId,
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    const dispatchId = inserted.id as string;
    const rows = data.items.map((i) => ({
      dispatch_id: dispatchId,
      product_id: i.product_id,
      quantity: i.quantity,
    }));
    const { error: itemsErr } = await context.supabase.from("dispatch_items").insert(rows);
    if (itemsErr) {
      await context.supabase.from("dispatches").delete().eq("id", dispatchId);
      throw new Error(itemsErr.message);
    }
    return { id: dispatchId };
  });

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
  .optional()
  .nullable();

export const listDispatchesToday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ date: dateOnly, branch_id: z.string().uuid().optional().nullable() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const branchId = await resolveBranchId(context.supabase, context.userId, data.branch_id);
    const dateStr = data.date ?? todayInTZ();
    const { startISO, endISO } = tzDayRange(dateStr);

    let q = context.supabase
      .from("dispatches")
      .select("id, dispatched_at, route_id, driver_id, dispatched_by, notes, routes(name), dispatch_items(quantity)")
      .gte("dispatched_at", startISO)
      .lt("dispatched_at", endISO)
      .order("dispatched_at", { ascending: false });
    if (branchId) q = q.eq("branch_id", branchId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = [
      ...(rows ?? []).map((r: any) => r.driver_id),
      ...(rows ?? []).map((r: any) => r.dispatched_by),
    ];
    const names = await fetchProfileNames(ids);

    return (rows ?? []).map((r: any) => {
      const items = (r.dispatch_items ?? []) as { quantity: number }[];
      const totalUnits = items.reduce((acc, it) => acc + Number(it.quantity ?? 0), 0);
      return {
        id: r.id as string,
        dispatched_at: r.dispatched_at as string,
        route_id: r.route_id as string,
        route_name: r.routes?.name ?? null,
        driver_id: r.driver_id as string,
        driver_name: names.get(r.driver_id) ?? null,
        dispatched_by_name: names.get(r.dispatched_by) ?? null,
        notes: (r.notes as string | null) ?? null,
        line_count: items.length,
        total_units: totalUnits,
      };
    });
  });

export const getDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: header, error } = await context.supabase
      .from("dispatches")
      .select("id, dispatched_at, route_id, driver_id, dispatched_by, notes, routes(name)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!header) throw new Error("Despacho no encontrado.");

    const { data: items, error: itErr } = await context.supabase
      .from("dispatch_items")
      .select("id, quantity, product_id, products(name, unit)")
      .eq("dispatch_id", data.id);
    if (itErr) throw new Error(itErr.message);

    const names = await fetchProfileNames([header.driver_id, header.dispatched_by]);

    return {
      id: header.id as string,
      dispatched_at: header.dispatched_at as string,
      route_id: header.route_id as string,
      route_name: (header as any).routes?.name ?? null,
      driver_id: header.driver_id as string,
      driver_name: names.get(header.driver_id) ?? null,
      dispatched_by_name: names.get(header.dispatched_by) ?? null,
      notes: (header.notes as string | null) ?? null,
      items: (items ?? []).map((i: any) => ({
        id: i.id as string,
        product_id: i.product_id as string,
        product_name: i.products?.name ?? null,
        unit: i.products?.unit ?? null,
        quantity: Number(i.quantity),
      })),
    };
  });

const truckReturnItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().min(0).max(1_000_000),
});

export const getTruckReturnForDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ dispatch_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("truck_returns")
      .select("id, product_id, quantity, notes, returned_at, products(name, unit)")
      .eq("dispatch_id", data.dispatch_id);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      product_id: r.product_id as string,
      product_name: r.products?.name ?? null,
      unit: r.products?.unit ?? null,
      quantity: Number(r.quantity),
      notes: (r.notes as string | null) ?? null,
      returned_at: r.returned_at as string,
    }));
  });

export const registerTruckReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const parsed = z
      .object({
        dispatch_id: z.string().uuid(),
        notes: z.string().trim().max(500).optional().nullable(),
        items: z.array(truckReturnItemSchema).min(1).max(50),
      })
      .parse(d);
    const ids = parsed.items.map((i) => i.product_id);
    if (new Set(ids).size !== ids.length) throw new Error("No repitas productos en las líneas.");
    return parsed;
  })
  .handler(async ({ data, context }) => {
    const { data: dispatch, error: dErr } = await context.supabase
      .from("dispatches")
      .select("id, branch_id")
      .eq("id", data.dispatch_id)
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!dispatch) throw new Error("Despacho no encontrado.");

    const userBranchId = await resolveBranchId(context.supabase, context.userId, null);
    if (userBranchId && dispatch.branch_id !== userBranchId) {
      throw new Error("Despacho inválido.");
    }

    const { data: dispatchItems, error: diErr } = await context.supabase
      .from("dispatch_items")
      .select("product_id")
      .eq("dispatch_id", data.dispatch_id);
    if (diErr) throw new Error(diErr.message);
    const allowed = new Set((dispatchItems ?? []).map((i: any) => i.product_id as string));

    for (const item of data.items) {
      if (!allowed.has(item.product_id)) {
        throw new Error("Solo puedes registrar devolución de productos despachados.");
      }
    }

    const rows = data.items
      .filter((i) => i.quantity > 0)
      .map((i) => ({
        dispatch_id: data.dispatch_id,
        product_id: i.product_id,
        quantity: i.quantity,
        returned_by: context.userId,
        notes: data.notes ?? null,
        returned_at: new Date().toISOString(),
      }));

    const zeroIds = data.items.filter((i) => i.quantity === 0).map((i) => i.product_id);

    if (rows.length === 0) {
      const { error: delErr } = await context.supabase
        .from("truck_returns")
        .delete()
        .eq("dispatch_id", data.dispatch_id);
      if (delErr) throw new Error(delErr.message);
      return { ok: true };
    }

    const { error: upsErr } = await context.supabase
      .from("truck_returns")
      .upsert(rows, { onConflict: "dispatch_id,product_id" });
    if (upsErr) throw new Error(upsErr.message);

    if (zeroIds.length > 0) {
      const { error: delZeroErr } = await context.supabase
        .from("truck_returns")
        .delete()
        .eq("dispatch_id", data.dispatch_id)
        .in("product_id", zeroIds);
      if (delZeroErr) throw new Error(delZeroErr.message);
    }

    return { ok: true };
  });

export const getTruckReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ date: dateOnly, branch_id: z.string().uuid().optional().nullable() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const branchId = await resolveBranchId(context.supabase, context.userId, data.branch_id);
    const dateStr = data.date ?? todayInTZ();
    const { startISO, endISO } = tzDayRange(dateStr);

    let dq = context.supabase
      .from("dispatches")
      .select("id, route_id, driver_id, branch_id, routes(name), dispatch_items(product_id, quantity, products(name, unit))")
      .gte("dispatched_at", startISO)
      .lt("dispatched_at", endISO);
    if (branchId) dq = dq.eq("branch_id", branchId);
    const { data: dispatches, error: dErr } = await dq;
    if (dErr) throw new Error(dErr.message);

    const dispatchIds = (dispatches ?? []).map((d: any) => d.id as string);
    let truckReturns: any[] = [];
    if (dispatchIds.length > 0) {
      const { data: tr, error: trErr } = await context.supabase
        .from("truck_returns")
        .select("dispatch_id, product_id, quantity, products(name, unit)")
        .in("dispatch_id", dispatchIds);
      if (trErr) throw new Error(trErr.message);
      truckReturns = tr ?? [];
    }

    let delQ = context.supabase
      .from("deliveries")
      .select("id, route_id, driver_id, branch_id, delivery_items(product_id, quantity, products(name, unit)), delivery_returns(product_id, quantity, products(name, unit))")
      .eq("delivery_date", dateStr);
    if (branchId) delQ = delQ.eq("branch_id", branchId);
    const { data: deliveries, error: delErr } = await delQ;
    if (delErr) throw new Error(delErr.message);

    type ProductAgg = {
      product_id: string;
      product_name: string | null;
      unit: string | null;
      dispatched: number;
      sold: number;
      customer_returns: number;
      actual_returned: number;
    };
    type Group = {
      key: string;
      route_id: string;
      route_name: string | null;
      driver_id: string;
      driver_name: string | null;
      products: Map<string, ProductAgg>;
    };

    const groups = new Map<string, Group>();
    const keyOf = (route_id: string, driver_id: string) => `${route_id}::${driver_id}`;
    const getGroup = (route_id: string, driver_id: string, route_name: string | null): Group => {
      const k = keyOf(route_id, driver_id);
      let g = groups.get(k);
      if (!g) {
        g = { key: k, route_id, route_name, driver_id, driver_name: null, products: new Map() };
        groups.set(k, g);
      } else if (!g.route_name && route_name) {
        g.route_name = route_name;
      }
      return g;
    };
    const getProd = (g: Group, product_id: string, name: string | null, unit: string | null) => {
      let p = g.products.get(product_id);
      if (!p) {
        p = {
          product_id,
          product_name: name,
          unit,
          dispatched: 0,
          sold: 0,
          customer_returns: 0,
          actual_returned: 0,
        };
        g.products.set(product_id, p);
      } else {
        if (!p.product_name && name) p.product_name = name;
        if (!p.unit && unit) p.unit = unit;
      }
      return p;
    };

    const dispatchMeta = new Map<string, { route_id: string; driver_id: string; route_name: string | null }>();
    for (const d of dispatches ?? []) {
      dispatchMeta.set(d.id as string, {
        route_id: d.route_id as string,
        driver_id: d.driver_id as string,
        route_name: (d as any).routes?.name ?? null,
      });
      const g = getGroup(d.route_id as string, d.driver_id as string, (d as any).routes?.name ?? null);
      for (const it of (d as any).dispatch_items ?? []) {
        const p = getProd(g, it.product_id, it.products?.name ?? null, it.products?.unit ?? null);
        p.dispatched += Number(it.quantity ?? 0);
      }
    }

    for (const tr of truckReturns) {
      const meta = dispatchMeta.get(tr.dispatch_id as string);
      if (!meta) continue;
      const g = getGroup(meta.route_id, meta.driver_id, meta.route_name);
      const p = getProd(g, tr.product_id, tr.products?.name ?? null, tr.products?.unit ?? null);
      p.actual_returned += Number(tr.quantity ?? 0);
    }

    for (const del of deliveries ?? []) {
      const g = getGroup(del.route_id as string, del.driver_id as string, null);
      for (const it of (del as any).delivery_items ?? []) {
        const p = getProd(g, it.product_id, it.products?.name ?? null, it.products?.unit ?? null);
        p.sold += Number(it.quantity ?? 0);
      }
      for (const it of (del as any).delivery_returns ?? []) {
        const p = getProd(g, it.product_id, it.products?.name ?? null, it.products?.unit ?? null);
        p.customer_returns += Number(it.quantity ?? 0);
      }
    }

    const allDriverIds = Array.from(groups.values()).map((g) => g.driver_id);
    const names = await fetchProfileNames(allDriverIds);
    for (const g of groups.values()) {
      g.driver_name = names.get(g.driver_id) ?? null;
    }

    return Array.from(groups.values()).map((g) => {
      const products = Array.from(g.products.values()).map((p) => ({
        ...p,
        on_truck: p.dispatched - p.sold + p.customer_returns,
        difference: p.dispatched - p.sold + p.customer_returns - p.actual_returned,
      }));
      products.sort((a, b) => (a.product_name ?? "").localeCompare(b.product_name ?? ""));
      const totals = products.reduce(
        (acc, p) => ({
          dispatched: acc.dispatched + p.dispatched,
          sold: acc.sold + p.sold,
          customer_returns: acc.customer_returns + p.customer_returns,
          actual_returned: acc.actual_returned + p.actual_returned,
          on_truck: acc.on_truck + p.on_truck,
          difference: acc.difference + p.difference,
        }),
        { dispatched: 0, sold: 0, customer_returns: 0, actual_returned: 0, on_truck: 0, difference: 0 },
      );
      return {
        key: g.key,
        route_id: g.route_id,
        route_name: g.route_name,
        driver_id: g.driver_id,
        driver_name: g.driver_name,
        products,
        totals,
      };
    }).sort((a, b) => (a.route_name ?? "").localeCompare(b.route_name ?? ""));
  });
