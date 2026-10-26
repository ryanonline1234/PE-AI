// All API calls from the frontend go through these helpers.
// The NEXT_PUBLIC_ prefix is needed so Next.js exposes it to the browser bundle.
// IMPORTANT: this is a *shared* secret between your own frontend and backend —
// it is NOT the Anthropic key (which stays server-side only).
import type {
  ClassConfig,
  ClassLookup,
  GenerateWorkoutInput,
  ReportResponse,
  ReviewInput,
  SaveClassResponse,
  Workout,
} from "@/lib/types";

const SECRET = process.env.NEXT_PUBLIC_INTERNAL_API_SECRET;

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-internal-secret": SECRET ?? "",
  };
}

// ── Class management ──────────────────────────────────────────

export async function apiSaveClass(
  code: string,
  config: ClassConfig,
  teacherKey: string
): Promise<SaveClassResponse> {
  const res = await fetch("/api/save-class", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ code, config, teacherKey }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to save class");
  return data;
}

export async function apiGetClass(code: string): Promise<ClassLookup> {
  const res = await fetch(`/api/get-class?code=${encodeURIComponent(code)}`, {
    headers: headers(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Class not found");
  return { config: data.config as ClassConfig, hasTeacherKey: Boolean(data.hasTeacherKey) };
}

// ── Workout generation ────────────────────────────────────────

export async function apiGenerateWorkout({
  code,
  studentName,
  fitnessLevel,
  limitations,
  preferences,
  regenerateFeedback,
}: GenerateWorkoutInput): Promise<Workout> {
  const res = await fetch("/api/generate-workout", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ code, studentName, fitnessLevel, limitations, preferences, regenerateFeedback }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to generate workout");
  return data.workout;
}

// ── Reviews ───────────────────────────────────────────────────

export async function apiSubmitReview({
  code,
  studentName,
  rating,
  comment,
}: ReviewInput): Promise<{ ok: boolean }> {
  const res = await fetch("/api/submit-review", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ code, studentName, rating, comment }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to submit review");
  return data;
}

export async function apiGenerateReport(code: string, teacherKey: string): Promise<ReportResponse> {
  // The report covers "today" in the browser's time zone (the school's), not UTC.
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const res = await fetch("/api/generate-report", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ code, teacherKey, timeZone }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to generate report");
  return data;
}
