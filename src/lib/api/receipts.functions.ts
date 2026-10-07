import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { deliveryNetTotals } from "@/lib/delivery-totals";
import { APP_NAME } from "@/lib/brand";
import type { ReceiptData, ReceiptLine, ReceiptPaymentMethod } from "@/lib/receipt/types";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Read-only: everything needed to print a customer receipt for one of the driver's own
 * deliveries. Does not write anything.
 */
export const getDeliveryReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ delivery_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ReceiptData> => {
    const { supabase, userId } = context;

    const { data: del, error } = await supabase
      .from("deliveries")
      .select(
        "id, status, updated_at, branch_id, customer_id, driver_id, customers(name, phone, pending_balance), branches(name, address, phone)",
      )
      .eq("id", data.delivery_id)
      .eq("driver_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!del) throw new Error("No se encontró la entrega.");
    if ((del as any).status !== "delivered") {
      throw new Error("Solo se pueden imprimir recibos de entregas completadas.");
    }

    const [itemsRes, returnsRes, payRes, profileRes] = await Promise.all([
      supabase
        .from("delivery_items")
        .select("product_id, quantity, unit_price, line_total")
        .eq("delivery_id", data.delivery_id),
      supabase
        .from("delivery_returns")
        .select("product_id, quantity")
        .eq("delivery_id", data.delivery_id),
      supabase
        .from("payments")
        .select("method, status, amount_paid")
        .eq("delivery_id", data.delivery_id)
        .maybeSingle(),
      supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    ]);
    if (itemsRes.error) throw new Error(itemsRes.error.message);
    if (returnsRes.error) throw new Error(returnsRes.error.message);

    const rawItems = (itemsRes.data ?? []) as any[];
    const rawReturns = (returnsRes.data ?? []) as any[];

    const productIds = Array.from(
      new Set([...rawItems.map((i) => i.product_id), ...rawReturns.map((r) => r.product_id)]),
    ).filter(Boolean) as string[];
    const productMap = new Map<string, { name: string; unit: string }>();
    if (productIds.length > 0) {
      const { data: prods, error: pErr } = await supabase
        .from("products")
        .select("id, name, unit")
        .in("id", productIds);
      if (pErr) throw new Error(pErr.message);
      for (const p of (prods ?? []) as any[]) {
        productMap.set(p.id, { name: p.name ?? "Producto", unit: p.unit ?? "" });
      }
    }

    const priceByProduct = new Map<string, number>();
    for (const i of rawItems) priceByProduct.set(i.product_id, Number(i.unit_price));

    const items: ReceiptLine[] = rawItems.map((i) => {
      const meta = productMap.get(i.product_id);
      const quantity = Number(i.quantity);
      const unitPrice = Number(i.unit_price);
      return {
        name: meta?.name ?? "Producto",
        unit: meta?.unit ?? "",
        quantity,
        unitPrice,
        amount: round2(i.line_total != null ? Number(i.line_total) : quantity * unitPrice),
      };
    });

    const returns: ReceiptLine[] = rawReturns.map((r) => {
      const meta = productMap.get(r.product_id);
      const quantity = Number(r.quantity);
      const unitPrice = priceByProduct.get(r.product_id) ?? 0;
      return {
        name: meta?.name ?? "Producto",
        unit: meta?.unit ?? "",
        quantity,
        unitPrice,
        amount: round2(quantity * unitPrice),
      };
    });

    const totals = deliveryNetTotals(
      rawItems.map((i) => ({
        product_id: i.product_id,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        line_total: i.line_total != null ? Number(i.line_total) : null,
      })),
      rawReturns.map((r) => ({ product_id: r.product_id, quantity: Number(r.quantity) })),
    );

    const customer = (del as any).customers;
    const branch = (del as any).branches;
    const pay = payRes.data as {
      method: ReceiptPaymentMethod;
      status: "paid" | "pending";
      amount_paid: number | string;
    } | null;

    return {
      folio: String(del.id).replace(/-/g, "").slice(-6).toUpperCase(),
      businessName: APP_NAME,
      branchName: branch?.name ?? null,
      branchAddress: branch?.address ?? null,
      branchPhone: branch?.phone ?? null,
      issuedAt: (del as any).updated_at as string,
      customerName: customer?.name ?? "Cliente",
      customerPhone: customer?.phone ?? null,
      driverName: (profileRes.data as any)?.full_name ?? null,
      items,
      returns,
      grossAmount: round2(totals.grossAmount),
      returnAmount: round2(totals.returnAmount),
      total: round2(totals.netAmount),
      payment: pay
        ? { method: pay.method, status: pay.status, amountPaid: round2(Number(pay.amount_paid ?? 0)) }
        : null,
      currentBalance: round2(Number(customer?.pending_balance ?? 0)),
    };
  });
