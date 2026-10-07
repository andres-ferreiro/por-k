// Pure money helpers for customer accounts (no server / React imports).
// Shared by server functions and UI so every screen shows the same numbers.

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export type ReceivedPreset = "all" | "sale" | "none";

/**
 * What the customer owes at the end of a visit.
 *   total   = sale of this visit (net of returns)
 *   previous = balance before this visit
 *   received = cash handed over (may exceed total: the excess pays old debt)
 */
export function visitBalance(total: number, previous: number, received: number) {
  const due = round2(total + previous);
  const left = round2(due - received);
  return { due, left, exceeds: received > due + 0.004 };
}

/** Value for the quick buttons of the "Recibido" field. */
export function presetAmount(preset: ReceivedPreset, total: number, previous: number): number {
  if (preset === "all") return round2(total + previous);
  if (preset === "sale") return round2(total);
  return 0;
}

/** Parses what the user typed ("1,250.5", "$300") into a non-negative amount. */
export function parseMoneyInput(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const parts = cleaned.split(".");
  const normalized = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}` : parts[0];
  const n = Number(normalized);
  return Number.isFinite(n) ? round2(n) : 0;
}

// ---------------------------------------------------------------------------
// Aging (estimated)
// ---------------------------------------------------------------------------

export type AgingBuckets = {
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
};

export const emptyAging = (): AgingBuckets => ({ d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 });

export type OutstandingRow = {
  /** YYYY-MM-DD of the sale */
  date: string;
  /** unpaid part of that sale */
  amount: number;
};

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * Estimates how old a customer's debt is.
 *
 * The ledger keeps one running balance per customer (no payment is tied to a specific
 * sale), so this is an estimate: take the unpaid sale rows, drop the oldest first until
 * the total matches the real balance (adjustments and over-payments), and bucket by age.
 * If the balance is larger than the rows explain (positive adjustments), the remainder
 * counts as "today".
 */
export function estimateAging(
  rows: OutstandingRow[],
  balance: number,
  today: string,
): { buckets: AgingBuckets; oldestDate: string | null; newestDate: string | null } {
  const sorted = rows
    .filter((r) => r.amount > 0)
    .map((r) => ({ ...r }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const sum = round2(sorted.reduce((s, r) => s + r.amount, 0));
  const target = round2(Math.max(0, balance));

  if (sum > target) {
    let excess = round2(sum - target);
    for (const r of sorted) {
      if (excess <= 0) break;
      const cut = Math.min(r.amount, excess);
      r.amount = round2(r.amount - cut);
      excess = round2(excess - cut);
    }
  } else if (sum < target) {
    sorted.push({ date: today, amount: round2(target - sum) });
  }

  const buckets = emptyAging();
  let oldest: string | null = null;
  let newest: string | null = null;
  for (const r of sorted) {
    if (r.amount <= 0) continue;
    const age = daysBetween(r.date, today);
    if (age <= 30) buckets.d0_30 = round2(buckets.d0_30 + r.amount);
    else if (age <= 60) buckets.d31_60 = round2(buckets.d31_60 + r.amount);
    else if (age <= 90) buckets.d61_90 = round2(buckets.d61_90 + r.amount);
    else buckets.d90_plus = round2(buckets.d90_plus + r.amount);
    if (!oldest || r.date < oldest) oldest = r.date;
    if (!newest || r.date > newest) newest = r.date;
  }
  return { buckets, oldestDate: oldest, newestDate: newest };
}

export const over60 = (a: AgingBuckets): number => round2(a.d61_90 + a.d90_plus);

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export type MovementKind = "opening" | "sale" | "payment" | "adjustment";

export type AccountMovement = {
  id: string;
  kind: MovementKind;
  /** > 0 the customer owes more, < 0 the customer paid */
  amount: number;
  method: "cash" | "transfer" | "credit" | "other" | null;
  note: string | null;
  occurred_on: string;
  created_at: string;
  /** balance right after this movement */
  balance: number;
};

/** Oldest first in, with running balance. */
export function withRunningBalance<T extends { amount: number }>(
  ascending: T[],
): Array<T & { balance: number }> {
  let running = 0;
  return ascending.map((m) => {
    running = round2(running + Number(m.amount));
    return { ...m, balance: running };
  });
}
