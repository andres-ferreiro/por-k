import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { todayInTZ, tzDayRange } from "@/lib/tz";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const branchIdField = z.string().uuid().optional().nullable();

async function fetchProfileNames(ids: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return map;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", unique);
  for (const r of data ?? []) map.set(r.id, r.full_name);
  return map;
}

// ============ DASHBOARD ============

export const getDashboardSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ date: dateStr.optional().nullable(), branch_id: branchIdField }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const date = data.date ?? todayInTZ();
    const { startISO, endISO } = tzDayRange(date);
    const bid = data.branch_id ?? null;

    let dq = supabase
      .from("dispatches")
      .select("id, driver_id, dispatch_items(quantity)")
      .gte("dispatched_at", startISO)
      .lt("dispatched_at", endISO);
    if (bid) dq = dq.eq("branch_id", bid);

    let delq = supabase
      .from("deliveries")
      .select("id, status, driver_id, delivery_items(quantity, line_total)")
      .eq("delivery_date", date);
    if (bid) delq = delq.eq("branch_id", bid);

    let pq = supabase
      .from("payments")
      .select("id, amount, method, status, driver_id, delivery_id")
      .gte("paid_at", startISO)
      .lt("paid_at", endISO);
    if (bid) pq = pq.eq("branch_id", bid);

    let eq = supabase
      .from("expenses")
      .select("id, amount, driver_id")
      .eq("expense_date", date);
    if (bid) eq = eq.eq("branch_id", bid);

    const [dispatchesRes, deliveriesRes, paymentsRes, expensesRes] = await Promise.all([
      dq, delq, pq, eq,
    ]);

    for (const r of [dispatchesRes, deliveriesRes, paymentsRes, expensesRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    const dispatches = dispatchesRes.data ?? [];
    const deliveries = deliveriesRes.data ?? [];
    const payments = paymentsRes.data ?? [];
    const expenses = expensesRes.data ?? [];

    const dispatchUnits = dispatches.reduce(
      (a: number, d: any) =>
        a + (d.dispatch_items ?? []).reduce((x: number, i: any) => x + Number(i.quantity ?? 0), 0),
      0,
    );

    const delivered = deliveries.filter((d: any) => d.status === "delivered");
    const pendingDel = deliveries.filter((d: any) => d.status === "pending").length;
    const failedDel = deliveries.filter((d: any) => d.status === "failed").length;
    const soldUnits = delivered.reduce(
      (a: number, d: any) =>
        a + (d.delivery_items ?? []).reduce((x: number, i: any) => x + Number(i.quantity ?? 0), 0),
      0,
    );
    const soldAmount = delivered.reduce(
      (a: number, d: any) =>
        a + (d.delivery_items ?? []).reduce((x: number, i: any) => x + Number(i.line_total ?? 0), 0),
      0,
    );

    const paid = payments.filter((p: any) => p.status === "paid");
    const collectedTotal = paid.reduce((a: number, p: any) => a + Number(p.amount ?? 0), 0);
    const byMethod: Record<string, number> = { cash: 0, transfer: 0, credit: 0, other: 0 };
    for (const p of paid) byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount ?? 0);
    const pendingAmount = payments
      .filter((p: any) => p.status === "pending")
      .reduce((a: number, p: any) => a + Number(p.amount ?? 0), 0);

    const expenseTotal = expenses.reduce((a: number, e: any) => a + Number(e.amount ?? 0), 0);
    const cashNet = (byMethod.cash ?? 0) - expenseTotal;

    // Per-driver mini summary
    const driverIds = new Set<string>();
    for (const x of [...dispatches, ...deliveries, ...payments, ...expenses]) driverIds.add((x as any).driver_id);
    const names = await fetchProfileNames(Array.from(driverIds));

    const perDriver = new Map<string, { id: string; name: string | null; sold: number; collected: number; pending: number }>();
    const ensure = (id: string) => {
      let v = perDriver.get(id);
      if (!v) {
        v = { id, name: names.get(id) ?? null, sold: 0, collected: 0, pending: 0 };
        perDriver.set(id, v);
      }
      return v;
    };
    for (const d of delivered) {
      const v = ensure((d as any).driver_id);
      v.sold += ((d as any).delivery_items ?? []).reduce(
        (x: number, i: any) => x + Number(i.line_total ?? 0), 0,
      );
    }
    for (const p of payments) {
      const v = ensure((p as any).driver_id);
      if (p.status === "paid") v.collected += Number(p.amount ?? 0);
      else v.pending += Number(p.amount ?? 0);
    }

    return {
      date,
      dispatches: { count: dispatches.length, units: dispatchUnits },
      deliveries: {
        total: deliveries.length,
        delivered: delivered.length,
        pending: pendingDel,
        failed: failedDel,
        soldUnits,
        soldAmount,
      },
      payments: {
        collectedTotal,
        pendingAmount,
        byMethod,
        count: payments.length,
      },
      expenses: { total: expenseTotal, count: expenses.length },
      cashNet,
      drivers: Array.from(perDriver.values()).sort((a, b) => b.sold - a.sold),
    };
  });

// ============ DELIVERIES ============

const dateRangeSchema = z.object({
  date_from: dateStr,
  date_to: dateStr,
  route_id: z.string().uuid().optional().nullable(),
  driver_id: z.string().uuid().optional().nullable(),
  branch_id: branchIdField,
});

export const listDeliveriesAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    dateRangeSchema.extend({
      status: z.enum(["pending", "delivered", "failed"]).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("deliveries")
      .select(
        "id, delivery_date, created_at, status, comment, route_id, driver_id, customer_id, routes(name), customers(name), delivery_items(quantity, line_total), delivery_returns(quantity), payments(id, amount, method, status, delivery_id)",
      )
      .gte("delivery_date", data.date_from)
      .lte("delivery_date", data.date_to)
      .order("delivery_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (data.route_id) q = q.eq("route_id", data.route_id);
    if (data.driver_id) q = q.eq("driver_id", data.driver_id);
    if (data.status) q = q.eq("status", data.status);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const driverIds = (rows ?? []).map((r: any) => r.driver_id);
    const names = await fetchProfileNames(driverIds);

    return (rows ?? []).map((r: any) => {
      const items = (r.delivery_items ?? []) as { quantity: number; line_total: number }[];
      const returns = (r.delivery_returns ?? []) as { quantity: number }[];
      const total = items.reduce((a, i) => a + Number(i.line_total ?? 0), 0);
      const units = items.reduce((a, i) => a + Number(i.quantity ?? 0), 0);
      const returnUnits = returns.reduce((a, i) => a + Number(i.quantity ?? 0), 0);
      const pay = (r.payments ?? []).find((p: any) => p.delivery_id === r.id) ?? null;
      return {
        id: r.id as string,
        delivery_date: r.delivery_date as string,
        created_at: r.created_at as string,
        status: r.status as "pending" | "delivered" | "failed",
        comment: r.comment as string | null,
        route_id: r.route_id as string,
        route_name: r.routes?.name ?? null,
        customer_id: r.customer_id as string,
        customer_name: r.customers?.name ?? null,
        driver_id: r.driver_id as string,
        driver_name: names.get(r.driver_id) ?? null,
        line_count: items.length,
        units,
        return_units: returnUnits,
        total,
        payment: pay
          ? {
              amount: Number(pay.amount),
              method: pay.method as string,
              status: pay.status as "paid" | "pending",
            }
          : null,
      };
    });
  });

export const getDeliveryDetailAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: del, error } = await supabase
      .from("deliveries")
      .select(
        "id, delivery_date, created_at, status, comment, photo_url, route_id, driver_id, customer_id, routes(name), customers(name, address)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!del) throw new Error("Entrega no encontrada.");

    const [itemsRes, retRes, payRes] = await Promise.all([
      supabase
        .from("delivery_items")
        .select("id, quantity, unit_price, line_total, product_id, products(name, unit)")
        .eq("delivery_id", data.id),
      supabase
        .from("delivery_returns")
        .select("id, quantity, product_id, products(name, unit)")
        .eq("delivery_id", data.id),
      supabase
        .from("payments")
        .select("id, amount, method, status, paid_at, note")
        .eq("delivery_id", data.id)
        .maybeSingle(),
    ]);

    const names = await fetchProfileNames([(del as any).driver_id]);

    return {
      id: del.id as string,
      delivery_date: del.delivery_date as string,
      status: del.status as string,
      comment: del.comment as string | null,
      photo_url: del.photo_url as string | null,
      route_name: (del as any).routes?.name ?? null,
      driver_name: names.get((del as any).driver_id) ?? null,
      customer_name: (del as any).customers?.name ?? null,
      customer_address: (del as any).customers?.address ?? null,
      items: (itemsRes.data ?? []).map((i: any) => ({
        id: i.id,
        product_name: i.products?.name ?? null,
        unit: i.products?.unit ?? null,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        line_total: Number(i.line_total),
      })),
      returns: (retRes.data ?? []).map((i: any) => ({
        id: i.id,
        product_name: i.products?.name ?? null,
        unit: i.products?.unit ?? null,
        quantity: Number(i.quantity),
      })),
      payment: payRes.data
        ? {
            id: (payRes.data as any).id,
            amount: Number((payRes.data as any).amount),
            method: (payRes.data as any).method as string,
            status: (payRes.data as any).status as string,
            paid_at: (payRes.data as any).paid_at as string,
            note: (payRes.data as any).note as string | null,
          }
        : null,
    };
  });

// ============ PAYMENTS ============

export const listPaymentsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    dateRangeSchema.extend({
      method: z.enum(["cash", "transfer", "credit", "other"]).optional().nullable(),
      status: z.enum(["paid", "pending"]).optional().nullable(),
      origin: z.enum(["delivery", "manual"]).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { startISO } = tzDayRange(data.date_from);
    const { endISO } = tzDayRange(data.date_to);

    let q = context.supabase
      .from("payments")
      .select(
        "id, amount, method, status, paid_at, note, route_id, customer_id, driver_id, delivery_id, routes(name), customers(name)",
      )
      .gte("paid_at", startISO)
      .lt("paid_at", endISO)
      .order("paid_at", { ascending: false });

    if (data.route_id) q = q.eq("route_id", data.route_id);
    if (data.driver_id) q = q.eq("driver_id", data.driver_id);
    if (data.method) q = q.eq("method", data.method);
    if (data.status) q = q.eq("status", data.status);
    if (data.origin === "delivery") q = q.not("delivery_id", "is", null);
    if (data.origin === "manual") q = q.is("delivery_id", null);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const names = await fetchProfileNames((rows ?? []).map((r: any) => r.driver_id));

    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      amount: Number(r.amount),
      method: r.method as string,
      status: r.status as "paid" | "pending",
      paid_at: r.paid_at as string,
      note: r.note as string | null,
      route_name: r.routes?.name ?? null,
      customer_name: r.customers?.name ?? null,
      driver_id: r.driver_id as string,
      driver_name: names.get(r.driver_id) ?? null,
      from_delivery: !!r.delivery_id,
    }));
  });

// ============ EXPENSES ============

export const listExpensesAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => dateRangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("expenses")
      .select("id, amount, description, expense_date, created_at, photo_url, route_id, driver_id, routes(name)")
      .gte("expense_date", data.date_from)
      .lte("expense_date", data.date_to)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (data.route_id) q = q.eq("route_id", data.route_id);
    if (data.driver_id) q = q.eq("driver_id", data.driver_id);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const names = await fetchProfileNames((rows ?? []).map((r: any) => r.driver_id));

    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      amount: Number(r.amount),
      description: r.description as string,
      expense_date: r.expense_date as string,
      created_at: r.created_at as string,
      photo_url: r.photo_url as string | null,
      route_name: r.routes?.name ?? null,
      driver_id: r.driver_id as string,
      driver_name: names.get(r.driver_id) ?? null,
    }));
  });

// ============ REPORTS ============

export const reportSalesByProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => dateRangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    let dq = context.supabase
      .from("deliveries")
      .select(
        "id, route_id, driver_id, delivery_items(product_id, quantity, line_total, products(name, unit)), delivery_returns(product_id, quantity, products(name, unit))",
      )
      .eq("status", "delivered")
      .gte("delivery_date", data.date_from)
      .lte("delivery_date", data.date_to);
    if (data.route_id) dq = dq.eq("route_id", data.route_id);
    if (data.driver_id) dq = dq.eq("driver_id", data.driver_id);

    const { data: dels, error } = await dq;
    if (error) throw new Error(error.message);

    type Row = {
      product_id: string;
      product_name: string | null;
      unit: string | null;
      units_sold: number;
      units_returned: number;
      amount: number;
    };
    const map = new Map<string, Row>();
    const get = (id: string, name: string | null, unit: string | null) => {
      let r = map.get(id);
      if (!r) {
        r = { product_id: id, product_name: name, unit, units_sold: 0, units_returned: 0, amount: 0 };
        map.set(id, r);
      } else if (!r.product_name && name) r.product_name = name;
      return r;
    };
    for (const d of dels ?? []) {
      for (const i of (d as any).delivery_items ?? []) {
        const r = get(i.product_id, i.products?.name ?? null, i.products?.unit ?? null);
        r.units_sold += Number(i.quantity ?? 0);
        r.amount += Number(i.line_total ?? 0);
      }
      for (const i of (d as any).delivery_returns ?? []) {
        const r = get(i.product_id, i.products?.name ?? null, i.products?.unit ?? null);
        r.units_returned += Number(i.quantity ?? 0);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  });

export const reportSalesByDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => dateRangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { startISO } = tzDayRange(data.date_from);
    const { endISO } = tzDayRange(data.date_to);
    const [delsRes, paysRes, expsRes] = await Promise.all([
      context.supabase
        .from("deliveries")
        .select("driver_id, status, delivery_items(line_total)")
        .gte("delivery_date", data.date_from)
        .lte("delivery_date", data.date_to)
        .eq("status", "delivered"),
      context.supabase
        .from("payments")
        .select("driver_id, amount, status")
        .gte("paid_at", startISO)
        .lt("paid_at", endISO),
      context.supabase
        .from("expenses")
        .select("driver_id, amount")
        .gte("expense_date", data.date_from)
        .lte("expense_date", data.date_to),
    ]);
    for (const r of [delsRes, paysRes, expsRes]) if (r.error) throw new Error(r.error.message);

    type Row = {
      driver_id: string;
      driver_name: string | null;
      sold: number;
      collected: number;
      pending: number;
      expenses: number;
      net: number;
    };
    const map = new Map<string, Row>();
    const get = (id: string) => {
      let r = map.get(id);
      if (!r) {
        r = { driver_id: id, driver_name: null, sold: 0, collected: 0, pending: 0, expenses: 0, net: 0 };
        map.set(id, r);
      }
      return r;
    };
    for (const d of delsRes.data ?? []) {
      const r = get((d as any).driver_id);
      r.sold += ((d as any).delivery_items ?? []).reduce((a: number, i: any) => a + Number(i.line_total ?? 0), 0);
    }
    for (const p of paysRes.data ?? []) {
      const r = get((p as any).driver_id);
      if ((p as any).status === "paid") r.collected += Number((p as any).amount ?? 0);
      else r.pending += Number((p as any).amount ?? 0);
    }
    for (const e of expsRes.data ?? []) {
      const r = get((e as any).driver_id);
      r.expenses += Number((e as any).amount ?? 0);
    }
    const names = await fetchProfileNames(Array.from(map.keys()));
    for (const r of map.values()) {
      r.driver_name = names.get(r.driver_id) ?? null;
      r.net = r.collected - r.expenses;
    }
    return Array.from(map.values()).sort((a, b) => b.sold - a.sold);
  });

export const reportSalesByCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => dateRangeSchema.extend({ limit: z.number().int().min(1).max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: dels, error } = await context.supabase
      .from("deliveries")
      .select("id, customer_id, customers(name), delivery_items(line_total)")
      .eq("status", "delivered")
      .gte("delivery_date", data.date_from)
      .lte("delivery_date", data.date_to);
    if (error) throw new Error(error.message);

    type Row = { customer_id: string; customer_name: string | null; visits: number; amount: number };
    const map = new Map<string, Row>();
    for (const d of dels ?? []) {
      const id = (d as any).customer_id as string;
      let r = map.get(id);
      if (!r) {
        r = { customer_id: id, customer_name: (d as any).customers?.name ?? null, visits: 0, amount: 0 };
        map.set(id, r);
      }
      r.visits += 1;
      r.amount += ((d as any).delivery_items ?? []).reduce(
        (a: number, i: any) => a + Number(i.line_total ?? 0), 0,
      );
    }
    const rows = Array.from(map.values()).sort((a, b) => b.amount - a.amount);
    return data.limit ? rows.slice(0, data.limit) : rows;
  });
