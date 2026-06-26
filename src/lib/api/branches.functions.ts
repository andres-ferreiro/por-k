import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function getMyRoles(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r: any) => r.role as string));
}

async function resolveSettingsBranchId(
  supabase: any,
  userId: string,
  inputBranchId: string | null | undefined,
): Promise<string> {
  const roles = await getMyRoles(supabase, userId);
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("branch_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (roles.has("owner")) {
    const branchId = inputBranchId ?? profile?.branch_id ?? null;
    if (!branchId) throw new Error("Selecciona una sucursal para ver esta configuración.");
    return branchId as string;
  }
  if (roles.has("supervisor")) {
    if (!profile?.branch_id) throw new Error("Tu cuenta no tiene sucursal asignada.");
    return profile.branch_id as string;
  }
  throw new Error("No tienes permiso para cambiar esta configuración.");
}

async function assertCanManageDispatchGate(supabase: any, userId: string, branchId: string) {
  const roles = await getMyRoles(supabase, userId);
  if (roles.has("owner")) return;
  if (roles.has("supervisor")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("branch_id")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.branch_id === branchId) return;
  }
  throw new Error("No tienes permiso para cambiar esta configuración.");
}

export const listBranches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("branches")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const branchInput = z.object({
  name: z.string().min(1).max(120),
  address: z.string().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  is_active: z.boolean().optional(),
});

export const createBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => branchInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("branches")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).merge(branchInput.partial()).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("branches")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getBranchDispatchGate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ branch_id: z.string().uuid().optional().nullable() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const branchId = await resolveSettingsBranchId(context.supabase, context.userId, data.branch_id);
    const { data: row, error } = await context.supabase
      .from("branches")
      .select("id, name, require_dispatch_before_route")
      .eq("id", branchId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Sucursal no encontrada.");
    return {
      branch_id: row.id as string,
      branch_name: row.name as string,
      require_dispatch_before_route: Boolean(row.require_dispatch_before_route),
    };
  });

export const setBranchRequireDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        branch_id: z.string().uuid().optional().nullable(),
        require_dispatch_before_route: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const branchId = await resolveSettingsBranchId(context.supabase, context.userId, data.branch_id);
    await assertCanManageDispatchGate(context.supabase, context.userId, branchId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("branches")
      .update({ require_dispatch_before_route: data.require_dispatch_before_route })
      .eq("id", branchId)
      .select("id, name, require_dispatch_before_route")
      .single();
    if (error) throw new Error(error.message);
    return {
      branch_id: row.id as string,
      branch_name: row.name as string,
      require_dispatch_before_route: Boolean(row.require_dispatch_before_route),
    };
  });

export const getBranchLocationGate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ branch_id: z.string().uuid().optional().nullable() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const branchId = await resolveSettingsBranchId(context.supabase, context.userId, data.branch_id);
    const { data: row, error } = await context.supabase
      .from("branches")
      .select("id, name, driver_location_enabled")
      .eq("id", branchId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Sucursal no encontrada.");
    return {
      branch_id: row.id as string,
      branch_name: row.name as string,
      driver_location_enabled: Boolean(row.driver_location_enabled),
    };
  });

export const setBranchLocationEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        branch_id: z.string().uuid().optional().nullable(),
        driver_location_enabled: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const branchId = await resolveSettingsBranchId(context.supabase, context.userId, data.branch_id);
    await assertCanManageDispatchGate(context.supabase, context.userId, branchId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("branches")
      .update({ driver_location_enabled: data.driver_location_enabled })
      .eq("id", branchId)
      .select("id, name, driver_location_enabled")
      .single();
    if (error) throw new Error(error.message);
    return {
      branch_id: row.id as string,
      branch_name: row.name as string,
      driver_location_enabled: Boolean(row.driver_location_enabled),
    };
  });

async function assertOwnerOnly(supabase: any, userId: string) {
  const roles = await getMyRoles(supabase, userId);
  if (!roles.has("owner")) throw new Error("Solo el propietario puede cambiar esta configuración.");
}

async function fetchPreorderRouteById(supabase: any, routeId: string) {
  const { data: route, error } = await supabase
    .from("routes")
    .select("id, name, driver_id, profiles:driver_id(full_name)")
    .eq("id", routeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!route) return null;
  return {
    id: route.id as string,
    name: route.name as string,
    driver_id: (route.driver_id as string | null) ?? null,
    driver_name: (route as any).profiles?.full_name ?? null,
  };
}

export const getBranchPreorderConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ branch_id: z.string().uuid().optional().nullable() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const branchId = await resolveSettingsBranchId(context.supabase, context.userId, data.branch_id);
    const { data: row, error } = await context.supabase
      .from("branches")
      .select("id, name, preorder_enabled, preorder_route_id")
      .eq("id", branchId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Sucursal no encontrada.");
    const preorderRoute = row.preorder_route_id
      ? await fetchPreorderRouteById(context.supabase, row.preorder_route_id as string)
      : null;
    return {
      branch_id: row.id as string,
      branch_name: row.name as string,
      preorder_enabled: Boolean(row.preorder_enabled),
      preorder_route_id: (row.preorder_route_id as string | null) ?? null,
      preorder_route: preorderRoute,
    };
  });

export const setBranchPreorderEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      branch_id: z.string().uuid().optional().nullable(),
      preorder_enabled: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const branchId = await resolveSettingsBranchId(context.supabase, context.userId, data.branch_id);
    await assertOwnerOnly(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.preorder_enabled) {
      const { data: branch, error: bErr } = await supabaseAdmin
        .from("branches")
        .select("id, name, preorder_route_id")
        .eq("id", branchId)
        .single();
      if (bErr) throw new Error(bErr.message);

      let routeId = branch.preorder_route_id as string | null;
      if (!routeId) {
        const { data: route, error: rErr } = await supabaseAdmin
          .from("routes")
          .insert({
            branch_id: branchId,
            name: "Pedidos Hoteles/Restaurantes",
            route_mode: "preorder",
            is_active: true,
          })
          .select("id")
          .single();
        if (rErr) throw new Error(rErr.message);
        routeId = route.id as string;
      } else {
        await supabaseAdmin.from("routes").update({ route_mode: "preorder" }).eq("id", routeId);
      }

      const { data: row, error } = await supabaseAdmin
        .from("branches")
        .update({ preorder_enabled: true, preorder_route_id: routeId })
        .eq("id", branchId)
        .select("id, name, preorder_enabled, preorder_route_id")
        .single();
      if (error) throw new Error(error.message);
      const preorderRoute = await fetchPreorderRouteById(
        supabaseAdmin,
        row.preorder_route_id as string,
      );
      return {
        branch_id: row.id as string,
        branch_name: row.name as string,
        preorder_enabled: true,
        preorder_route_id: row.preorder_route_id as string,
        preorder_route: preorderRoute,
      };
    }

    const { data: row, error } = await supabaseAdmin
      .from("branches")
      .update({ preorder_enabled: false })
      .eq("id", branchId)
      .select("id, name, preorder_enabled, preorder_route_id")
      .single();
    if (error) throw new Error(error.message);
    return {
      branch_id: row.id as string,
      branch_name: row.name as string,
      preorder_enabled: false,
      preorder_route_id: (row.preorder_route_id as string | null) ?? null,
      preorder_route: null,
    };
  });

export const isBranchPreorderEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ branch_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("branches")
      .select("preorder_enabled")
      .eq("id", data.branch_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { preorder_enabled: Boolean(row?.preorder_enabled) };
  });

export const setBodegaFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      branch_id: z.string().uuid(),
      is_bodega: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOnly(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("branches")
      .update({ is_bodega: data.is_bodega })
      .eq("id", data.branch_id)
      .select("id, name, is_bodega, bodega_display_name")
      .single();
    if (error) throw new Error(error.message);
    return {
      branch_id: row.id as string,
      branch_name: row.name as string,
      is_bodega: Boolean(row.is_bodega),
    };
  });

export const setBodegaDisplayName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      branch_id: z.string().uuid(),
      bodega_display_name: z.string().max(120).nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOnly(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("branches")
      .update({ bodega_display_name: data.bodega_display_name?.trim() || null })
      .eq("id", data.branch_id)
      .eq("is_bodega", true)
      .select("id, bodega_display_name")
      .single();
    if (error) throw new Error(error.message);
    return { branch_id: row.id as string, bodega_display_name: row.bodega_display_name as string | null };
  });

export const getBranchBodegaFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ branch_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("branches")
      .select("id, name, is_bodega")
      .eq("id", data.branch_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Sucursal no encontrada.");
    return {
      branch_id: row.id as string,
      branch_name: row.name as string,
      is_bodega: Boolean(row.is_bodega),
    };
  });
