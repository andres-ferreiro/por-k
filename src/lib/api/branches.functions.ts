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
