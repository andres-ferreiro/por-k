import { deliveryNetTotals } from "@/lib/delivery-totals";
import { todayInTZ, tzWallToUtcISO } from "@/lib/tz";

export const DEV_DEMO_TABLES = ["payments", "deliveries", "expenses", "dispatches"] as const;
export type DevDemoTable = (typeof DEV_DEMO_TABLES)[number];

type SupabaseClient = {
  from: (table: string) => {
    select: (cols?: string) => any;
    insert: (rows: unknown) => any;
    delete: () => any;
  };
};

type BranchContext = {
  branchId: string;
  routes: Array<{
    id: string;
    driver_id: string;
    customers: Array<{ id: string }>;
  }>;
  products: Array<{ id: string; price: number }>;
};

function dateOffset(base: string, daysAgo: number): string {
  const d = new Date(`${base}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]!;
}

function qty(seed: number, min: number, max: number): number {
  return min + (seed % (max - min + 1));
}

async function trackEntity(
  supabase: SupabaseClient,
  tableName: DevDemoTable,
  recordId: string,
) {
  const { error } = await supabase.from("dev_demo_entities").insert({
    table_name: tableName,
    record_id: recordId,
  });
  if (error) throw new Error(error.message);
}

async function loadBranchContext(
  supabase: SupabaseClient,
  branchId: string,
): Promise<BranchContext> {
  const { data: routes, error: rErr } = await supabase
    .from("routes")
    .select("id, driver_id")
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .not("driver_id", "is", null);
  if (rErr) throw new Error(rErr.message);

  const routeRows = (routes ?? []).filter((r: { driver_id: string | null }) => r.driver_id);
  if (routeRows.length === 0) {
    throw new Error("Necesitas al menos una ruta activa con repartidor asignado.");
  }

  const routesWithCustomers: BranchContext["routes"] = [];
  for (const route of routeRows) {
    const { data: stops, error: sErr } = await supabase
      .from("route_customers")
      .select("customers(id)")
      .eq("route_id", route.id)
      .order("position", { ascending: true })
      .limit(12);
    if (sErr) throw new Error(sErr.message);
    const customers = (stops ?? [])
      .map((s: { customers: { id: string } | null }) => s.customers)
      .filter(Boolean) as Array<{ id: string }>;
    if (customers.length === 0) continue;
    routesWithCustomers.push({
      id: route.id as string,
      driver_id: route.driver_id as string,
      customers,
    });
  }

  if (routesWithCustomers.length === 0) {
    throw new Error("Las rutas activas necesitan clientes asignados.");
  }

  const { data: products, error: pErr } = await supabase
    .from("products")
    .select("id, price")
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .limit(12);
  if (pErr) throw new Error(pErr.message);
  if (!products?.length) {
    throw new Error("Necesitas productos activos en el catálogo.");
  }

  return {
    branchId,
    routes: routesWithCustomers,
    products: products.map((p: { id: string; price: number }) => ({
      id: p.id,
      price: Number(p.price),
    })),
  };
}

async function seedDayForRoute(
  supabase: SupabaseClient,
  ctx: BranchContext,
  route: BranchContext["routes"][number],
  dateStr: string,
  daySeed: number,
  dispatchedBy: string,
) {
  const dispatchProducts = ctx.products.slice(0, Math.min(5, ctx.products.length));
  const dispatchHour = 6 + (daySeed % 3);
  const dispatchedAt = tzWallToUtcISO(dateStr, `${String(dispatchHour).padStart(2, "0")}:15:00`);

  const { data: dispatch, error: dErr } = await supabase
    .from("dispatches")
    .insert({
      branch_id: ctx.branchId,
      route_id: route.id,
      driver_id: route.driver_id,
      dispatched_by: dispatchedBy,
      dispatched_at: dispatchedAt,
      notes: "Despacho demo",
    })
    .select("id")
    .single();
  if (dErr) throw new Error(dErr.message);
  const dispatchId = dispatch.id as string;
  await trackEntity(supabase, "dispatches", dispatchId);

  const dispatchItems = dispatchProducts.map((p, i) => ({
    dispatch_id: dispatchId,
    product_id: p.id,
    quantity: qty(daySeed + i, 20, 80),
  }));
  const { error: diErr } = await supabase.from("dispatch_items").insert(dispatchItems);
  if (diErr) throw new Error(diErr.message);

  const methods = ["cash", "transfer", "credit", "other"] as const;
  const statuses = ["delivered", "delivered", "delivered", "pending", "failed"] as const;
  const visitHourBase = 8 + (daySeed % 4);

  for (let i = 0; i < route.customers.length; i++) {
    const customer = route.customers[i]!;
    const seed = daySeed * 17 + i * 31;

    const { data: existingDel } = await supabase
      .from("deliveries")
      .select("id")
      .eq("route_id", route.id)
      .eq("customer_id", customer.id)
      .eq("delivery_date", dateStr)
      .maybeSingle();
    if (existingDel) continue;

    const status = pick(statuses, seed);
    const itemCount = 1 + (seed % 3);
    const chosenProducts = Array.from({ length: itemCount }, (_, j) =>
      pick(ctx.products, seed + j),
    );

    const itemLines = chosenProducts.map((p, j) => ({
      product_id: p.id,
      quantity: qty(seed + j, 2, 12),
      unit_price: p.price,
    }));

    const { data: delivery, error: delErr } = await supabase
      .from("deliveries")
      .insert({
        branch_id: ctx.branchId,
        route_id: route.id,
        customer_id: customer.id,
        driver_id: route.driver_id,
        delivery_date: dateStr,
        status,
        comment: status === "failed" ? "Cliente no disponible (demo)" : null,
      })
      .select("id")
      .single();
    if (delErr) throw new Error(delErr.message);
    const deliveryId = delivery.id as string;
    await trackEntity(supabase, "deliveries", deliveryId);

    const { error: itemsErr } = await supabase.from("delivery_items").insert(
      itemLines.map((line) => ({ delivery_id: deliveryId, ...line })),
    );
    if (itemsErr) throw new Error(itemsErr.message);

    const withReturns = status === "delivered" && seed % 4 === 0 && itemLines.length > 0;
    const returnLine = withReturns ? pick(itemLines, seed) : null;
    if (returnLine) {
      const { error: retErr } = await supabase.from("delivery_returns").insert({
        delivery_id: deliveryId,
        product_id: returnLine.product_id,
        quantity: Math.min(2, returnLine.quantity),
      });
      if (retErr) throw new Error(retErr.message);
    }

    const totals = deliveryNetTotals(
      itemLines,
      returnLine
        ? [{ product_id: returnLine.product_id, quantity: Math.min(2, returnLine.quantity), unit_price: returnLine.unit_price }]
        : [],
    );

    if (status === "delivered" && totals.netAmount > 0) {
      const method = pick(methods, seed);
      const payStatus = method === "credit" && seed % 3 === 0 ? "pending" : "paid";
      const paidAt = tzWallToUtcISO(
        dateStr,
        `${String(visitHourBase + (i % 5)).padStart(2, "0")}:${String((seed % 50) + 10).padStart(2, "0")}:00`,
      );
      const { data: payment, error: payErr } = await supabase
        .from("payments")
        .insert({
          branch_id: ctx.branchId,
          route_id: route.id,
          customer_id: customer.id,
          driver_id: route.driver_id,
          delivery_id: deliveryId,
          amount: Number(totals.netAmount.toFixed(2)),
          method,
          status: payStatus,
          paid_at: paidAt,
          note: payStatus === "pending" ? "Pago pendiente demo" : null,
        })
        .select("id")
        .single();
      if (payErr) throw new Error(payErr.message);
      await trackEntity(supabase, "payments", payment.id as string);
    }
  }

  if (daySeed === 0 && dispatchProducts.length > 1) {
    const { error: trErr } = await supabase.from("truck_returns").insert({
      dispatch_id: dispatchId,
      product_id: dispatchProducts[1]!.id,
      quantity: 2,
      returned_by: route.driver_id,
    });
    if (trErr) throw new Error(trErr.message);
  }

  const expenseAmount = 35 + qty(daySeed, 10, 120);
  const { data: expense, error: expErr } = await supabase
    .from("expenses")
    .insert({
      branch_id: ctx.branchId,
      route_id: route.id,
      driver_id: route.driver_id,
      amount: expenseAmount,
      description: "Gasto operativo demo",
      expense_date: dateStr,
    })
    .select("id")
    .single();
  if (expErr) throw new Error(expErr.message);
  await trackEntity(supabase, "expenses", expense.id as string);
}

export async function seedDevDemoData(
  supabase: SupabaseClient,
  branchId: string,
  userId: string,
): Promise<{ days: number; routes: number; branchId: string }> {
  await clearDevDemoData(supabase);

  const ctx = await loadBranchContext(supabase, branchId);
  const today = todayInTZ();
  const dayCount = 7;

  for (let daysAgo = dayCount - 1; daysAgo >= 0; daysAgo--) {
    const dateStr = dateOffset(today, daysAgo);
    for (let r = 0; r < ctx.routes.length; r++) {
      await seedDayForRoute(supabase, ctx, ctx.routes[r]!, dateStr, daysAgo * 10 + r, userId);
    }
  }

  const extraCustomer = ctx.routes[0]!.customers[0]!;
  const extraRoute = ctx.routes[0]!;
  const { data: extraPay, error: extraErr } = await supabase
    .from("payments")
    .insert({
      branch_id: ctx.branchId,
      route_id: extraRoute.id,
      customer_id: extraCustomer.id,
      driver_id: extraRoute.driver_id,
      amount: 520,
      method: "credit",
      status: "pending",
      paid_at: tzWallToUtcISO(today, "11:30:00"),
      note: "Crédito pendiente demo",
    })
    .select("id")
    .single();
  if (extraErr) throw new Error(extraErr.message);
  await trackEntity(supabase, "payments", extraPay.id as string);

  return { days: dayCount, routes: ctx.routes.length, branchId };
}

export async function clearDevDemoData(supabase: SupabaseClient): Promise<{ removed: number }> {
  const { data: rows, error } = await supabase
    .from("dev_demo_entities")
    .select("table_name, record_id");
  if (error) throw new Error(error.message);

  const byTable = new Map<DevDemoTable, string[]>();
  for (const t of DEV_DEMO_TABLES) byTable.set(t, []);
  for (const row of rows ?? []) {
    const table = row.table_name as DevDemoTable;
    if (byTable.has(table)) byTable.get(table)!.push(row.record_id as string);
  }

  for (const id of byTable.get("payments") ?? []) {
    const { error: e } = await supabase.from("payments").delete().eq("id", id);
    if (e) throw new Error(e.message);
  }
  for (const id of byTable.get("deliveries") ?? []) {
    const { error: e } = await supabase.from("deliveries").delete().eq("id", id);
    if (e) throw new Error(e.message);
  }
  for (const id of byTable.get("expenses") ?? []) {
    const { error: e } = await supabase.from("expenses").delete().eq("id", id);
    if (e) throw new Error(e.message);
  }
  for (const id of byTable.get("dispatches") ?? []) {
    const { error: e } = await supabase.from("dispatches").delete().eq("id", id);
    if (e) throw new Error(e.message);
  }

  const { error: clearErr } = await supabase.from("dev_demo_entities").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (clearErr) throw new Error(clearErr.message);

  return { removed: (rows ?? []).length };
}

export async function getDevDemoStatus(supabase: SupabaseClient): Promise<{
  active: boolean;
  counts: Record<DevDemoTable, number>;
  total: number;
}> {
  const { data, error } = await supabase.from("dev_demo_entities").select("table_name");
  if (error) throw new Error(error.message);

  const counts: Record<DevDemoTable, number> = {
    dispatches: 0,
    deliveries: 0,
    payments: 0,
    expenses: 0,
  };
  for (const row of data ?? []) {
    const t = row.table_name as DevDemoTable;
    if (t in counts) counts[t] += 1;
  }
  const total = Object.values(counts).reduce((a, n) => a + n, 0);
  return { active: total > 0, counts, total };
}
