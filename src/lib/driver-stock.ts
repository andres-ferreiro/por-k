import type { SupabaseClient } from "@supabase/supabase-js";
import { todayInTZ, tzDayRange } from "@/lib/tz";

/**
 * Driver sellable stock — single source of truth.
 *
 * All driver stock display (getMyDispatchStock) and enforcement (saveDeliveryVisit)
 * must use fetchDriverDayStock / computeAvailableStock from this module.
 *
 * SELLABLE formula:
 *   available = sum(all dispatches today) + cross-branch loads − delivery_items
 *
 * Customer returns (delivery_returns) do NOT reduce available fresh stock because:
 *   - Stores return unsold bread back to the driver (no replacement is given).
 *   - The returned units physically come back to the truck.
 *   - Only the per-store charge is adjusted (gross − returns = net cobro).
 *   - The driver's fresh sellable stock is only reduced by actual sales (delivery_items).
 */

/** Per-product quantity map keyed by product_id. */
export type ProductQuantityMap = Record<string, number>;

export type DriverDayStock = {
  /** Most recent dispatch id today (null if none). */
  dispatch_id: string | null;
  /** Units available to sell per product: loaded − delivery_items. */
  stock: ProductQuantityMap;
  total_units: number;
  /** Internal breakdown — used by assertSaleWithinStock for error messages. */
  loaded: ProductQuantityMap;
  sold: ProductQuantityMap;
};

type ItemRow = { product_id: string; quantity: number | string };

/** Sum quantity rows into a per-product map. */
export function sumProductQuantities(rows: ItemRow[]): ProductQuantityMap {
  const map: ProductQuantityMap = {};
  for (const row of rows) {
    map[row.product_id] = (map[row.product_id] ?? 0) + Number(row.quantity ?? 0);
  }
  return map;
}

/** Merge two per-product maps (sums quantities). */
export function mergeProductQuantities(a: ProductQuantityMap, b: ProductQuantityMap): ProductQuantityMap {
  const out = { ...a };
  for (const [pid, qty] of Object.entries(b)) {
    out[pid] = (out[pid] ?? 0) + qty;
  }
  return out;
}

/**
 * Sellable units remaining = loaded − sold (delivery_items).
 * Customer returns are NOT subtracted — returned bread comes back to the truck and
 * only affects the per-store charge, not the driver's fresh sellable stock.
 * Only products present in `loaded` appear in the result (even when available is 0).
 */
export function computeAvailableStock(
  loaded: ProductQuantityMap,
  sold: ProductQuantityMap,
): ProductQuantityMap {
  const stock: ProductQuantityMap = {};
  for (const [pid, loadQty] of Object.entries(loaded)) {
    stock[pid] = Math.max(0, loadQty - (sold[pid] ?? 0));
  }
  return stock;
}

export function totalUnits(stock: ProductQuantityMap): number {
  return Object.values(stock).reduce((a, b) => a + b, 0);
}

type FetchDriverDayStockParams = {
  routeId: string;
  driverId: string;
  date?: string;
  /** When re-editing a visit, exclude this delivery from sold/returns tallies. */
  excludeDeliveryId?: string | null;
};

/**
 * Single source of truth for driver sellable stock on a route/day.
 * Aggregates ALL dispatches (top-ups), cross-branch loads, sales, and customer returns.
 */
export async function fetchDriverDayStock(
  supabase: SupabaseClient,
  params: FetchDriverDayStockParams,
): Promise<DriverDayStock> {
  const date = params.date ?? todayInTZ();
  const { startISO, endISO } = tzDayRange(date);

  const { data: dispatches, error: dErr } = await supabase
    .from("dispatches")
    .select("id, dispatched_at, dispatch_items(product_id, quantity)")
    .eq("route_id", params.routeId)
    .eq("driver_id", params.driverId)
    .gte("dispatched_at", startISO)
    .lt("dispatched_at", endISO)
    .order("dispatched_at", { ascending: false });
  if (dErr) throw new Error(dErr.message);

  let dispatchId: string | null = null;
  let loaded: ProductQuantityMap = {};

  if (dispatches && dispatches.length > 0) {
    dispatchId = dispatches[0].id as string;
    for (const dispatch of dispatches) {
      const items = (dispatch.dispatch_items ?? []) as ItemRow[];
      loaded = mergeProductQuantities(loaded, sumProductQuantities(items));
    }
  }

  const { data: crossLoads, error: clErr } = await supabase
    .from("cross_branch_loads")
    .select("id, cross_branch_load_items(product_id, quantity)")
    .eq("driver_id", params.driverId)
    .gte("created_at", startISO)
    .lt("created_at", endISO);
  if (clErr) throw new Error(clErr.message);

  for (const cl of crossLoads ?? []) {
    const items = (cl.cross_branch_load_items ?? []) as ItemRow[];
    loaded = mergeProductQuantities(loaded, sumProductQuantities(items));
  }

  const { data: deliveries, error: delErr } = await supabase
    .from("deliveries")
    .select("id, delivery_items(product_id, quantity)")
    .eq("route_id", params.routeId)
    .eq("driver_id", params.driverId)
    .eq("delivery_date", date)
    .eq("status", "delivered");
  if (delErr) throw new Error(delErr.message);

  const soldRows: ItemRow[] = [];
  for (const del of deliveries ?? []) {
    if (params.excludeDeliveryId && del.id === params.excludeDeliveryId) continue;
    for (const it of (del.delivery_items ?? []) as ItemRow[]) soldRows.push(it);
  }

  const sold = sumProductQuantities(soldRows);
  const stock = computeAvailableStock(loaded, sold);

  return {
    dispatch_id: dispatchId,
    stock,
    total_units: totalUnits(stock),
    loaded,
    sold,
  };
}

type SaleLine = { product_id: string; quantity: number };

/**
 * Enforce sell limits for a delivery save. Throws if any line exceeds available stock.
 */
export function assertSaleWithinStock(
  items: SaleLine[],
  stock: DriverDayStock,
): void {
  for (const item of items) {
    const loadedQty = stock.loaded[item.product_id] ?? 0;
    if (loadedQty === 0) continue;
    const remaining = stock.stock[item.product_id] ?? 0;
    if (item.quantity > remaining) {
      throw new Error(
        `Stock insuficiente: solo te quedan ${remaining} unidad(es) disponible(s) para ese producto.`,
      );
    }
  }
}
