import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { todayInTZ, tzDayRange } from "@/lib/tz";
import { deliveryNetTotals, deliveryPaymentAmount } from "@/lib/delivery-totals";

function todayStr(): string {
  return todayInTZ();
}

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

async function getTodayDispatchForRoute(
  supabase: any,
  routeId: string,
  driverId: string,
  today: string,
) {
  const { startISO, endISO } = tzDayRange(today);
  const { data, error } = await supabase
    .from("dispatches")
    .select("id, dispatched_at")
    .eq("route_id", routeId)
    .eq("driver_id", driverId)
    .gte("dispatched_at", startISO)
    .lt("dispatched_at", endISO)
    .order("dispatched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; dispatched_at: string } | null;
}

async function requireTodayDispatch(
  supabase: any,
  routeId: string,
  driverId: string,
  today: string,
) {
  const dispatch = await getTodayDispatchForRoute(supabase, routeId, driverId, today);
  if (!dispatch) {
    throw new Error("Tu ruta aún no está habilitada. Espera a que registren el despacho del día.");
  }
  return dispatch;
}

async function branchRequiresDispatch(supabase: any, branchId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("branches")
    .select("require_dispatch_before_route")
    .eq("id", branchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.require_dispatch_before_route ?? true;
}

async function branchDriverLocationEnabled(supabase: any, branchId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("branches")
    .select("driver_location_enabled")
    .eq("id", branchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.driver_location_enabled ?? false;
}

async function requireTodayDispatchIfEnabled(
  supabase: any,
  routeId: string,
  driverId: string,
  branchId: string,
  today: string,
) {
  const required = await branchRequiresDispatch(supabase, branchId);
  if (!required) return null;
  return requireTodayDispatch(supabase, routeId, driverId, today);
}

// ============ MY ROUTE ============

export const getMyRouteToday = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const today = todayStr();

    // Pick the active route assigned to this driver (most recently updated)
    const { data: routes, error: rErr } = await supabase
      .from("routes")
      .select("id, name, branch_id, branches(name)")
      .eq("driver_id", userId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (rErr) throw new Error(rErr.message);
    const route = (routes ?? [])[0] as any;
    if (!route) {
      return { route: null, customers: [], date: today, dispatch: null, require_dispatch: true, can_work: false };
    }

    const dispatch = await getTodayDispatchForRoute(supabase, route.id, userId, today);
    const requireDispatch = await branchRequiresDispatch(supabase, route.branch_id as string);
    const driverLocationEnabled = await branchDriverLocationEnabled(supabase, route.branch_id as string);

    const { data: rc, error: rcErr } = await supabase
      .from("route_customers")
      .select("position, customer_id, customers(id, name, phone, address, lat, lng)")
      .eq("route_id", route.id)
      .order("position", { ascending: true });
    if (rcErr) throw new Error(rcErr.message);

    const customerIds = (rc ?? []).map((r: any) => r.customer_id);
    let deliveries: any[] = [];
    if (customerIds.length > 0) {
      const { data: del, error: delErr } = await supabase
        .from("deliveries")
        .select("id, customer_id, status, comment, photo_url")
        .eq("route_id", route.id)
        .eq("delivery_date", today)
        .in("customer_id", customerIds);
      if (delErr) throw new Error(delErr.message);
      deliveries = del ?? [];
    }
    const delMap = new Map(deliveries.map((d: any) => [d.customer_id, d]));

    const customers = (rc ?? []).map((r: any) => {
      const c = r.customers;
      const d = delMap.get(r.customer_id);
      return {
        position: r.position as number,
        id: c.id as string,
        name: c.name as string,
        phone: (c.phone as string | null) ?? null,
        address: (c.address as string | null) ?? null,
        lat: c.lat as number | null,
        lng: c.lng as number | null,
        delivery: d
          ? {
              id: d.id as string,
              status: d.status as "pending" | "delivered" | "failed",
              comment: (d.comment as string | null) ?? null,
              photo_url: (d.photo_url as string | null) ?? null,
            }
          : null,
      };
    });

    return {
      date: today,
      route: {
        id: route.id as string,
        name: route.name as string,
        branch_id: route.branch_id as string,
        branch_name: route.branches?.name ?? null,
      },
      dispatch: dispatch
        ? { id: dispatch.id, dispatched_at: dispatch.dispatched_at }
        : null,
      require_dispatch: requireDispatch,
      can_work: !requireDispatch || !!dispatch,
      driver_location_enabled: driverLocationEnabled,
      customers,
    };
  });

// ============ DELIVERIES ============

const deliveryStatusEnum = z.enum(["pending", "delivered", "failed"]);

const upsertDeliverySchema = z.object({
  customer_id: z.string().uuid(),
  status: deliveryStatusEnum,
  comment: z.string().trim().max(500).nullable().optional(),
  photo_path: z.string().max(500).nullable().optional(),
});

export const upsertDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertDeliverySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const today = todayStr();

    const { data: routes, error: rErr } = await supabase
      .from("routes")
      .select("id, branch_id")
      .eq("driver_id", userId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (rErr) throw new Error(rErr.message);
    const route = (routes ?? [])[0] as any;
    if (!route) throw new Error("No tienes una ruta asignada.");

    await requireTodayDispatchIfEnabled(supabase, route.id, userId, route.branch_id, today);

    const { data: rc, error: rcErr } = await supabase
      .from("route_customers")
      .select("customer_id")
      .eq("route_id", route.id)
      .eq("customer_id", data.customer_id)
      .maybeSingle();
    if (rcErr) throw new Error(rcErr.message);
    if (!rc) throw new Error("Cliente no pertenece a tu ruta.");

    const { data: row, error } = await supabase
      .from("deliveries")
      .upsert(
        {
          branch_id: route.branch_id,
          route_id: route.id,
          customer_id: data.customer_id,
          driver_id: userId,
          delivery_date: today,
          status: data.status,
          comment: data.comment ?? null,
          photo_url: data.photo_path ?? null,
        },
        { onConflict: "route_id,customer_id,delivery_date" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// Products with effective price for a given customer (driver's route)
export const getCustomerPricedProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ customer_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: products, error: pErr } = await supabase
      .from("products")
      .select("id, name, unit, price, allow_returns")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    if (pErr) throw new Error(pErr.message);
    const { data: overrides, error: oErr } = await supabase
      .from("customer_prices")
      .select("product_id, price")
      .eq("customer_id", data.customer_id);
    if (oErr) throw new Error(oErr.message);
    const ov = new Map((overrides ?? []).map((o: any) => [o.product_id, Number(o.price)]));
    return (products ?? []).map((p: any) => ({
      id: p.id as string,
      name: p.name as string,
      unit: p.unit as string,
      base_price: Number(p.price),
      effective_price: ov.has(p.id) ? (ov.get(p.id) as number) : Number(p.price),
      has_override: ov.has(p.id),
      allow_returns: Boolean(p.allow_returns),
    }));
  });

// Existing items + returns for today's delivery (if any)
export const getTodayDeliveryDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ customer_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const today = todayStr();
    const { data: routes } = await supabase
      .from("routes").select("id").eq("driver_id", userId).eq("is_active", true)
      .order("updated_at", { ascending: false }).limit(1);
    const routeId = (routes ?? [])[0]?.id;
    if (!routeId) return { delivery: null, items: [], returns: [], payment: null };

    const { data: del } = await supabase
      .from("deliveries")
      .select("id, status, comment, photo_url")
      .eq("route_id", routeId).eq("customer_id", data.customer_id).eq("delivery_date", today)
      .maybeSingle();
    if (!del) return { delivery: null, items: [], returns: [], payment: null };

    const [{ data: items }, { data: rets }, { data: pay }] = await Promise.all([
      supabase.from("delivery_items").select("product_id, quantity, unit_price").eq("delivery_id", del.id),
      supabase.from("delivery_returns").select("product_id, quantity").eq("delivery_id", del.id),
      supabase.from("payments").select("id, amount, method, status").eq("delivery_id", del.id).maybeSingle(),
    ]);

    return {
      delivery: { id: del.id, status: del.status, comment: del.comment, photo_url: del.photo_url },
      items: (items ?? []).map((i: any) => ({ product_id: i.product_id, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
      returns: (rets ?? []).map((r: any) => ({ product_id: r.product_id, quantity: Number(r.quantity) })),
      payment: pay ? { method: pay.method, status: pay.status, amount: Number(pay.amount) } : null,
    };
  });

const lineSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().positive().max(100000),
});

const saveDeliveryVisitSchema = z.object({
  customer_id: z.string().uuid(),
  status: deliveryStatusEnum,
  comment: z.string().trim().max(500).nullable().optional(),
  photo_path: z.string().max(500).nullable().optional(),
  items: z.array(lineSchema).max(100).default([]),
  returns: z.array(lineSchema).max(100).default([]),
  payment: z.object({
    method: z.enum(["cash", "transfer", "credit", "other"]),
    status: z.enum(["paid", "pending"]),
  }),
});

export const saveDeliveryVisit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveDeliveryVisitSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const today = todayStr();

    const { data: routes, error: rErr } = await supabase
      .from("routes").select("id, branch_id")
      .eq("driver_id", userId).eq("is_active", true)
      .order("updated_at", { ascending: false }).limit(1);
    if (rErr) throw new Error(rErr.message);
    const route = (routes ?? [])[0] as any;
    if (!route) throw new Error("No tienes una ruta asignada.");

    await requireTodayDispatchIfEnabled(supabase, route.id, userId, route.branch_id, today);

    const { data: rc, error: rcErr } = await supabase
      .from("route_customers").select("customer_id")
      .eq("route_id", route.id).eq("customer_id", data.customer_id).maybeSingle();
    if (rcErr) throw new Error(rcErr.message);
    if (!rc) throw new Error("Cliente no pertenece a tu ruta.");

    // Upsert delivery
    const { data: del, error: dErr } = await supabase
      .from("deliveries")
      .upsert(
        {
          branch_id: route.branch_id,
          route_id: route.id,
          customer_id: data.customer_id,
          driver_id: userId,
          delivery_date: today,
          status: data.status,
          comment: data.comment ?? null,
          photo_url: data.photo_path ?? null,
        },
        { onConflict: "route_id,customer_id,delivery_date" },
      )
      .select("id")
      .single();
    if (dErr) throw new Error(dErr.message);
    const deliveryId = del.id as string;

    // Resolve prices for sold and returned products
    const allProductIds = Array.from(
      new Set([
        ...data.items.map((i) => i.product_id),
        ...data.returns.map((r) => r.product_id),
      ]),
    );
    const priceMap = new Map<string, number>();
    if (allProductIds.length > 0) {
      const [{ data: prods, error: pErr }, { data: ov, error: oErr }] = await Promise.all([
        supabase.from("products").select("id, price").in("id", allProductIds),
        supabase.from("customer_prices").select("product_id, price")
          .eq("customer_id", data.customer_id).in("product_id", allProductIds),
      ]);
      if (pErr) throw new Error(pErr.message);
      if (oErr) throw new Error(oErr.message);
      for (const p of prods ?? []) priceMap.set(p.id as string, Number((p as any).price));
      for (const o of ov ?? []) priceMap.set((o as any).product_id, Number((o as any).price));
    }

    // Replace items
    await supabase.from("delivery_items").delete().eq("delivery_id", deliveryId);
    let total = 0;
    if (data.items.length > 0) {
      const rows = data.items.map((i) => {
        const price = priceMap.get(i.product_id) ?? 0;
        total += price * i.quantity;
        return { delivery_id: deliveryId, product_id: i.product_id, quantity: i.quantity, unit_price: price };
      });
      const { error: iErr } = await supabase.from("delivery_items").insert(rows);
      if (iErr) throw new Error(iErr.message);
    }

    // Replace returns
    await supabase.from("delivery_returns").delete().eq("delivery_id", deliveryId);
    if (data.returns.length > 0) {
      const rows = data.returns.map((r) => ({
        delivery_id: deliveryId, product_id: r.product_id, quantity: r.quantity,
      }));
      const { error: retErr } = await supabase.from("delivery_returns").insert(rows);
      if (retErr) throw new Error(retErr.message);
    }

    const itemLines = data.items.map((i) => ({
      product_id: i.product_id,
      quantity: i.quantity,
      unit_price: priceMap.get(i.product_id) ?? 0,
    }));
    const returnLines = data.returns.map((r) => ({
      product_id: r.product_id,
      quantity: r.quantity,
      unit_price: priceMap.get(r.product_id) ?? 0,
    }));
    total = deliveryNetTotals(itemLines, returnLines).netAmount;

    // Payment: only when delivered and total>0; otherwise remove
    const { data: existingPay } = await supabase
      .from("payments").select("id").eq("delivery_id", deliveryId).maybeSingle();

    if (data.status === "delivered" && total > 0) {
      const payRow = {
        branch_id: route.branch_id,
        route_id: route.id,
        customer_id: data.customer_id,
        driver_id: userId,
        delivery_id: deliveryId,
        amount: Number(total.toFixed(2)),
        method: data.payment.method,
        status: data.payment.status,
      };
      if (existingPay) {
        const { error } = await supabase.from("payments").update(payRow).eq("id", existingPay.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("payments").insert(payRow);
        if (error) throw new Error(error.message);
      }
    } else if (existingPay) {
      await supabase.from("payments").delete().eq("id", existingPay.id);
    }

    return { ok: true, delivery_id: deliveryId, total };
  });

export const listTodayDeliveries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const from = data.date_from ?? todayStr();
    const to = data.date_to ?? from;
    const { data: rows, error } = await supabase
      .from("deliveries")
      .select(
        "id, status, comment, photo_url, customer_id, delivery_date, updated_at, customers(name), delivery_items(product_id, quantity, unit_price, line_total), delivery_returns(product_id, quantity)",
      )
      .eq("driver_id", userId)
      .gte("delivery_date", from)
      .lte("delivery_date", to)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => {
      const items = (r.delivery_items ?? []) as Array<{
        product_id: string;
        quantity: number;
        unit_price: number;
        line_total?: number;
      }>;
      const returns = (r.delivery_returns ?? []) as Array<{ product_id: string; quantity: number }>;
      const totals = deliveryNetTotals(items, returns);
      return {
        id: r.id as string,
        status: r.status as "pending" | "delivered" | "failed",
        comment: (r.comment as string | null) ?? null,
        photo_url: (r.photo_url as string | null) ?? null,
        customer_id: r.customer_id as string,
        customer_name: (r.customers?.name as string | null) ?? null,
        delivery_date: r.delivery_date as string,
        units: totals.netUnits,
        total: totals.netAmount,
        return_amount: totals.returnAmount,
      };
    });
  });


// ============ PAYMENTS ============

const paymentSchema = z.object({
  customer_id: z.string().uuid(),
  amount: z.number().positive().max(10_000_000),
  status: z.enum(["paid", "pending"]),
  method: z.enum(["cash", "transfer", "credit", "other"]),
  note: z.string().trim().max(500).nullable().optional(),
});

export const createPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => paymentSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: routes, error: rErr } = await supabase
      .from("routes")
      .select("id, branch_id")
      .eq("driver_id", userId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (rErr) throw new Error(rErr.message);
    const route = (routes ?? [])[0] as any;
    if (!route) throw new Error("No tienes una ruta asignada.");

    await requireTodayDispatchIfEnabled(supabase, route.id, userId, route.branch_id, todayStr());

    const { data: row, error } = await supabase
      .from("payments")
      .insert({
        branch_id: route.branch_id,
        route_id: route.id,
        customer_id: data.customer_id,
        driver_id: userId,
        amount: data.amount,
        status: data.status,
        method: data.method,
        note: data.note ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("payments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listTodayPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const from = data.date_from ?? todayStr();
    const to = data.date_to ?? from;
    const { startISO } = tzDayRange(from);
    const { endISO } = tzDayRange(to);
    const { data: rows, error } = await supabase
      .from("payments")
      .select(
        "id, amount, status, method, note, paid_at, customer_id, delivery_id, customers(name), deliveries(delivery_items(product_id, quantity, unit_price, line_total), delivery_returns(product_id, quantity))",
      )
      .eq("driver_id", userId)
      .gte("paid_at", startISO)
      .lt("paid_at", endISO)
      .order("paid_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => {
      const items = (r.deliveries?.delivery_items ?? []) as Array<{
        product_id: string;
        quantity: number;
        unit_price: number;
        line_total?: number;
      }>;
      const returns = (r.deliveries?.delivery_returns ?? []) as Array<{ product_id: string; quantity: number }>;
      return {
        id: r.id as string,
        amount: deliveryPaymentAmount(Number(r.amount), items, returns),
        status: r.status as "paid" | "pending",
        method: r.method as "cash" | "transfer" | "credit" | "other",
        note: (r.note as string | null) ?? null,
        paid_at: r.paid_at as string,
        customer_id: r.customer_id as string,
        customer_name: (r.customers?.name as string | null) ?? null,
      };
    });
  });

// ============ EXPENSES ============

const expenseSchema = z.object({
  amount: z.number().positive().max(10_000_000),
  description: z.string().trim().min(1).max(500),
  photo_path: z.string().max(500).nullable().optional(),
});

export const createExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => expenseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const branchId = await getMyBranch(supabase, userId);
    const { data: routes } = await supabase
      .from("routes")
      .select("id, branch_id")
      .eq("driver_id", userId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);
    const route = (routes ?? [])[0] as any;
    if (!route?.id) throw new Error("No tienes una ruta asignada.");

    await requireTodayDispatchIfEnabled(supabase, route.id, userId, route.branch_id, todayStr());

    const { data: row, error } = await supabase
      .from("expenses")
      .insert({
        branch_id: branchId,
        route_id: route.id,
        driver_id: userId,
        expense_date: todayStr(),
        amount: data.amount,
        description: data.description,
        photo_url: data.photo_path ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("expenses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listTodayExpenses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const from = data.date_from ?? todayStr();
    const to = data.date_to ?? from;
    const { data: rows, error } = await supabase
      .from("expenses")
      .select("id, amount, description, photo_url, expense_date, created_at")
      .eq("driver_id", userId)
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      amount: Number(r.amount),
      description: r.description as string,
      photo_url: (r.photo_url as string | null) ?? null,
      expense_date: r.expense_date as string,
      created_at: r.created_at as string,
    }));
  });

// ============ PHOTOS ============

const photoBucketEnum = z.enum(["delivery-photos", "expense-photos"]);

export const getPhotoUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      bucket: photoBucketEnum,
      filename: z.string().min(1).max(120),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ext = (data.filename.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await supabase.storage
      .from(data.bucket)
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "No se pudo crear URL de carga.");
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

export const getPhotoViewUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      bucket: photoBucketEnum,
      paths: z.array(z.string().min(1).max(500)).max(200),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.paths.length === 0) return {} as Record<string, string>;
    const { data: signed, error } = await context.supabase.storage
      .from(data.bucket)
      .createSignedUrls(data.paths, 3600);
    if (error) throw new Error(error.message);
    const map: Record<string, string> = {};
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
    }
    return map;
  });

// ============ CUSTOMER LOCATION ============

export const updateCustomerLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      customer_id: z.string().uuid(),
      lat: z.number(),
      lng: z.number(),
      address: z.string().max(255).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify customer is on driver's active route
    const { data: routes, error: rErr } = await supabase
      .from("routes")
      .select("id, branch_id")
      .eq("driver_id", userId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (rErr) throw new Error(rErr.message);
    const route = (routes ?? [])[0] as any;
    if (!route) throw new Error("No tienes una ruta asignada.");

    // Verify location editing is enabled for this branch
    const locationEnabled = await branchDriverLocationEnabled(supabase, route.branch_id as string);
    if (!locationEnabled) throw new Error("El registro de ubicación no está habilitado para esta sucursal.");

    const { data: rc, error: rcErr } = await supabase
      .from("route_customers")
      .select("customer_id")
      .eq("route_id", route.id)
      .eq("customer_id", data.customer_id)
      .maybeSingle();
    if (rcErr) throw new Error(rcErr.message);
    if (!rc) throw new Error("Cliente no pertenece a tu ruta.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("customers")
      .update({
        lat: data.lat,
        lng: data.lng,
        ...(data.address != null ? { address: data.address } : {}),
      } as any)
      .eq("id", data.customer_id);
    if (error) throw new Error(error.message);

    return { customer_id: data.customer_id, lat: data.lat, lng: data.lng, address: data.address ?? null };
  });
