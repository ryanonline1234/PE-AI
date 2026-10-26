// Turns a workout into the flat list of steps Go mode walks through.
// Pure functions, unit-testable without React.
import type { Workout } from "@/lib/types";

export type GoStepKind = "warmup" | "exercise" | "rest" | "cooldown";

export interface GoStep {
  kind: GoStepKind;
  title: string;
  /** Secondary line: the tip, the description, or what comes next. */
  detail: string;
  /** Countdown length, or null for rep-based steps the student taps Done on. */
  seconds: number | null;
  /** "Set 2 of 3" for exercises; "12 reps" style text for rep-based steps. */
  setLabel?: string;
  repsLabel?: string;
  howTo?: string[];
}

/**
 * Parse "90 sec", "1 min", "1.5 minutes", "45 sec each side", "30s" into
 * seconds. Returns null for rep counts ("12 reps", "10 each leg"), so the
 * caller knows to wait for a tap instead of running a timer.
 */
export function parseSeconds(text: string): number | null {
  const s = text.toLowerCase();
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:-\s*\d+(?:\.\d+)?\s*)?(sec|s\b|second|min|m\b|minute)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2];
  const seconds = unit.startsWith("m") ? n * 60 : n;
  return Math.min(1800, Math.max(5, Math.round(seconds)));
}

const DEFAULT_TIMED = 60;
const DEFAULT_REST = 30;

export function buildSteps(w: Workout): GoStep[] {
  const steps: GoStep[] = [];

  for (const item of w.warmup) {
    steps.push({
      kind: "warmup",
      title: item.name,
      detail: item.description,
      seconds: parseSeconds(item.duration) ?? DEFAULT_TIMED,
    });
  }

  w.exercises.forEach((ex, exIndex) => {
    const timed = parseSeconds(ex.reps);
    const rest = parseSeconds(ex.rest) ?? DEFAULT_REST;
    const lastExercise = exIndex === w.exercises.length - 1;
    for (let set = 1; set <= ex.sets; set++) {
      steps.push({
        kind: "exercise",
        title: ex.name,
        detail: ex.tip,
        seconds: timed,
        setLabel: ex.sets > 1 ? `Set ${set} of ${ex.sets}` : undefined,
        repsLabel: timed ? undefined : ex.reps,
        howTo: ex.howTo,
      });
      const lastSet = set === ex.sets;
      if (!(lastExercise && lastSet)) {
        const next = lastSet ? w.exercises[exIndex + 1]?.name : `${ex.name} · set ${set + 1}`;
        steps.push({ kind: "rest", title: "Rest", detail: next ? `Next: ${next}` : "", seconds: rest });
      }
    }
  });

  for (const item of w.cooldown) {
    steps.push({
      kind: "cooldown",
      title: item.name,
      detail: item.description,
      seconds: parseSeconds(item.duration) ?? DEFAULT_TIMED,
    });
  }

  return steps;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : String(r);
}
