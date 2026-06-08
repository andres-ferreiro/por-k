import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function getMyBranchAndRoles(supabase: any, userId: string) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("branch_id").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const roleSet = new Set((roles ?? []).map((r: any) => r.role as string));
  return { branchId: profile?.branch_id as string | null, isOwner: roleSet.has("owner") };
}

async function resolveBranchId(
  supabase: any,
  userId: string,
  inputBranchId: string | null | undefined,
): Promise<string> {
  const { branchId, isOwner } = await getMyBranchAndRoles(supabase, userId);
  if (isOwner) {
    if (!inputBranchId) throw new Error("El propietario debe seleccionar una sucursal.");
    return inputBranchId;
  }
  if (!branchId) throw new Error("Tu cuenta no tiene sucursal asignada.");
  return branchId;
}

async function fetchDriverNames(ids: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return map;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", unique);
  for (const r of data ?? []) map.set(r.id, r.full_name);
  return map;
}

export const listRoutes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("routes")
      .select("id, branch_id, name, driver_id, is_active, branches(name), route_customers(count)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const driverNames = await fetchDriverNames((data ?? []).map((r: any) => r.driver_id).filter(Boolean));
    return (data ?? []).map((r: any) => ({
      id: r.id,
      branch_id: r.branch_id,
      branch_name: r.branches?.name ?? null,
      name: r.name,
      driver_id: r.driver_id,
      driver_name: r.driver_id ? driverNames.get(r.driver_id) ?? null : null,
      is_active: r.is_active,
      customer_count: r.route_customers?.[0]?.count ?? 0,
    }));
  });

export const getRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: route, error } = await context.supabase
      .from("routes")
      .select("id, branch_id, name, driver_id, is_active, branches(name)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!route) throw new Error("Ruta no encontrada.");

    const { data: stops, error: sErr } = await context.supabase
      .from("route_customers")
      .select("position, customers(id, name, phone, address, lat, lng, photo_url)")
      .eq("route_id", data.id)
      .order("position", { ascending: true });
    if (sErr) throw new Error(sErr.message);

    const driverNames = await fetchDriverNames(route.driver_id ? [route.driver_id] : []);

    return {
      id: route.id,
      branch_id: route.branch_id,
      branch_name: (route as any).branches?.name ?? null,
      name: route.name,
      driver_id: route.driver_id,
      driver_name: route.driver_id ? driverNames.get(route.driver_id) ?? null : null,
      is_active: route.is_active,
      stops: (stops ?? []).map((s: any) => ({ position: s.position, ...s.customers })),
    };
  });

const routeInput = z.object({
  name: z.string().trim().min(1).max(120),
  driver_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
});

export const createRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => routeInput.parse(d))
  .handler(async ({ data, context }) => {
    const branch_id = await resolveBranchId(context.supabase, context.userId, data.branch_id ?? null);
    const { data: row, error } = await context.supabase
      .from("routes")
      .insert({ branch_id, name: data.name, driver_id: data.driver_id ?? null })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).merge(routeInput.partial()).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, branch_id: _ignore, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("routes")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("routes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setRouteCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      route_id: z.string().uuid(),
      customer_ids: z.array(z.string().uuid()).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Replace pivot. Delete all then insert in order.
    const { error: delErr } = await context.supabase
      .from("route_customers")
      .delete()
      .eq("route_id", data.route_id);
    if (delErr) throw new Error(delErr.message);

    if (data.customer_ids.length > 0) {
      const rows = data.customer_ids.map((cid, i) => ({
        route_id: data.route_id,
        customer_id: cid,
        position: i,
      }));
      const { error: insErr } = await context.supabase.from("route_customers").insert(rows);
      if (insErr) throw new Error(insErr.message);
    }
    return { ok: true };
  });

export const listBranchDrivers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ branch_id: z.string().uuid().nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    // Owner: any branch. Supervisor: own branch (input ignored).
    const { branchId, isOwner } = await getMyBranchAndRoles(context.supabase, context.userId);
    const targetBranch = isOwner ? data.branch_id ?? null : branchId;
    if (!targetBranch) return [] as { id: string; full_name: string | null }[];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, user_roles!inner(role)")
      .eq("branch_id", targetBranch)
      .eq("is_active", true)
      .eq("user_roles.role", "driver");
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({ id: r.id, full_name: r.full_name }));
  });
