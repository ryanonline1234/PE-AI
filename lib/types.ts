// Shared types for PE.AI. The two shapes that matter:
//   ClassConfig — the teacher-controlled parameters persisted in `pe_classes.config`.
//   Workout     — the JSON the model returns from /api/generate-workout.

export type Intensity = "low" | "moderate" | "high";
export type Focus = "mixed" | "cardio" | "strength" | "flexibility";
export type Equipment = "none" | "basic" | "gym";
export type FitnessLevel = "beginner" | "moderate" | "advanced";

export interface ClassConfig {
  duration: number;
  minCalories: number;
  equipment: Equipment;
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
  reps: string; // e.g. "12 reps" or "30 sec"
  rest: string; // e.g. "30 sec"
  calories: number;
  tip: string;
  howTo?: string[]; // added recently — may be absent on older generations
}

export interface Workout {
  title: string;
  totalCalories: number;
  totalDuration: number; // minutes
  warmup: WarmupItem[];
  exercises: ExerciseItem[];
  cooldown: CooldownItem[];
  coachNote: string;
}
