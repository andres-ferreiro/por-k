import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Customer account statement ("estado de cuenta").
 * The database keeps the books (customer_account_movements is append-only and
 * written by triggers). These functions only READ it, and register abonos through
 * the register_customer_payment RPC, which checks permissions itself.
 * Nothing here touches the sell/return/visit flow.
 */

export type AccountMovementKind = "opening" | "sale" | "payment" | "adjustment";

export type AccountMovement = {
  id: string;
  kind: AccountMovementKind;
  /** > 0 customer owes more, < 0 customer paid */
  amount: number;
  method: string | null;
  note: string | null;
  occurred_on: string;
  created_at: string;
  /** balance right after this movement */
  balance: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export const getCustomerAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ customer_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any; // ledger table is not in the generated types

    const { data: customer, error: cErr } = await supabase
      .from("customers")
      .select("id, name, phone, pending_balance")
      .eq("id", data.customer_id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!customer) throw new Error("Cliente no encontrado.");

    const { data: rows, error } = await supabase
      .from("customer_account_movements")
      .select("id, kind, amount, method, note, occurred_on, created_at")
      .eq("customer_id", data.customer_id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);

    let running = 0;
    const asc: AccountMovement[] = (rows ?? []).map((m: any) => {
      running = round2(running + Number(m.amount));
      return {
        id: m.id as string,
        kind: m.kind as AccountMovementKind,
        amount: Number(m.amount),
        method: (m.method as string | null) ?? null,
        note: (m.note as string | null) ?? null,
        occurred_on: m.occurred_on as string,
        created_at: m.created_at as string,
        balance: running,
      };
    });

    return {
      customer: {
        id: customer.id as string,
        name: customer.name as string,
        phone: (customer.phone as string | null) ?? null,
        balance: Number(customer.pending_balance ?? 0),
      },
      movements: asc.reverse(), // newest first
    };
  });

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
    const { data: rows, error } = await (context.supabase as any).rpc("register_customer_payment", {
      p_customer_id: data.customer_id,
      p_amount: round2(data.amount),
      p_method: data.method,
      p_note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { ok: true as const, new_balance: Number(row?.new_balance ?? 0) };
  });
