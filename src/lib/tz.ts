// Local timezone for the business (Ciudad Juárez, Chihuahua, México).
// Cd. Juárez observes US DST (MST/MDT), unlike the rest of Chihuahua.
export const APP_TZ = "America/Ciudad_Juarez";
export const APP_LOCALE = "es-MX";

// Returns YYYY-MM-DD in APP_TZ for the given date (default: now).
export function todayInTZ(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

// Convert a wall-clock YYYY-MM-DD HH:mm:ss in APP_TZ to a UTC ISO string.
export function tzWallToUtcISO(dateStr: string, time: string = "00:00:00"): string {
  // Compute the UTC offset (in minutes) for APP_TZ at the given local instant.
  const naive = new Date(`${dateStr}T${time}Z`); // tentative UTC
  const offsetMin = tzOffsetMinutes(naive, APP_TZ);
  return new Date(naive.getTime() - offsetMin * 60_000).toISOString();
}

// Offset between APP_TZ and UTC at a given instant, in minutes (e.g. -360 for MDT).
function tzOffsetMinutes(at: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour === "24" ? "0" : map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return (asUTC - at.getTime()) / 60_000;
}

// Compute the UTC ISO range [start, end) for a calendar day in APP_TZ.
export function tzDayRange(dateStr: string): { startISO: string; endISO: string } {
  const startISO = tzWallToUtcISO(dateStr, "00:00:00");
  const next = new Date(`${dateStr}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextStr = next.toISOString().slice(0, 10);
  const endISO = tzWallToUtcISO(nextStr, "00:00:00");
  return { startISO, endISO };
}
