import { APP_TZ, hourInTZ, todayInTZ } from "@/lib/tz";

/** Add calendar days to a YYYY-MM-DD string. */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Whether an order can still be placed for the given delivery date (3pm cutoff day before). */
export function canOrderForDelivery(deliveryDate: string, now: Date = new Date()): boolean {
  const today = todayInTZ(now);
  const hour = hourInTZ(now);
  const deadlineDate = addDays(deliveryDate, -1);
  if (today < deadlineDate) return true;
  if (today > deadlineDate) return false;
  return hour < 15;
}

/** Next N delivery dates that are still open for ordering. */
export function getValidDeliveryDates(count = 3, now: Date = new Date()): string[] {
  const today = todayInTZ(now);
  const dates: string[] = [];
  let cursor = addDays(today, 1);
  while (dates.length < count) {
    if (canOrderForDelivery(cursor, now)) dates.push(cursor);
    cursor = addDays(cursor, 1);
    if (dates.length === 0 && cursor > addDays(today, 14)) break;
  }
  return dates;
}

export function bodegaDeadlineMessage(deliveryDate: string): string {
  const deadlineDate = addDays(deliveryDate, -1);
  return `Ordena antes de las 3:00 PM del ${formatDateLabel(deadlineDate)} para recibir el ${formatDateLabel(deliveryDate)}.`;
}

export function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return dt.toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: APP_TZ,
  });
}

export function assertCanOrderForDelivery(deliveryDate: string, now: Date = new Date()): void {
  if (!canOrderForDelivery(deliveryDate, now)) {
    throw new Error(
      `La hora límite (3:00 PM) para pedidos con entrega el ${formatDateLabel(deliveryDate)} ya pasó.`,
    );
  }
}

export const BODEGA_CUTOFF_HOUR = 15;
