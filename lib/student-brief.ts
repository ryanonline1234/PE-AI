// A student's own sport brief (docs/03, DECISIONS 2026-10-28). It is stored, so
// it must never hold health details: injuries stay in the per-workout box,
// which is sent to the AI and not saved. Sentences that mention them go.
import { sanitizeStudentText } from "@/lib/sanitize";

export const MAX_STUDENT_BRIEF = 600;

// Includes the euphemisms a model reaches for ("return-to-play", "coming back
// from"), which hint at an injury without naming it.
const HEALTH = /\b(injur\w*|pain\w*|hurts?|hurting|sore\w*|surger\w*|asthma\w*|diabet\w*|concussion\w*|medic\w*|diagnos\w*|therap\w*|rehab\w*|torn|sprain\w*|fractur\w*|disorder\w*|pregnan\w*|weight loss|lose weight|bmi|return[- ]to[- ](play|sport|activity)|coming back from|recovering from)\b/i;

/** Drop sentences that mention injuries, pain or medical details. */
export function withoutHealthDetails(text: string): string {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((x) => x.trim() && !HEALTH.test(x))
    .join(" ")
    .trim();
}

/** What gets stored: capped, injection patterns stripped, no health sentences. */
export function cleanStudentBrief(value: unknown): string {
  if (typeof value !== "string") return "";
  return withoutHealthDetails(sanitizeStudentText(value, MAX_STUDENT_BRIEF));
}
