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
  ClassCheck,
  SaveClassResponse,
  WorkoutEvent,
} from "@/lib/types";
import { drainLines } from "@/lib/workout-stream";

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
  return { config: data.config as ClassConfig, hasTeacherKey: Boolean(data.hasTeacherKey), managed: Boolean(data.managed) };
}

// ── Teacher AI check ──────────────────────────────────────────

export async function apiClarifyClass(config: ClassConfig, round: number): Promise<ClassCheck> {
  const res = await fetch("/api/clarify-class", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ config, round }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "The AI check failed");
  return data as ClassCheck;
}

// ── Workout generation ────────────────────────────────────────

/**
 * Stream a workout. `onEvent` fires for every normalized line the server
 * forwards (meta, warmup, exercise, cooldown, then done or error). Resolves
 * when the stream ends; rejects on HTTP errors (rate limit, unknown class) or
 * a network failure. An `error` event is delivered, not thrown, so partial
 * output already on screen survives.
 */
export async function apiGenerateWorkoutStream(
  input: GenerateWorkoutInput,
  onEvent: (event: WorkoutEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch("/api/generate-workout", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(input),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to generate workout");
  }
  if (!res.body) throw new Error("Streaming is not supported in this browser");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const handleLine = (line: string) => {
    if (!line.trim()) return;
    try {
      onEvent(JSON.parse(line) as WorkoutEvent);
    } catch {
      // A torn line should never happen (the server writes whole lines); skip it.
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer = drainLines(buffer + decoder.decode(value, { stream: true }), handleLine);
  }
  buffer += decoder.decode();
  if (buffer.trim()) handleLine(buffer);
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

// ── Signed-in teacher accounts ───────────────────────────────
// The session cookie rides along automatically (same origin).

async function postJson<T>(url: string, body: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, { method, headers: headers(), body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data as T;
}

export const apiCreateClass = (label: string) => postJson<{ code: string }>("/api/teacher/class", { label });

export const apiUpdateClass = (code: string, patch: { label?: string; archived?: boolean }) =>
  postJson<{ ok: true }>("/api/teacher/class", { code, ...patch }, "PATCH");

export const apiClaimClass = (code: string, teacherKey: string) =>
  postJson<{ code: string; already?: boolean }>("/api/claim-class", { code, teacherKey });

export const apiFileWorkout = (code: string, workoutId: string, filed: boolean) =>
  postJson<{ ok: true; filed: boolean }>("/api/class-workouts", { code, workoutId, filed });
