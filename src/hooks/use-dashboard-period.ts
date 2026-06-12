import { useState, useMemo } from "react";
import { todayInTZ } from "@/lib/tz";

export type Period = "day" | "week" | "month" | "year" | "custom";
export type DateRange = { from: string; to: string };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

function addMonths(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return isoDate(d);
}

/** Return Monday of the week containing dateStr (weeks start Mon) */
function weekStart(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun 1=Mon ... 6=Sat
  const diff = dow === 0 ? -6 : 1 - dow; // shift to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return isoDate(d);
}

function computeRanges(
  period: Period,
  today: string,
  custom: DateRange | null,
): { current: DateRange; previous: DateRange } {
  if (period === "day") {
    return {
      current: { from: today, to: today },
      previous: { from: addDays(today, -1), to: addDays(today, -1) },
    };
  }
  if (period === "week") {
    const mon = weekStart(today);
    const sun = addDays(mon, 6);
    return {
      current: { from: mon, to: sun },
      previous: { from: addDays(mon, -7), to: addDays(sun, -7) },
    };
  }
  if (period === "month") {
    const [y, m] = today.split("-").map(Number);
    const firstDay = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
    const nextMonthFirst = addMonths(firstDay, 1);
    const lastDay = addDays(nextMonthFirst, -1);
    const prevFirst = addMonths(firstDay, -1);
    const prevLast = addDays(firstDay, -1);
    return {
      current: { from: firstDay, to: lastDay },
      previous: { from: prevFirst, to: prevLast },
    };
  }
  if (period === "year") {
    const y = today.slice(0, 4);
    return {
      current: { from: `${y}-01-01`, to: `${y}-12-31` },
      previous: { from: `${Number(y) - 1}-01-01`, to: `${Number(y) - 1}-12-31` },
    };
  }
  // custom
  if (custom) {
    const durMs =
      new Date(custom.to + "T12:00:00Z").getTime() -
      new Date(custom.from + "T12:00:00Z").getTime();
    const durDays = Math.round(durMs / 86_400_000);
    return {
      current: custom,
      previous: {
        from: addDays(custom.from, -(durDays + 1)),
        to: addDays(custom.from, -1),
      },
    };
  }
  // fallback
  return {
    current: { from: today, to: today },
    previous: { from: addDays(today, -1), to: addDays(today, -1) },
  };
}

export function useDashboardPeriod(defaultPeriod: Period = "day") {
  const today = todayInTZ();
  const [period, setPeriod] = useState<Period>(defaultPeriod);
  const [custom, setCustom] = useState<DateRange | null>(null);

  const { current, previous } = useMemo(
    () => computeRanges(period, today, custom),
    [period, today, custom],
  );

  return {
    period,
    setPeriod,
    currentRange: current,
    previousRange: previous,
    customRange: custom,
    setCustomRange: setCustom,
  };
}
