// Shared types for PE.AI (live shapes, derived from the current routes + UI).

export type Intensity = "low" | "moderate" | "high";
export type Focus = "mixed" | "cardio" | "strength" | "flexibility";
export type FitnessLevel = "beginner" | "moderate" | "advanced";

/** One question the AI asked and the answer it got (teacher check or student). */
export interface QA {
  question: string;
  answer: string;
}

/** A question the AI wants answered, with tap-able answers. */
export interface AskQuestion {
  question: string;
  options: string[];
}

export interface ClassConfig {
  duration: number;
  minCalories: number;
  // Free-text in the teacher UI (a textarea). save-class still clamps a legacy
  // "none"|"basic"|"gym" set server-side, so the stored value may be narrower —
  // typed `string` to cover both the client free-text and the clamped value.
  equipment: string;
  intensity: Intensity;
  focus: Focus;
  customPrompt: string;
  /** The AI's plain-language reading of this setup, confirmed by the teacher. */
  summary?: string;
  /** Answers the teacher gave during the AI check. Fed to every generation. */
  clarifications?: QA[];
}

/** Response of /api/clarify-class. */
export interface ClassCheck {
  summary: string;
  questions: AskQuestion[];
}

export interface WarmupItem {
  name: string;
  duration: string; // e.g. "90 sec"
  description: string;
}
export type CooldownItem = WarmupItem;

export interface ExerciseItem {
  name: string;
  sets: number;
  reps: string; // e.g. "12 reps"
  rest: string; // e.g. "30 sec"
  calories: number;
  tip: string;
  howTo?: string[]; // may be absent on older generations
}

export interface Workout {
  /** On a regeneration: what the AI changed and why, shown above the workout. */
  note?: string;
  title: string;
  totalCalories: number;
  totalDuration: number; // minutes
  warmup: WarmupItem[];
  exercises: ExerciseItem[];
  cooldown: CooldownItem[];
}

export interface GenerateWorkoutInput {
  code: string;
  studentName: string;
  fitnessLevel: FitnessLevel;
  limitations: string;
  preferences: string;
  regenerateFeedback: string;
  /** Answers to the questions the AI asked before building. */
  answers?: QA[];
  /** Student tapped Skip on the questions: build without asking again. */
  skipQuestions?: boolean;
  /** Share id of the workout being regenerated, so the AI edits it. */
  previousId?: string | null;
  /** Teacher preview: typical student, nothing saved. */
  sample?: boolean;
}

export interface ClassLookup {
  config: ClassConfig;
  /** True once the class has a teacher key; the teacher UI then asks for it before saving. */
  hasTeacherKey: boolean;
  /** True when a signed-in teacher account owns the class. */
  managed: boolean;
}

export interface SaveClassResponse {
  success: boolean;
  code: string;
  /** Present only when this save created the class or claimed a legacy one. Shown once. */
  teacherKey?: string;
}

export interface ReviewInput {
  code: string;
  studentName: string;
  rating: number;
  comment: string;
}

export interface ReportMeta {
  total: number;
  avgRating: number;
  ratingCounts: string;
}

export interface ReportResponse {
  report: string | null;
  meta?: ReportMeta;
  message?: string;
}

// ── Streaming generation ──────────────────────────────────────
// The model emits one JSON object per line (meta first, then each item in order);
// the server normalizes each line into one of these events and streams them to
// the browser as NDJSON. `done` carries the share id once the workout is saved.

export type WorkoutEvent =
  | { kind: "note"; text: string }
  | { kind: "question"; question: AskQuestion }
  | { kind: "needs_answers" }
  | { kind: "meta"; title: string; totalCalories: number; totalDuration: number }
  | { kind: "warmup"; item: WarmupItem }
  | { kind: "exercise"; item: ExerciseItem }
  | { kind: "cooldown"; item: CooldownItem }
  | { kind: "done"; id: string | null }
  | { kind: "error"; message: string };

export const EMPTY_WORKOUT: Workout = {
  title: "",
  totalCalories: 0,
  totalDuration: 0,
  warmup: [],
  exercises: [],
  cooldown: [],
};

/** A persisted workout as read back from the `workouts` table. */
export interface SavedWorkout {
  id: string;
  code: string;
  studentName: string;
  workout: Workout;
  createdAt: string; // ISO
}
