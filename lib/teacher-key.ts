import { createHash, randomInt, timingSafeEqual } from "crypto";

// Teacher key: a per-class secret separate from the class code. Students know
// the class code by design, so the code alone cannot gate edits or reports.
// Generated server-side on first save, shown once, stored only as a SHA-256 hex.

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function generateTeacherKey(): string {
  const chars = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** Uppercase and strip everything but letters/digits, so "abcd-1234" == "ABCD1234". */
export function normalizeTeacherKey(input: unknown): string {
  return typeof input === "string" ? input.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
}

export function hashTeacherKey(key: string): string {
  return createHash("sha256").update(normalizeTeacherKey(key)).digest("hex");
}

export function teacherKeyMatches(input: unknown, storedHash: string | null | undefined): boolean {
  const key = normalizeTeacherKey(input);
  if (!key || !storedHash) return false;
  const a = Buffer.from(hashTeacherKey(key), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
