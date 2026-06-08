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
      .select("id, branch_id, name, phone, address, lat, lng, photo_url, notes, is_active, branches(name)")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((c: any) => ({ ...c, branch_name: c.branches?.name ?? null }));
  });

const customerInput = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().max(255).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  photo_url: z.string().max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
});

export const createCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => customerInput.parse(d))
  .handler(async ({ data, context }) => {
    const branch_id = await resolveBranchId(context.supabase, context.userId, data.branch_id ?? null);
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
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).merge(customerInput.partial()).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, branch_id: _ignore, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("customers")
      .update(patch)
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
      const marker = "/customer-photos/";
      const idx = cust.photo_url.indexOf(marker);
      if (idx >= 0) {
        const path = cust.photo_url.slice(idx + marker.length).split("?")[0];
        await context.supabase.storage.from("customer-photos").remove([path]).catch(() => {});
      }
    }
    return { ok: true };
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
