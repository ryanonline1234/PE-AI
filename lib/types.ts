// Shared types for PE.AI (live shapes, derived from the current routes + UI).

export type Intensity = "low" | "moderate" | "high";
export type Focus = "mixed" | "cardio" | "strength" | "flexibility";
export type FitnessLevel = "beginner" | "moderate" | "advanced";

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

// NOTE: no `coachNote` — it was removed from the live output.
export interface Workout {
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
