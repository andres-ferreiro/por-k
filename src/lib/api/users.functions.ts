import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const roleEnum = z.enum(["owner", "supervisor", "cashier", "driver", "transfer_driver"]);

async function requireOwner(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "owner")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Solo el propietario puede realizar esta acción.");
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, phone, branch_id, is_active, created_at, branches(name)")
      .order("created_at", { ascending: false });
    if (pErr) throw new Error(pErr.message);

    const { data: roles, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rErr) throw new Error(rErr.message);

    const rolesByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    }

    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const emailById = new Map<string, string>();
    for (const u of authUsers?.users ?? []) {
      if (u.email) emailById.set(u.id, u.email);
    }

    return (profiles ?? []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      phone: p.phone,
      branch_id: p.branch_id,
      branch_name: p.branches?.name ?? null,
      is_active: p.is_active,
      email: emailById.get(p.id) ?? null,
      roles: rolesByUser.get(p.id) ?? [],
    }));
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      email: z.string().email(),
      password: z.string().min(6).max(72),
      full_name: z.string().min(1).max(120),
      phone: z.string().max(50).optional().nullable(),
      role: roleEnum,
      branch_id: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (cErr || !created.user) throw new Error(cErr?.message ?? "No se pudo crear el usuario");

    const userId = created.user.id;

    // Profile is auto-created by trigger; update branch + phone
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.full_name,
        phone: data.phone ?? null,
        branch_id: data.branch_id ?? null,
      })
      .eq("id", userId);
    if (pErr) throw new Error(pErr.message);

    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role });
    if (rErr) throw new Error(rErr.message);

    return { id: userId };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      password: z.string().min(6).max(72),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      full_name: z.string().min(1).max(120).optional(),
      phone: z.string().max(50).nullable().optional(),
      branch_id: z.string().uuid().nullable().optional(),
      is_active: z.boolean().optional(),
      role: roleEnum.optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, role, ...patch } = data;

    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    }

    if (role) {
      const { error: delErr } = await supabaseAdmin.from("user_roles").delete().eq("user_id", id);
      if (delErr) throw new Error(delErr.message);
      const { error: insErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: id, role });
      if (insErr) throw new Error(insErr.message);
    }

    return { ok: true };
  });
