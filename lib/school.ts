// The Mitty school domains. Faculty are @mitty.com, students @mittymonarch.com
// (same rule as the Mitty Business Club portal). The database enforces this too:
// the Before User Created hook and role_for_email() in the migrations.
export const SCHOOL_DOMAINS = ["mitty.com", "mittymonarch.com"] as const;
export const FACULTY_DOMAIN = "mitty.com";

export function emailDomain(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase().split("@")[1] ?? "";
}

export function isSchoolEmail(email: string | null | undefined): boolean {
  return (SCHOOL_DOMAINS as readonly string[]).includes(emailDomain(email));
}

/**
 * Only same-origin paths; anything else falls back. Prevents open redirects.
 * Parsing (not string checks) is the gate: URL parsers strip tabs/newlines, so
 * "/\t/evil.com" would otherwise become "//evil.com".
 */
export function safeNextPath(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || /[\x00-\x1f\\]/.test(raw)) return fallback;
  try {
    const base = "http://same.origin";
    const url = new URL(raw, base);
    if (url.origin !== base) return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}
