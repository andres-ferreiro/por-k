import { APP_LOCALE } from "@/lib/tz";
import type { DateRange } from "react-day-picker";

/** Parse YYYY-MM-DD as a stable calendar date (noon UTC). */
export function parseDateStr(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00Z`);
}

/** Format a Date as YYYY-MM-DD. */
export function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Short display label, e.g. "11 jun". */
export function fmtDateShort(dateStr: string): string {
  return parseDateStr(dateStr).toLocaleDateString(APP_LOCALE, {
    day: "numeric",
    month: "short",
  });
}

/** Medium display label, e.g. "11/06/2026". */
export function fmtDateMedium(dateStr: string): string {
  return parseDateStr(dateStr).toLocaleDateString(APP_LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function dateRangeToStrings(range: DateRange | undefined): { from: string; to: string } | null {
  if (!range?.from) return null;
  const from = toDateStr(range.from);
  const to = range.to ? toDateStr(range.to) : from;
  return { from, to };
}

/** Round to 2 decimal places, avoiding float display artifacts. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Quantity / unit counts — max 2 decimals, no trailing zeros. */
export function fmtQty(n: number): string {
  const r = round2(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, "");
}

/** Currency — always 2 decimals. */
export function fmtMoney(n: number): string {
  return new Intl.NumberFormat(APP_LOCALE, {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(round2(n) || 0);
}
