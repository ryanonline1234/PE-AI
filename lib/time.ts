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

/** The calendar date in `tz` as YYYY-MM-DD. */
export function dateKeyInTimeZone(tz: string, date: Date = new Date()): string {
  const p: Record<string, string> = {};
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}`;
}

// ── Session dates ─────────────────────────────────────────────
// Sessions are keyed by the school's calendar date (docs/02-sessions.md). The
// server decides "today" in the school's zone, never the browser's.

export const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The school's calendar date for an instant (default: now), YYYY-MM-DD. */
export function schoolDate(date: Date = new Date()): string {
  return dateKeyInTimeZone(DEFAULT_TIME_ZONE, date);
}

/** A real calendar date written as YYYY-MM-DD. */
export function isDateKey(v: unknown): v is string {
  if (typeof v !== "string" || !DATE_KEY_RE.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** `key` moved by `days` calendar days (noon UTC, so DST never shifts the date). */
export function addDays(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD key. */
export function weekdayOf(key: string): number {
  return new Date(`${key}T12:00:00Z`).getUTCDay();
}

/** The Monday of the week `key` falls in (weeks run Monday to Sunday). */
export function mondayOf(key: string): string {
  return addDays(key, -((weekdayOf(key) + 6) % 7));
}

/** The school week to show for a day: its own week, or the coming one on a weekend. */
export function schoolWeekOf(key: string): string {
  const wd = weekdayOf(key);
  return mondayOf(wd === 6 ? addDays(key, 2) : wd === 0 ? addDays(key, 1) : key);
}
