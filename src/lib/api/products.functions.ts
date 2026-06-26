import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("products")
      .select("*")
      .eq("is_bodega_supply", false)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const setProductOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ product_ids: z.array(z.string().uuid()).min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const updates = data.product_ids.map((id, i) =>
      context.supabase.from("products").update({ display_order: i }).eq("id", id),
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
    return { ok: true };
  });

const productInput = z.object({
  name: z.string().min(1).max(120),
  unit: z.string().min(1).max(40),
  price: z.number().min(0).max(10_000_000).optional(),
  is_active: z.boolean().optional(),
  allow_returns: z.boolean().optional(),
});

export const createProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => productInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: last } = await context.supabase
      .from("products")
      .select("display_order")
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const display_order = (last?.display_order ?? -1) + 1;
    const { data: row, error } = await context.supabase
      .from("products")
      .insert({ ...data, display_order, is_bodega_supply: false })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).merge(productInput.partial()).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("products")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ============ CUSTOMER PRICES ============

export const listProductCustomerPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ product_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: customers, error: cErr } = await supabase
      .from("customers")
      .select("id, name, branch_id, branches(name)")
      .eq("is_active", true)
      .order("name");
    if (cErr) throw new Error(cErr.message);

    const { data: overrides, error: oErr } = await supabase
      .from("customer_prices")
      .select("customer_id, price")
      .eq("product_id", data.product_id);
    if (oErr) throw new Error(oErr.message);

    const map = new Map((overrides ?? []).map((o: any) => [o.customer_id, Number(o.price)]));
    return (customers ?? []).map((c: any) => ({
      customer_id: c.id as string,
      name: c.name as string,
      branch_name: c.branches?.name ?? null,
      price: map.has(c.id) ? (map.get(c.id) as number) : null,
    }));
  });

export const upsertCustomerPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      product_id: z.string().uuid(),
      customer_id: z.string().uuid(),
      price: z.number().min(0).max(10_000_000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("customer_prices")
      .upsert(
        { product_id: data.product_id, customer_id: data.customer_id, price: data.price },
        { onConflict: "customer_id,product_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCustomerPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ product_id: z.string().uuid(), customer_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("customer_prices")
      .delete()
      .eq("product_id", data.product_id)
      .eq("customer_id", data.customer_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ BODEGA SUPPLY PRODUCTS ============

const bodegaProductInput = z.object({
  name: z.string().min(1).max(120),
  unit: z.string().min(1).max(80),
  bodega_category: z.string().min(1).max(80),
  bodega_id: z.string().uuid(),
  is_active: z.boolean().optional(),
});

export const listBodegaSupplyProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ bodega_id: z.string().uuid().optional().nullable() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("products")
      .select("id, name, unit, bodega_category, is_active, created_at, bodega_id, bodega:branches!products_bodega_id_fkey(name, bodega_display_name)")
      .eq("is_bodega_supply", true)
      .order("bodega_category", { ascending: true })
      .order("name", { ascending: true });
    if (data.bodega_id) q = q.eq("bodega_id", data.bodega_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((p: any) => ({
      ...p,
      bodega_name: p.bodega?.bodega_display_name?.trim() || p.bodega?.name || null,
    }));
  });

export const createBodegaProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bodegaProductInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: bodega, error: bErr } = await context.supabase
      .from("branches")
      .select("id, is_bodega")
      .eq("id", data.bodega_id)
      .maybeSingle();
    if (bErr) throw new Error(bErr.message);
    if (!bodega?.is_bodega) throw new Error("La bodega seleccionada no es válida.");

    const { data: row, error } = await context.supabase
      .from("products")
      .insert({
        name: data.name.trim(),
        unit: data.unit.trim(),
        bodega_category: data.bodega_category.trim(),
        bodega_id: data.bodega_id,
        is_bodega_supply: true,
        is_active: data.is_active ?? true,
        price: 0,
        allow_returns: false,
        display_order: 0,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateBodegaProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).merge(bodegaProductInput.partial()).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, bodega_id, ...patch } = data;

    if (bodega_id) {
      const { data: bodega, error: bErr } = await context.supabase
        .from("branches")
        .select("id, is_bodega")
        .eq("id", bodega_id)
        .maybeSingle();
      if (bErr) throw new Error(bErr.message);
      if (!bodega?.is_bodega) throw new Error("La bodega seleccionada no es válida.");
    }

    const { data: row, error } = await context.supabase
      .from("products")
      .update({ ...patch, ...(bodega_id ? { bodega_id } : {}) })
      .eq("id", id)
      .eq("is_bodega_supply", true)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteBodegaProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: product, error: pErr } = await context.supabase
      .from("products")
      .select("id, name")
      .eq("id", data.id)
      .eq("is_bodega_supply", true)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!product) throw new Error("Producto no encontrado.");

    const { count, error: cErr } = await context.supabase
      .from("branch_supply_order_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", data.id);
    if (cErr) throw new Error(cErr.message);
    if ((count ?? 0) > 0) {
      throw new Error("No se puede eliminar: el producto aparece en pedidos de bodega existentes.");
    }

    const { error } = await context.supabase
      .from("products")
      .delete()
      .eq("id", data.id)
      .eq("is_bodega_supply", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const bulkBodegaRowSchema = z.object({
  name: z.string().min(1).max(120),
  unit: z.string().min(1).max(80),
  categoria: z.string().min(1).max(80),
});

export const bulkUpsertBodegaProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        bodega_id: z.string().uuid(),
        rows: z.array(bulkBodegaRowSchema).min(1).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let created = 0;
    let updated = 0;

    for (const row of data.rows) {
      const name = row.name.trim();
      const unit = row.unit.trim();
      const bodega_category = row.categoria.trim();

      const { data: existing } = await supabaseAdmin
        .from("products")
        .select("id")
        .eq("is_bodega_supply", true)
        .eq("bodega_id", data.bodega_id)
        .ilike("name", name)
        .ilike("bodega_category", bodega_category)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabaseAdmin
          .from("products")
          .update({ unit, is_active: true })
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
        updated++;
      } else {
        const { error } = await supabaseAdmin.from("products").insert({
          name,
          unit,
          bodega_category,
          bodega_id: data.bodega_id,
          is_bodega_supply: true,
          is_active: true,
          price: 0,
          allow_returns: false,
          display_order: 0,
        });
        if (error) throw new Error(error.message);
        created++;
      }
    }

    return { created, updated, total: data.rows.length };
  });
