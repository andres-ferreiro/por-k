import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function getMyBranch(supabase: any, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("branch_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.branch_id) throw new Error("Tu cuenta no tiene sucursal asignada.");
  return data.branch_id as string;
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

export const listRoutesForDispatch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const branchId = await getMyBranch(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("routes")
      .select("id, name, driver_id")
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .order("name");
    if (error) throw new Error(error.message);
    const names = await fetchProfileNames((data ?? []).map((r: any) => r.driver_id).filter(Boolean));
    return (data ?? []).map((r: any) => ({
      id: r.id as string,
      name: r.name as string,
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
      .order("name");
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
    const branchId = await getMyBranch(context.supabase, context.userId);

    // Verify route belongs to branch
    const { data: route, error: rErr } = await context.supabase
      .from("routes")
      .select("id, branch_id")
      .eq("id", data.route_id)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!route || route.branch_id !== branchId) throw new Error("Ruta inválida.");

    // Verify driver has the driver role and same branch
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
      // rollback header
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
  .inputValidator((d: unknown) => z.object({ date: dateOnly }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const branchId = await getMyBranch(context.supabase, context.userId);
    const dateStr = data.date ?? todayInTZ();
    const { startISO, endISO } = tzDayRange(dateStr);

    const { data: rows, error } = await context.supabase
      .from("dispatches")
      .select("id, dispatched_at, route_id, driver_id, dispatched_by, notes, routes(name), dispatch_items(quantity)")
      .eq("branch_id", branchId)
      .gte("dispatched_at", startISO)
      .lt("dispatched_at", endISO)
      .order("dispatched_at", { ascending: false });
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
