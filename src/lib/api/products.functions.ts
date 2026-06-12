import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("products")
      .select("*")
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
      .insert({ ...data, display_order })
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
