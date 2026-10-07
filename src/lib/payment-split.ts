/**
 * A payment can be fully paid, unpaid, or partially paid (status "pending" with
 * amount_paid > 0). Reports must count the received part as collected and only
 * the rest as pending. `amount` is passed in separately because some reports
 * recompute it from the delivery items (net of returns).
 */
export function paymentSplit(
  p: { status?: string | null; amount_paid?: number | string | null },
  amount: number,
): { collected: number; pending: number } {
  if (p.status === "paid") return { collected: amount, pending: 0 };
  const got = Math.min(Math.max(Number(p.amount_paid ?? 0), 0), amount);
  return { collected: got, pending: Math.round((amount - got) * 100) / 100 };
}

/** What admin screens show: a pending payment with money already received is "partial". */
export function paymentDisplayStatus(
  p: { status?: string | null; amount_paid?: number | string | null },
): "paid" | "pending" | "partial" {
  if (p.status === "paid") return "paid";
  return Number(p.amount_paid ?? 0) > 0 ? "partial" : "pending";
}
