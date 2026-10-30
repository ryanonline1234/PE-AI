// Turns a workout into the flat list of steps Go mode walks through.
// Pure functions, unit-testable without React.
import type { Workout } from "@/lib/types";

export type GoStepKind = "warmup" | "exercise" | "rest" | "cooldown";
/** The three parts of a workout; rests belong to the main part. */
export type GoSection = "warmup" | "main" | "cooldown";

export interface GoStep {
  kind: GoStepKind;
  section: GoSection;
  title: string;
  /** Secondary line: the tip or the description (empty for rests). */
  detail: string;
  /**
   * Where the student is, counted by exercise rather than by step: "Exercise
   * 3 of 7", "Warm-up 1 of 3". A rest carries the position of the set it follows.
   */
  position: string;
  /** The next thing to do, skipping rests ("Push-ups · set 2 of 3"); empty at the end. */
  nextUp: string;
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
  const steps: Omit<GoStep, "nextUp">[] = [];

  w.warmup.forEach((item, i) => {
    steps.push({
      kind: "warmup",
      section: "warmup",
      title: item.name,
      detail: item.description,
      position: `Warm-up ${i + 1} of ${w.warmup.length}`,
      seconds: parseSeconds(item.duration) ?? DEFAULT_TIMED,
    });
  });

  w.exercises.forEach((ex, exIndex) => {
    const timed = parseSeconds(ex.reps);
    const rest = parseSeconds(ex.rest) ?? DEFAULT_REST;
    const lastExercise = exIndex === w.exercises.length - 1;
    const position = `Exercise ${exIndex + 1} of ${w.exercises.length}`;
    for (let set = 1; set <= ex.sets; set++) {
      steps.push({
        kind: "exercise",
        section: "main",
        title: ex.name,
        detail: ex.tip,
        position,
        seconds: timed,
        setLabel: ex.sets > 1 ? `Set ${set} of ${ex.sets}` : undefined,
        repsLabel: timed ? undefined : ex.reps,
        howTo: ex.howTo,
      });
      const lastSet = set === ex.sets;
      if (!(lastExercise && lastSet)) {
        steps.push({ kind: "rest", section: "main", title: "Rest", detail: "", position, seconds: rest });
      }
    }
  });

  w.cooldown.forEach((item, i) => {
    steps.push({
      kind: "cooldown",
      section: "cooldown",
      title: item.name,
      detail: item.description,
      position: `Cool-down ${i + 1} of ${w.cooldown.length}`,
      seconds: parseSeconds(item.duration) ?? DEFAULT_TIMED,
    });
  });

  return steps.map((step, i) => ({ ...step, nextUp: describeNext(steps, i) }));
}

/** The first non-rest step after `i`, named with its set or the part it starts. */
function describeNext(steps: Omit<GoStep, "nextUp">[], i: number): string {
  const next = steps.slice(i + 1).find((s) => s.kind !== "rest");
  if (!next) return "";
  if (next.kind === "exercise") return next.setLabel ? `${next.title} · ${next.setLabel.toLowerCase()}` : next.title;
  const startsPart = next.section !== steps[i].section;
  return startsPart ? `${next.section === "cooldown" ? "Cool-down" : "Warm-up"}: ${next.title}` : next.title;
}

/** Rough planning estimate for a rep-based set (no timer). */
export const REP_SET_ESTIMATE = 45;

export interface SectionSpan {
  section: GoSection;
  /** Index of the part's first step, and one past its last. */
  start: number;
  end: number;
  /** Estimated seconds, for sizing the part's share of the progress bar. */
  seconds: number;
}

/** The parts present in `steps`, in order, for the split progress bar. */
export function sectionSpans(steps: GoStep[]): SectionSpan[] {
  const spans: SectionSpan[] = [];
  steps.forEach((s, i) => {
    const last = spans[spans.length - 1];
    const secs = s.seconds ?? REP_SET_ESTIMATE;
    if (last && last.section === s.section) { last.end = i + 1; last.seconds += secs; }
    else spans.push({ section: s.section, start: i, end: i + 1, seconds: secs });
  });
  return spans;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : String(r);
}
