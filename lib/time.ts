// Timezone-aware "start of today". The teacher's daily report must use the
// school's local day, not the UTC day — after 5pm Pacific, UTC is already
// tomorrow, which made evening reports say "no reviews yet".

export const DEFAULT_TIME_ZONE = "America/Los_Angeles";

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The instant at which the current calendar day began in `tz`. */
export function startOfTodayInTimeZone(tz: string, now: Date = new Date()): Date {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(now)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  // Wall-clock time in tz, interpreted as if it were UTC, minus the real
  // instant gives the zone's current UTC offset (to the second).
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  const offsetMs  = wallAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  const midnightAsUtc = Date.UTC(p.year, p.month - 1, p.day);
  return new Date(midnightAsUtc - offsetMs);
}

export function formatDateInTimeZone(tz: string, date: Date = new Date()): string {
  return date.toLocaleDateString("en-US", {
    timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}
