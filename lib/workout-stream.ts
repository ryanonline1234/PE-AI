// Isomorphic helpers for the line-delimited workout stream. No Node imports:
// the browser uses `applyEvent`, the API route uses `parseModelLine`.
import type { ExerciseItem, WarmupItem, Workout, WorkoutEvent } from "@/lib/types";

type Obj = Record<string, unknown>;

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v: unknown, fallback = 0) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
};

function timedItem(o: Obj): WarmupItem | null {
  const name = str(o.name, 80);
  if (!name) return null;
  return { name, duration: str(o.duration, 40) || "60 sec", description: str(o.description) };
}

function exerciseItem(o: Obj): ExerciseItem | null {
  const name = str(o.name, 80);
  if (!name) return null;
  const howTo = Array.isArray(o.howTo) ? o.howTo.map((s) => str(s, 200)).filter(Boolean).slice(0, 6) : [];
  return {
    name,
    sets: Math.min(10, Math.max(1, int(o.sets, 1))),
    reps: str(o.reps, 40) || "10 reps",
    rest: str(o.rest, 40) || "30 sec",
    calories: int(o.calories, 0),
    tip: str(o.tip),
    howTo,
  };
}

/**
 * Turn one line of model output into a stream event, or null if the line is
 * noise (blank, a code fence, malformed JSON, or an unknown type). The model
 * is asked for exactly these shapes; anything else is dropped, not fatal.
 */
export function parseModelLine(line: string): WorkoutEvent | null {
  const trimmed = line.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  if (!trimmed.startsWith("{")) return null;
  let o: Obj;
  try {
    o = JSON.parse(trimmed) as Obj;
  } catch {
    return null;
  }
  switch (o.type) {
    case "meta":
      return {
        kind: "meta",
        title: str(o.title, 60) || "Your Workout",
        totalCalories: int(o.totalCalories),
        totalDuration: int(o.totalDuration),
      };
    case "warmup": {
      const item = timedItem(o);
      return item ? { kind: "warmup", item } : null;
    }
    case "exercise": {
      const item = exerciseItem(o);
      return item ? { kind: "exercise", item } : null;
    }
    case "cooldown": {
      const item = timedItem(o);
      return item ? { kind: "cooldown", item } : null;
    }
    default:
      return null;
  }
}

/** Fold one event into a workout. Returns a new object (safe for React state). */
export function applyEvent(w: Workout, ev: WorkoutEvent): Workout {
  switch (ev.kind) {
    case "meta":
      return { ...w, title: ev.title, totalCalories: ev.totalCalories, totalDuration: ev.totalDuration };
    case "warmup":
      return { ...w, warmup: [...w.warmup, ev.item] };
    case "exercise":
      return { ...w, exercises: [...w.exercises, ev.item] };
    case "cooldown":
      return { ...w, cooldown: [...w.cooldown, ev.item] };
    default:
      return w;
  }
}

/** If the model's meta total disagrees badly with the items, trust the items. */
export function reconcileTotals(w: Workout): Workout {
  const fromItems = w.exercises.reduce((sum, e) => sum + (e.calories || 0), 0);
  const totalCalories = fromItems > 0 && (w.totalCalories === 0 || Math.abs(w.totalCalories - fromItems) > fromItems * 0.5)
    ? fromItems
    : w.totalCalories;
  return { ...w, totalCalories };
}

/** Split a chunked text stream into complete lines; returns the leftover. */
export function drainLines(buffer: string, onLine: (line: string) => void): string {
  let nl: number;
  while ((nl = buffer.indexOf("\n")) >= 0) {
    onLine(buffer.slice(0, nl));
    buffer = buffer.slice(nl + 1);
  }
  return buffer;
}
