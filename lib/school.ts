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

/** Only same-origin absolute paths; anything else falls back. Prevents open redirects. */
export function safeNextPath(raw: string | null | undefined, fallback = "/teacher"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  return raw;
}
