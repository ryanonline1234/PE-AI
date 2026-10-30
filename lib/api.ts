// All API calls from the frontend go through these helpers.
// The NEXT_PUBLIC_ prefix is needed so Next.js exposes it to the browser bundle.
// IMPORTANT: this is a *shared* secret between your own frontend and backend —
// it is NOT the Anthropic key (which stays server-side only).
import type {
  ClassConfig,
  ConsultResult,
  PinnedSource,
  QA,
  ResearchResult,
  GenerateWorkoutInput,
  ReportResponse,
  ReviewInput,
  ClassCheck,
  SaveClassResponse,
  WorkoutEvent,
} from "@/lib/types";
import { drainLines } from "@/lib/workout-stream";
import type { PresetFields } from "@/lib/presets";

const SECRET = process.env.NEXT_PUBLIC_INTERNAL_API_SECRET;

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-internal-secret": SECRET ?? "",
  };
}

// ── Class management ──────────────────────────────────────────
// The session cookie identifies the owner; there are no teacher keys.

export async function apiSaveClass(code: string, config: ClassConfig): Promise<SaveClassResponse> {
  const res = await fetch("/api/save-class", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ code, config }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to save class");
  return data;
}

// ── Teacher AI check ──────────────────────────────────────────

export async function apiClarifyClass(config: ClassConfig, round: number, personal = false): Promise<ClassCheck> {
  const res = await fetch("/api/clarify-class", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ config, round, personal }),
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

// ── Reviews + reports ─────────────────────────────────────────

export async function apiSubmitReview({ code, rating, comment, workoutId }: ReviewInput): Promise<{ ok: boolean }> {
  const res = await fetch("/api/submit-review", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ code, rating, comment, workoutId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to submit review");
  return data;
}

export async function apiGenerateReport(code: string): Promise<ReportResponse> {
  // The report covers "today" in the browser's time zone (the school's), not UTC.
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const res = await fetch("/api/generate-report", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ code, timeZone }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to generate report");
  return data;
}

// ── Accounts: classes, filing, admin ─────────────────────────

async function postJson<T>(url: string, body: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, { method, headers: headers(), body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data as T;
}

/** Teachers get a class (optionally starting from a preset); students get a personal class. */
export const apiCreateClass = (label: string, presetId?: string) => postJson<{ code: string }>("/api/classes", { label, presetId });

/** A teacher's own-workout space (their one personal class), created on first use. */
export const apiSoloClass = () => postJson<{ code: string }>("/api/classes", { solo: true });

export const apiUpdateClass = (code: string, patch: { label?: string; archived?: boolean }) =>
  postJson<{ ok: true }>("/api/classes", { code, ...patch }, "PATCH");

export const apiFileWorkout = (code: string, workoutId: string, filed: boolean) =>
  postJson<{ ok: true; filed: boolean }>("/api/class-workouts", { code, workoutId, filed });

// ── Sessions (teacher classes; docs/02-sessions.md) ───────────

/** Plan a session on `date`, copying the class defaults or the session on `copyFrom`. */
export const apiCreateSession = (code: string, date: string, copyFrom: string | null) =>
  postJson<{ date: string }>("/api/class-sessions", { code, date, copyFrom });

export const apiUpdateSession = (code: string, date: string, patch: { config?: ClassConfig; name?: string; specifics?: string }) =>
  postJson<{ ok: true }>("/api/class-sessions", { code, date, ...patch }, "PATCH");

/** Copy a session to other days and/or other classes; days that already have one keep theirs. */
export const apiCopySession = (code: string, date: string, targets: { code: string; date: string }[]) =>
  postJson<{ copied: number; skipped: { code: string; date: string }[] }>("/api/class-sessions/copy", { code, date, targets });

export const apiDeleteSession = (code: string, date: string) =>
  postJson<{ ok: true }>("/api/class-sessions", { code, date }, "DELETE");

// ── Planning help (docs/03) ───────────────────────────────────

/** Save a class's AI background and/or pinned research (never its settings). */
export const apiSaveBackground = (code: string, patch: { background?: string; sources?: PinnedSource[] }) =>
  postJson<{ success: boolean }>("/api/save-class", { code, ...patch });

/** One round of a consult: the draft text and any questions still open. */
export const apiConsult = (input: { for: "background" | "session" | "student"; topic: string; answers: QA[]; round: number; config?: ClassConfig }) =>
  postJson<ConsultResult>("/api/consult", input);

/** Search the trusted sites for findings a teacher can pin (teachers only). */
export const apiResearch = (topic: string, config?: ClassConfig) =>
  postJson<ResearchResult>("/api/research", { topic, config });

/** Save the caller's own sport brief; returns what was stored after cleaning. */
export const apiSaveStudentBrief = (brief: string) =>
  postJson<{ brief: string; trimmed: boolean }>("/api/student-brief", { brief });

export const apiDeleteStudentBrief = () => postJson<{ ok: true }>("/api/student-brief", {}, "DELETE");

// ── Setting presets (teachers; DECISIONS 2026-10-28) ──────────

/** Save a preset under a name (same name updates it); optionally copy it into every class. */
export const apiSavePreset = (name: string, fields: PresetFields, applyToAll: boolean) =>
  postJson<{ id: string; updated: boolean; applied: number }>("/api/presets", { name, fields, applyToAll });

export const apiRenamePreset = (id: string, name: string) => postJson<{ ok: true }>("/api/presets", { id, name }, "PATCH");

export const apiDeletePreset = (id: string) => postJson<{ ok: true }>("/api/presets", { id }, "DELETE");

/** Copy a preset into every active class (default settings + AI background). */
export const apiApplyPresetToAll = (id: string) => postJson<{ applied: number }>("/api/presets/apply", { id });
