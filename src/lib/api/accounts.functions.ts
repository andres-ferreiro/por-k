import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dateStrInTZ, todayInTZ } from "@/lib/tz";
import {
  estimateAging,
  over60,
  round2,
  withRunningBalance,
  type AccountMovement,
  type AgingBuckets,
  type MovementKind,
  type OutstandingRow,
} from "@/lib/account";

/**
 * Customer account (estado de cuenta). The database keeps the books (see the
 * partial_payments_ledger migration): these functions only call its RPCs and read
 * the ledger. Reads go through the caller's own session, so RLS decides who sees what.
 */

const PAGE = 1000;

/** Reads every row of a query by walking pages (PostgREST caps one response at 1000 rows). */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  maxPages = 20,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const { data, error } = await build(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// ============ ABONO / ADJUSTMENT ============

export const registerCustomerPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        customer_id: z.string().uuid(),
        amount: z.number().positive().max(10_000_000),
        method: z.enum(["cash", "transfer", "other"]),
        note: z.string().trim().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("register_customer_payment", {
      p_customer_id: data.customer_id,
      p_amount: round2(data.amount),
      p_method: data.method,
      p_note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
      ok: true as const,
      payment_id: (row?.payment_id as string | undefined) ?? null,
      new_balance: Number(row?.new_balance ?? 0),
    };
  });

export const adjustCustomerBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        customer_id: z.string().uuid(),
        /** > 0 the customer owes more, < 0 the customer owes less */
        amount: z
          .number()
          .max(10_000_000)
          .min(-10_000_000)
          .refine((n) => n !== 0, "El ajuste no puede ser 0"),
        note: z.string().trim().min(3, "Escribe el motivo del ajuste").max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: balance, error } = await supabase.rpc("adjust_customer_balance", {
      p_customer_id: data.customer_id,
      p_amount: round2(data.amount),
      p_note: data.note,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, new_balance: Number(balance ?? 0) };
  });

// ============ STATEMENT ============

export const getCustomerAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ customer_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const today = todayInTZ();

    const { data: customer, error: cErr } = await supabase
      .from("customers")
      .select("id, name, phone, pending_balance, branch_id")
      .eq("id", data.customer_id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!customer) throw new Error("Cliente no encontrado.");

    const [movementRows, outstandingRows] = await Promise.all([
      fetchAll((from, to) =>
        supabase
          .from("customer_account_movements")
          .select("id, kind, amount, method, note, occurred_on, created_at")
          .eq("customer_id", data.customer_id)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabase
          .from("payments")
          .select("amount, amount_paid, paid_at")
          .eq("customer_id", data.customer_id)
          .eq("is_abono", false)
          .eq("status", "pending")
          .order("paid_at", { ascending: true })
          .range(from, to),
      ),
    ]);

    const asc = withRunningBalance(
      movementRows.map((m) => ({
        id: m.id as string,
        kind: m.kind as MovementKind,
        amount: Number(m.amount),
        method: (m.method as AccountMovement["method"]) ?? null,
        note: (m.note as string | null) ?? null,
        occurred_on: m.occurred_on as string,
        created_at: m.created_at as string,
      })),
    );

    const balance = Number(customer.pending_balance ?? 0);
    const rows: OutstandingRow[] = outstandingRows.map((p) => ({
      date: dateStrInTZ(p.paid_at as string),
      amount: round2(Number(p.amount) - Number(p.amount_paid)),
    }));
    const aging = estimateAging(rows, balance, today);

    const lastPayment = [...asc].reverse().find((m) => m.kind === "payment" && m.amount < 0);

    return {
      customer: {
        id: customer.id as string,
        name: customer.name as string,
        phone: (customer.phone as string | null) ?? null,
        branch_id: customer.branch_id as string,
        balance,
      },
      /** newest first */
      movements: [...asc].reverse() as AccountMovement[],
      aging: aging.buckets,
      last_payment_on: lastPayment?.occurred_on ?? null,
      /** Ledger and cached balance should always match; the UI warns if they do not. */
      ledger_balance: asc.length ? asc[asc.length - 1].balance : 0,
    };
  });

// ============ RECEIVABLES (admin "Cuentas por cobrar") ============

export type ReceivableRow = {
  customer_id: string;
  name: string;
  phone: string | null;
  branch_id: string;
  branch_name: string | null;
  category: string;
  balance: number;
  aging: AgingBuckets;
  oldest_sale: string | null;
  last_delivery_on: string | null;
  last_payment_on: string | null;
};

export const getReceivables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const today = todayInTZ();

    const customers = await fetchAll((from, to) =>
      supabase
        .from("customers")
        .select("id, name, phone, branch_id, category, pending_balance, branches(name)")
        .gt("pending_balance", 0)
        .order("pending_balance", { ascending: false })
        .range(from, to),
    );
    const ids = customers.map((c) => c.id as string);

    const outstandingByCustomer = new Map<string, OutstandingRow[]>();
    const lastDelivery = new Map<string, string>();
    const lastPayment = new Map<string, string>();

    // `.in()` goes in the URL: keep each call small.
    await Promise.all(
      chunk(ids, 80).map(async (group) => {
        const [pays, dels, movs] = await Promise.all([
          fetchAll((from, to) =>
            supabase
              .from("payments")
              .select("customer_id, amount, amount_paid, paid_at")
              .in("customer_id", group)
              .eq("is_abono", false)
              .eq("status", "pending")
              .range(from, to),
          ),
          fetchAll(
            (from, to) =>
              supabase
                .from("deliveries")
                .select("customer_id, delivery_date")
                .in("customer_id", group)
                .eq("status", "delivered")
                .order("delivery_date", { ascending: false })
                .range(from, to),
            6,
          ),
          fetchAll((from, to) =>
            supabase
              .from("customer_account_movements")
              .select("customer_id, occurred_on")
              .in("customer_id", group)
              .eq("kind", "payment")
              .lt("amount", 0)
              .order("occurred_on", { ascending: false })
              .range(from, to),
          ),
        ]);

        for (const p of pays) {
          const list = outstandingByCustomer.get(p.customer_id as string) ?? [];
          list.push({
            date: dateStrInTZ(p.paid_at as string),
            amount: round2(Number(p.amount) - Number(p.amount_paid)),
          });
          outstandingByCustomer.set(p.customer_id as string, list);
        }
        for (const d of dels) {
          if (!lastDelivery.has(d.customer_id as string)) {
            lastDelivery.set(d.customer_id as string, d.delivery_date as string);
          }
        }
        for (const m of movs) {
          if (!lastPayment.has(m.customer_id as string)) {
            lastPayment.set(m.customer_id as string, m.occurred_on as string);
          }
        }
      }),
    );

    const rows: ReceivableRow[] = customers.map((c) => {
      const balance = Number(c.pending_balance);
      const est = estimateAging(outstandingByCustomer.get(c.id as string) ?? [], balance, today);
      return {
        customer_id: c.id as string,
        name: c.name as string,
        phone: (c.phone as string | null) ?? null,
        branch_id: c.branch_id as string,
        branch_name: (c as any).branches?.name ?? null,
        category: (c.category as string) ?? "retail",
        balance,
        aging: est.buckets,
        oldest_sale: est.oldestDate,
        last_delivery_on: lastDelivery.get(c.id as string) ?? null,
        last_payment_on: lastPayment.get(c.id as string) ?? null,
      };
    });

    // Abonos registered this calendar month (standalone payments).
    const monthStart = `${today.slice(0, 7)}-01`;
    const abonoRows = await fetchAll((from, to) =>
      supabase
        .from("payments")
        .select("amount, branch_id, paid_at")
        .eq("is_abono", true)
        // Loose lower bound (Juárez is UTC-6/-7 depending on DST); exact check below.
        .gte("paid_at", `${monthStart}T00:00:00-12:00`)
        .range(from, to),
    );
    const abonosByBranch = new Map<string, number>();
    for (const a of abonoRows) {
      if (dateStrInTZ(a.paid_at as string) < monthStart) continue;
      abonosByBranch.set(
        a.branch_id as string,
        round2((abonosByBranch.get(a.branch_id as string) ?? 0) + Number(a.amount)),
      );
    }

    return {
      today,
      rows,
      abonos_month_by_branch: Object.fromEntries(abonosByBranch),
      // Recomputed on the client when a branch filter is applied.
      totals: rows.reduce(
        (acc, r) => ({
          balance: round2(acc.balance + r.balance),
          over60: round2(acc.over60 + over60(r.aging)),
        }),
        { balance: 0, over60: 0 },
      ),
    };
  });
