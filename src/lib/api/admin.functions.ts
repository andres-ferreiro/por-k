import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { todayInTZ, tzDayRange } from "@/lib/tz";
import { deliveryNetTotals } from "@/lib/delivery-totals";

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
    z.object({
      date_from: dateStr.optional().nullable(),
      date_to: dateStr.optional().nullable(),
      branch_id: branchIdField,
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const today = todayInTZ();
    const dateFrom = data.date_from ?? today;
    const dateTo = data.date_to ?? today;
    const { startISO } = tzDayRange(dateFrom);
    const { endISO } = tzDayRange(dateTo);
    const bid = data.branch_id ?? null;

    let dq = supabase
      .from("dispatches")
      .select("id, driver_id, dispatch_items(quantity)")
      .gte("dispatched_at", startISO)
      .lt("dispatched_at", endISO);
    if (bid) dq = dq.eq("branch_id", bid);

    let delq = supabase
      .from("deliveries")
      .select(
        "id, status, driver_id, delivery_items(product_id, quantity, unit_price, line_total), delivery_returns(product_id, quantity)",
      )
      .gte("delivery_date", dateFrom)
      .lte("delivery_date", dateTo);
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
      .gte("expense_date", dateFrom)
      .lte("expense_date", dateTo);
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

    let soldUnits = 0;
    let soldAmount = 0;
    const deliveryNetById = new Map<string, number>();
    for (const d of delivered) {
      const totals = deliveryNetTotals(
        (d as any).delivery_items ?? [],
        (d as any).delivery_returns ?? [],
      );
      soldUnits += totals.netUnits;
      soldAmount += totals.netAmount;
      deliveryNetById.set((d as any).id, totals.netAmount);
    }

    const paymentAmount = (p: any) =>
      p.delivery_id && deliveryNetById.has(p.delivery_id)
        ? deliveryNetById.get(p.delivery_id)!
        : Number(p.amount ?? 0);

    const paid = payments.filter((p: any) => p.status === "paid");
    const collectedTotal = paid.reduce((a: number, p: any) => a + paymentAmount(p), 0);
    const byMethod: Record<string, number> = { cash: 0, transfer: 0, credit: 0, other: 0 };
    for (const p of paid) byMethod[p.method] = (byMethod[p.method] ?? 0) + paymentAmount(p);
    const pendingAmount = payments
      .filter((p: any) => p.status === "pending")
      .reduce((a: number, p: any) => a + paymentAmount(p), 0);

    const expenseTotal = expenses.reduce((a: number, e: any) => a + Number(e.amount ?? 0), 0);
    const cashNet = (byMethod.cash ?? 0) - expenseTotal;

    const driverIds = new Set<string>();
    for (const x of [...dispatches, ...deliveries, ...payments, ...expenses]) driverIds.add((x as any).driver_id);
    const names = await fetchProfileNames(Array.from(driverIds));

    const perDriver = new Map<string, { id: string; name: string | null; sold: number; collected: number; pending: number; failed: number }>();
    const ensure = (id: string) => {
      let v = perDriver.get(id);
      if (!v) {
        v = { id, name: names.get(id) ?? null, sold: 0, collected: 0, pending: 0, failed: 0 };
        perDriver.set(id, v);
      }
      return v;
    };
    for (const d of deliveries) {
      const v = ensure((d as any).driver_id);
      if ((d as any).status === "delivered") {
        const totals = deliveryNetTotals(
          (d as any).delivery_items ?? [],
          (d as any).delivery_returns ?? [],
        );
        v.sold += totals.netAmount;
      }
      if ((d as any).status === "failed") v.failed += 1;
    }
    for (const p of payments) {
      const v = ensure((p as any).driver_id);
      const amt = paymentAmount(p);
      if (p.status === "paid") v.collected += amt;
      else v.pending += amt;
    }

    return {
      date_from: dateFrom,
      date_to: dateTo,
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

export const getDailyTotals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ date_from: dateStr, date_to: dateStr, branch_id: branchIdField }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { startISO } = tzDayRange(data.date_from);
    const { endISO } = tzDayRange(data.date_to);
    const bid = data.branch_id ?? null;

    let delQ = supabase
      .from("deliveries")
      .select("delivery_date, status, delivery_items(line_total)")
      .gte("delivery_date", data.date_from)
      .lte("delivery_date", data.date_to);
    if (bid) delQ = delQ.eq("branch_id", bid);

    let payQ = supabase
      .from("payments")
      .select("paid_at, amount, status, delivery_id, deliveries(delivery_items(line_total))")
      .gte("paid_at", startISO)
      .lt("paid_at", endISO)
      .eq("status", "paid");
    if (bid) payQ = payQ.eq("branch_id", bid);

    const [delRes, payRes] = await Promise.all([delQ, payQ]);
    if (delRes.error) throw new Error(delRes.error.message);
    if (payRes.error) throw new Error(payRes.error.message);

    // Build date spine (one entry per calendar day in range)
    const spine = new Map<string, { date: string; sold: number; collected: number; delivered: number; failed: number; pending: number }>();
    const cur = new Date(data.date_from + "T12:00:00Z");
    const end = new Date(data.date_to + "T12:00:00Z");
    while (cur <= end) {
      const d = cur.toISOString().slice(0, 10);
      spine.set(d, { date: d, sold: 0, collected: 0, delivered: 0, failed: 0, pending: 0 });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    for (const row of delRes.data ?? []) {
      const entry = spine.get((row as any).delivery_date as string);
      if (!entry) continue;
      if ((row as any).status === "delivered") {
        entry.delivered += 1;
        const items = (row as any).delivery_items ?? [];
        entry.sold += items.reduce((s: number, i: any) => s + Number(i.line_total ?? 0), 0);
      } else if ((row as any).status === "failed") {
        entry.failed += 1;
      } else {
        entry.pending += 1;
      }
    }

    // Build per-day ISO boundaries for correct timezone bucketing
    const dayBoundaries = Array.from(spine.keys()).map((date) => {
      const { startISO, endISO } = tzDayRange(date);
      return { date, startISO, endISO };
    });

    for (const row of payRes.data ?? []) {
      const paidAt = (row as any).paid_at as string;
      const day = dayBoundaries.find((b) => paidAt >= b.startISO && paidAt < b.endISO);
      if (!day) continue;
      const entry = spine.get(day.date)!;
      const items = (row as any).deliveries?.delivery_items ?? [];
      const total = items.length > 0
        ? items.reduce((s: number, i: any) => s + Number(i.line_total ?? 0), 0)
        : Number((row as any).amount ?? 0);
      entry.collected += total;
    }

    return Array.from(spine.values());
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
        "id, delivery_date, created_at, status, comment, route_id, driver_id, customer_id, routes(name), customers(name), delivery_items(product_id, quantity, unit_price, line_total), delivery_returns(product_id, quantity), payments(id, amount, method, status, delivery_id)",
      )
      .gte("delivery_date", data.date_from)
      .lte("delivery_date", data.date_to)
      .order("delivery_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    if (data.route_id) q = q.eq("route_id", data.route_id);
    if (data.driver_id) q = q.eq("driver_id", data.driver_id);
    if (data.status) q = q.eq("status", data.status);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const driverIds = (rows ?? []).map((r: any) => r.driver_id);
    const names = await fetchProfileNames(driverIds);

    return (rows ?? []).map((r: any) => {
      const items = (r.delivery_items ?? []) as { product_id: string; quantity: number; unit_price: number; line_total: number }[];
      const returns = (r.delivery_returns ?? []) as { product_id: string; quantity: number }[];
      const totals = deliveryNetTotals(items, returns);
      const total = totals.netAmount;
      const units = totals.netUnits;
      const returnUnits = totals.returnUnits;
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
              amount: totals.netAmount,
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

    const items = (itemsRes.data ?? []).map((i: any) => ({
      id: i.id,
      product_id: i.product_id as string,
      product_name: i.products?.name ?? null,
      unit: i.products?.unit ?? null,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      line_total: Number(i.line_total),
    }));
    const returns = (retRes.data ?? []).map((i: any) => ({
      id: i.id,
      product_id: i.product_id as string,
      product_name: i.products?.name ?? null,
      unit: i.products?.unit ?? null,
      quantity: Number(i.quantity),
    }));
    const totals = deliveryNetTotals(items, returns);

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
      items,
      returns,
      totals,
      payment: payRes.data
        ? {
            id: (payRes.data as any).id,
            amount: totals.netAmount,
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

    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    if (data.route_id) q = q.eq("route_id", data.route_id);
    if (data.driver_id) q = q.eq("driver_id", data.driver_id);
    if (data.method) q = q.eq("method", data.method);
    if (data.status) q = q.eq("status", data.status);
    if (data.origin === "delivery") q = q.not("delivery_id", "is", null);
    if (data.origin === "manual") q = q.is("delivery_id", null);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const deliveryIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.delivery_id).filter(Boolean)),
    ) as string[];
    const deliveryNetById = new Map<string, number>();
    if (deliveryIds.length > 0) {
      const { data: dels, error: dErr } = await context.supabase
        .from("deliveries")
        .select("id, delivery_items(product_id, quantity, unit_price, line_total), delivery_returns(product_id, quantity)")
        .in("id", deliveryIds);
      if (dErr) throw new Error(dErr.message);
      for (const d of dels ?? []) {
        const totals = deliveryNetTotals(
          (d as any).delivery_items ?? [],
          (d as any).delivery_returns ?? [],
        );
        deliveryNetById.set(d.id as string, totals.netAmount);
      }
    }

    const names = await fetchProfileNames((rows ?? []).map((r: any) => r.driver_id));

    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      amount: r.delivery_id
        ? deliveryNetById.get(r.delivery_id as string) ?? Number(r.amount)
        : Number(r.amount),
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

    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
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
    if (data.branch_id) dq = dq.eq("branch_id", data.branch_id);
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
      const items = (d as any).delivery_items ?? [];
      const returns = (d as any).delivery_returns ?? [];
      for (const i of items) {
        const r = get(i.product_id, i.products?.name ?? null, i.products?.unit ?? null);
        r.units_sold += Number(i.quantity ?? 0);
        r.amount += Number(i.line_total ?? 0);
      }
      const prices = new Map(
        items.map((i: any) => [i.product_id as string, Number(i.line_total ?? 0) / Number(i.quantity || 1)]),
      );
      for (const i of returns) {
        const r = get(i.product_id, i.products?.name ?? null, i.products?.unit ?? null);
        r.units_returned += Number(i.quantity ?? 0);
        const unitPrice = prices.get(i.product_id as string) ?? 0;
        r.amount -= Number(i.quantity ?? 0) * unitPrice;
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
    const bid = data.branch_id ?? null;
    let delQ = context.supabase
      .from("deliveries")
      .select(
        "id, driver_id, status, delivery_items(product_id, quantity, unit_price, line_total), delivery_returns(product_id, quantity)",
      )
      .gte("delivery_date", data.date_from)
      .lte("delivery_date", data.date_to)
      .eq("status", "delivered");
    if (bid) delQ = delQ.eq("branch_id", bid);
    if (data.route_id) delQ = delQ.eq("route_id", data.route_id);
    if (data.driver_id) delQ = delQ.eq("driver_id", data.driver_id);

    let payQ = context.supabase
      .from("payments")
      .select("driver_id, amount, status, delivery_id")
      .gte("paid_at", startISO)
      .lt("paid_at", endISO);
    if (bid) payQ = payQ.eq("branch_id", bid);
    if (data.route_id) payQ = payQ.eq("route_id", data.route_id);
    if (data.driver_id) payQ = payQ.eq("driver_id", data.driver_id);

    let expQ = context.supabase
      .from("expenses")
      .select("driver_id, amount")
      .gte("expense_date", data.date_from)
      .lte("expense_date", data.date_to);
    if (bid) expQ = expQ.eq("branch_id", bid);
    if (data.route_id) expQ = expQ.eq("route_id", data.route_id);
    if (data.driver_id) expQ = expQ.eq("driver_id", data.driver_id);

    const [delsRes, paysRes, expsRes] = await Promise.all([delQ, payQ, expQ]);
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
    const deliveryNetById = new Map<string, number>();
    for (const d of delsRes.data ?? []) {
      const r = get((d as any).driver_id);
      const totals = deliveryNetTotals(
        (d as any).delivery_items ?? [],
        (d as any).delivery_returns ?? [],
      );
      deliveryNetById.set((d as any).id, totals.netAmount);
      r.sold += totals.netAmount;
    }
    for (const p of paysRes.data ?? []) {
      const r = get((p as any).driver_id);
      const amt =
        (p as any).delivery_id && deliveryNetById.has((p as any).delivery_id)
          ? deliveryNetById.get((p as any).delivery_id)!
          : Number((p as any).amount ?? 0);
      if ((p as any).status === "paid") r.collected += amt;
      else r.pending += amt;
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
    let cq = context.supabase
      .from("deliveries")
      .select(
        "id, customer_id, customers(name), delivery_items(product_id, quantity, unit_price, line_total), delivery_returns(product_id, quantity)",
      )
      .eq("status", "delivered")
      .gte("delivery_date", data.date_from)
      .lte("delivery_date", data.date_to);
    if (data.branch_id) cq = cq.eq("branch_id", data.branch_id);
    if (data.route_id) cq = cq.eq("route_id", data.route_id);
    if (data.driver_id) cq = cq.eq("driver_id", data.driver_id);
    const { data: dels, error } = await cq;
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
      const totals = deliveryNetTotals(
        (d as any).delivery_items ?? [],
        (d as any).delivery_returns ?? [],
      );
      r.amount += totals.netAmount;
    }
    const rows = Array.from(map.values()).sort((a, b) => b.amount - a.amount);
    return data.limit ? rows.slice(0, data.limit) : rows;
  });

// ============ TEST / RESET ============

async function assertOwner(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "owner")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Solo el propietario puede limpiar movimientos.");
}

export const clearDayMovements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ date: dateStr, branch_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { startISO, endISO } = tzDayRange(data.date);
    const branchId = data.branch_id;

    async function deleteCount(table: string, apply: (q: any) => any) {
      let q = supabaseAdmin.from(table).delete({ count: "exact" });
      q = apply(q);
      const { error, count } = await q;
      if (error) throw new Error(error.message);
      return count ?? 0;
    }

    const payments = await deleteCount("payments", (q) =>
      q.eq("branch_id", branchId).gte("paid_at", startISO).lt("paid_at", endISO),
    );
    const deliveries = await deleteCount("deliveries", (q) =>
      q.eq("branch_id", branchId).eq("delivery_date", data.date),
    );
    const expenses = await deleteCount("expenses", (q) =>
      q.eq("branch_id", branchId).eq("expense_date", data.date),
    );
    const dispatches = await deleteCount("dispatches", (q) =>
      q.eq("branch_id", branchId).gte("dispatched_at", startISO).lt("dispatched_at", endISO),
    );

    return {
      date: data.date,
      branch_id: branchId,
      deleted: { payments, deliveries, expenses, dispatches },
    };
  });
