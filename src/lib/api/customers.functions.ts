import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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
    if (!inputBranchId) throw new Error("El propietario debe seleccionar una sucursal.");
    return inputBranchId;
  }
  if (!branchId) throw new Error("Tu cuenta no tiene sucursal asignada.");
  return branchId;
}

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("customers")
      .select("id, branch_id, name, phone, address, lat, lng, photo_url, notes, is_active, pending_balance, category, created_at, import_batch_id, import_position, branches(name)")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((c: any) => ({ ...c, branch_name: c.branches?.name ?? null }));
  });

export const listCustomerImportBatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ branch_id: z.string().uuid().nullable().optional(), limit: z.number().int().min(1).max(50).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const branch_id = await resolveBranchId(context.supabase, context.userId, data.branch_id ?? null);
    const { data: batches, error } = await context.supabase
      .from("customer_import_batches")
      .select("id, label, created_at, customers(count)")
      .eq("branch_id", branch_id)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 20);
    if (error) throw new Error(error.message);
    return (batches ?? []).map((b: any) => ({
      id: b.id,
      label: b.label,
      created_at: b.created_at,
      customer_count: b.customers?.[0]?.count ?? 0,
    }));
  });

const customerCategoryEnum = z.enum(["retail", "hotel", "restaurant"]);

const customerInput = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().max(255).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  photo_url: z.string().max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  category: customerCategoryEnum.optional(),
});

async function validateCustomerCategory(
  supabase: any,
  branchId: string,
  category: string,
) {
  if (category === "retail") return;
  const { data: branch, error } = await supabase
    .from("branches")
    .select("preorder_enabled")
    .eq("id", branchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!branch?.preorder_enabled) {
    throw new Error("Esta sucursal no tiene ruta de pedidos activada para clientes hotel/restaurante.");
  }
}

export const createCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => customerInput.parse(d))
  .handler(async ({ data, context }) => {
    const branch_id = await resolveBranchId(context.supabase, context.userId, data.branch_id ?? null);
    const category = data.category ?? "retail";
    await validateCustomerCategory(context.supabase, branch_id, category);
    const { data: row, error } = await context.supabase
      .from("customers")
      .insert({
        branch_id,
        name: data.name,
        phone: data.phone ?? null,
        address: data.address ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        photo_url: data.photo_url ?? null,
        notes: data.notes ?? null,
        category,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const bulkCustomerRow = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().max(255).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const bulkCreateCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      branch_id: z.string().uuid().nullable().optional(),
      import_label: z.string().max(200).nullable().optional(),
      customers: z.array(bulkCustomerRow).min(1).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const branch_id = await resolveBranchId(context.supabase, context.userId, data.branch_id ?? null);

    const { data: batch, error: batchErr } = await context.supabase
      .from("customer_import_batches")
      .insert({
        branch_id,
        label: data.import_label ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (batchErr || !batch) throw new Error(batchErr?.message ?? "No se pudo registrar la importación.");

    const rows = data.customers.map((c, i) => ({
      branch_id,
      import_batch_id: batch.id,
      import_position: i,
      name: c.name,
      phone: c.phone ?? null,
      address: c.address ?? null,
      lat: c.lat ?? null,
      lng: c.lng ?? null,
      notes: c.notes ?? null,
    }));
    const { data: inserted, error } = await context.supabase
      .from("customers")
      .insert(rows)
      .select("id");
    if (error) throw new Error(error.message);
    return {
      count: inserted?.length ?? 0,
      batch_id: batch.id,
      customer_ids: (inserted ?? []).map((r: { id: string }) => r.id),
    };
  });

export const updateCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).merge(customerInput.partial()).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, branch_id: _ignore, category, ...patch } = data;
    if (category) {
      const { data: cust } = await context.supabase
        .from("customers")
        .select("branch_id")
        .eq("id", id)
        .maybeSingle();
      if (cust?.branch_id) {
        await validateCustomerCategory(context.supabase, cust.branch_id as string, category);
      }
    }
    const { data: row, error } = await context.supabase
      .from("customers")
      .update({ ...patch, ...(category ? { category } : {}) })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Try to remove photo (best-effort).
    const { data: cust } = await context.supabase
      .from("customers")
      .select("photo_url")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase.from("customers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (cust?.photo_url) {
      await context.supabase.storage.from("customer-photos").remove([cust.photo_url]).catch(() => {});
    }
    return { ok: true };
  });

// Explicitly marks a customer's accumulated pending balance as settled.
// Sets pending_balance = 0 and marks all carried-over pending payments as paid
// so the carry-over RPC never picks them up again.
export const markPendingBalancePaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ customer_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Owner or supervisor only
    const { data: roles, error: rolesErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["owner", "supervisor"]);
    if (rolesErr) throw new Error(rolesErr.message);
    if (!roles || roles.length === 0) {
      throw new Error("Solo el propietario o supervisor puede saldar un saldo pendiente.");
    }

    // Verify the customer exists and is accessible
    const { data: customer, error: cErr } = await context.supabase
      .from("customers")
      .select("id, pending_balance")
      .eq("id", data.customer_id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!customer) throw new Error("Cliente no encontrado.");

    if (Number(customer.pending_balance) === 0) {
      return { ok: true, cleared: 0 };
    }

    const clearedAmount = Number(customer.pending_balance);

    // Supervisors only have SELECT on payments (no UPDATE policy), so use
    // supabaseAdmin for the payments UPDATE. Owner has full access, but this
    // path is safe for both since auth is already verified above.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: payErr } = await supabaseAdmin
      .from("payments")
      .update({ status: "paid" })
      .eq("customer_id", data.customer_id)
      .eq("status", "pending")
      .eq("carried_over", true);
    if (payErr) throw new Error(payErr.message);

    // Zero out the pending balance
    const { error: balErr } = await supabaseAdmin
      .from("customers")
      .update({ pending_balance: 0 })
      .eq("id", data.customer_id);
    if (balErr) throw new Error(balErr.message);

    return { ok: true, cleared: clearedAmount };
  });

// Returns a signed upload URL the client can PUT to, plus the future public path.
export const getCustomerPhotoUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      branch_id: z.string().uuid().nullable().optional(),
      filename: z.string().min(1).max(120),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const branch_id = await resolveBranchId(context.supabase, context.userId, data.branch_id ?? null);
    const ext = (data.filename.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${branch_id}/${crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await context.supabase.storage
      .from("customer-photos")
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "No se pudo crear URL de carga.");
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

// Returns short-lived signed URLs so authorized members can view photos in the UI.
export const getCustomerPhotoViewUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ paths: z.array(z.string().min(1).max(500)).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.paths.length === 0) return {} as Record<string, string>;
    const { data: signed, error } = await context.supabase.storage
      .from("customer-photos")
      .createSignedUrls(data.paths, 3600);
    if (error) throw new Error(error.message);
    const map: Record<string, string> = {};
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
    }
    return map;
  });
