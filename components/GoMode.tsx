"use client";

// Go mode: the full-screen step player for the gym floor. One step at a time,
// big type, countdowns for timed work and rest, a tap for rep-based sets,
// and a screen wake lock so the phone doesn't dim mid-set. Progress is counted
// by exercise ("Exercise 3 of 7 · Set 2 of 3", docs/04 S2), with a "Next up"
// line and a bar split into warm-up, main workout and cool-down.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, Pause, Play, SkipForward, Star, Timer, X } from "lucide-react";
import { buildSteps, formatClock, REP_SET_ESTIMATE, sectionSpans, type GoSection, type GoStep, type SectionSpan } from "@/lib/go-mode";
import type { Workout } from "@/lib/types";
import { cn } from "@/lib/utils";

type Phase = "ready" | "running" | "done";

const SECTION_LABEL: Record<GoSection, string> = {
  warmup: "Warm-up",
  main: "Main workout",
  cooldown: "Cool-down",
};

function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        // Low battery or an unsupported browser: the workout still runs.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && !cancelled) void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
}

/** Two-tone chime + vibration when a timer ends. Audio needs a prior tap (Start). */
function useCue() {
  const ctxRef = useRef<AudioContext | null>(null);
  const unlock = useCallback(() => {
    if (ctxRef.current || typeof window === "undefined" || !("AudioContext" in window)) return;
    try {
      ctxRef.current = new AudioContext();
    } catch {
      ctxRef.current = null;
    }
  }, []);
  const play = useCallback(() => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([150, 80, 150]);
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const tone = (freq: number, at: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.3);
    };
    tone(880, ctx.currentTime);
    tone(1320, ctx.currentTime + 0.18);
  }, []);
  return { unlock, play };
}

export function GoMode({ workout, onClose, onFinish }: {
  workout: Workout;
  onClose: () => void;
  onFinish: () => void;
}) {
  const steps = useMemo(() => buildSteps(workout), [workout]);
  const spans = useMemo(() => sectionSpans(steps), [steps]);
  const [phase, setPhase] = useState<Phase>("ready");
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showHowTo, setShowHowTo] = useState(false);

  const endsAtRef = useRef<number | null>(null);
  const pauseLeftRef = useRef(0);
  const startedAtRef = useRef(0);
  const firedRef = useRef(false);

  const step: GoStep | undefined = steps[index];
  const total = steps.length;
  const cue = useCue();
  useWakeLock(phase === "running");

  const estimateSeconds = useMemo(
    () => steps.reduce((sum, s) => sum + (s.seconds ?? REP_SET_ESTIMATE), 0),
    [steps]
  );

  // Lock page scroll behind the overlay; Escape closes.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Every step change goes through goTo: it arms (or clears) the countdown and
  // resets per-step UI. The index also lives in a ref so the interval callback
  // can advance without reading stale state.
  const indexRef = useRef(0);
  const goTo = useCallback((i: number) => {
    const target = steps[i];
    if (!target) return;
    indexRef.current = i;
    firedRef.current = false;
    setIndex(i);
    setPaused(false);
    setShowHowTo(false);
    if (target.seconds) {
      endsAtRef.current = Date.now() + target.seconds * 1000;
      setRemaining(target.seconds);
    } else {
      endsAtRef.current = null;
      setRemaining(null);
    }
  }, [steps]);

  const advance = useCallback(() => {
    const next = indexRef.current + 1;
    if (next >= total) {
      endsAtRef.current = null;
      setPhase("done");
    } else {
      goTo(next);
    }
  }, [total, goTo]);

  // Clock: timestamps, not tick counting, so a throttled background tab stays honest.
  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setElapsed((now - startedAtRef.current) / 1000);
      if (paused || endsAtRef.current === null) return;
      const left = Math.ceil((endsAtRef.current - now) / 1000);
      setRemaining(Math.max(0, left));
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true;
        cue.play();
        advance();
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [phase, paused, cue, advance]);

  function start() {
    cue.unlock();
    startedAtRef.current = Date.now();
    setPhase("running");
    goTo(0);
  }

  function back() {
    goTo(Math.max(0, indexRef.current - 1));
  }

  function togglePause() {
    if (endsAtRef.current === null) return;
    if (paused) {
      endsAtRef.current = Date.now() + pauseLeftRef.current;
      setPaused(false);
    } else {
      pauseLeftRef.current = Math.max(0, endsAtRef.current - Date.now());
      setPaused(true);
    }
  }

  const big = "font-display font-black uppercase leading-none";
  const btnBase = "inline-flex items-center justify-center gap-2 rounded-xl font-display uppercase tracking-[0.5px] cursor-pointer select-none transition-[opacity,transform] duration-150 active:scale-[0.98] disabled:opacity-35 disabled:cursor-not-allowed";
  const btnPrimary = cn(btnBase, "bg-accent text-bg text-[24px] font-bold min-h-[68px] px-4 flex-[1.5] min-w-0");
  const btnGhost = cn(btnBase, "bg-surface2 border border-border text-text text-[18px] font-bold min-h-[68px] px-4 flex-1 min-w-0");

  // ── Ready ────────────────────────────────────────────────────
  if (phase === "ready" || !step) {
    return (
      <Overlay onClose={onClose}>
        <div className="flex-1 flex flex-col justify-center text-center px-2">
          <div className="t-eyebrow text-accent mb-3">Go mode</div>
          <div className={cn(big, "text-[clamp(44px,11vw,80px)] mb-5")}>{workout.title || "Your Workout"}</div>
          <div className="text-muted text-[16px] leading-[1.6] max-w-[420px] mx-auto">
            {readySummary(workout)} · about {Math.max(1, Math.round(estimateSeconds / 60))} min. Timers run themselves;
            tap <strong className="text-text">Done</strong> after rep-based sets. Your screen stays awake.
          </div>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className={btnGhost}>Not yet</button>
          <button type="button" onClick={start} className={btnPrimary} disabled={total === 0}><Play className="icon fill-current" /> Start</button>
        </div>
      </Overlay>
    );
  }

  // ── Done ─────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <Overlay onClose={onClose} spans={spans} index={total}>
        <div className="flex-1 flex flex-col justify-center text-center px-2">
          <div className="t-eyebrow text-accent mb-3">Workout complete</div>
          <div className={cn(big, "text-[clamp(56px,16vw,120px)] text-accent mb-2")}>{formatClock(elapsed)}</div>
          <div className="text-muted text-[16px]">
            minutes on the floor{workout.totalCalories ? ` · ≈${workout.totalCalories} kcal (estimate)` : ""}
          </div>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className={btnGhost}>Close</button>
          <button type="button" onClick={onFinish} className={btnPrimary}><Star className="icon" /> Rate it</button>
        </div>
      </Overlay>
    );
  }

  // ── Running ──────────────────────────────────────────────────
  const timed = step.seconds !== null;
  const isRest = step.kind === "rest";
  const accent = isRest ? "text-accent2" : "text-accent";
  const fraction = timed && remaining !== null && step.seconds ? remaining / step.seconds : 0;

  return (
    <Overlay onClose={onClose} spans={spans} index={index}>
      {/* Where we are, by exercise */}
      <div className="flex items-baseline justify-between gap-3 mb-6">
        <span className={cn("text-[16px] font-semibold", accent)}>
          {step.position}{step.setLabel ? ` · ${step.setLabel}` : ""}
        </span>
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-muted tabular-nums">
          <span className="sr-only">Time so far </span><Timer className="icon" />{Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, "0")}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center min-h-0">
        {isRest && <div className="t-eyebrow text-accent2 mb-2">Breathe, then get set</div>}
        <div className={cn(big, "text-[clamp(36px,9vw,64px)] tracking-[-1px] mb-3")}>{step.title}</div>
        {step.detail && (
          <div className="text-muted text-[16px] leading-[1.5] max-w-[560px]">{step.detail}</div>
        )}

        {step.howTo && step.howTo.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowHowTo((v) => !v)}
              className="inline-flex items-center gap-1 text-[14px] font-semibold text-accent bg-transparent border-0 p-0 cursor-pointer"
              aria-expanded={showHowTo}
            >
              {showHowTo ? "Hide how-to" : "How to do it"}
              <ChevronDown className={cn("icon transition-transform", showHowTo && "rotate-180")} />
            </button>
            {showHowTo && (
              <ol className="pl-5 mt-2 list-decimal text-[14px] leading-[1.5] text-text max-w-[560px]">
                {step.howTo.map((s, i) => <li key={i} className="mb-1">{s}</li>)}
              </ol>
            )}
          </div>
        )}

        <div className="mt-8">
          {timed ? (
            <>
              <div className={cn(big, accent, "text-[clamp(96px,30vw,180px)] tabular-nums")}>
                {formatClock(remaining ?? step.seconds ?? 0)}
              </div>
              <div className="h-1.5 w-full bg-surface2 rounded-full overflow-hidden mt-2">
                <div
                  className={cn("h-full rounded-full transition-[width] duration-200 ease-linear", isRest ? "bg-accent2" : "bg-accent")}
                  style={{ width: `${fraction * 100}%` }}
                />
              </div>
              {paused && <div className="t-eyebrow text-muted mt-3">Paused</div>}
            </>
          ) : (
            <div className={cn(big, accent, "text-[clamp(56px,16vw,110px)]")}>{step.repsLabel}</div>
          )}
          <div className="mt-5 text-[16px] leading-[1.4]">
            {step.nextUp ? (
              <><span className="text-muted">Next up: </span><span className="font-semibold">{step.nextUp}</span></>
            ) : (
              <span className="text-muted">Last one. Finish strong.</span>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3 mt-6">
        <button type="button" onClick={back} disabled={index === 0} aria-label="Back" className={cn(btnGhost, "flex-none w-16 px-0")}><ChevronLeft className="w-6 h-6" /></button>
        {timed && (
          <button type="button" onClick={togglePause} className={btnGhost}>
            {paused ? <><Play className="icon" /> Resume</> : <><Pause className="icon" /> Pause</>}
          </button>
        )}
        <button type="button" onClick={advance} className={btnPrimary}>
          {timed ? <>Skip <SkipForward className="icon" /></> : <>Done <Check className="icon" /></>}
        </button>
      </div>
    </Overlay>
  );
}

/** "7 exercises, plus a warm-up and cool-down" for the ready screen. */
function readySummary(w: Workout): string {
  const n = w.exercises.length;
  const extras = [w.warmup.length ? "a warm-up" : "", w.cooldown.length ? "cool-down" : ""].filter(Boolean);
  return `${n} exercise${n === 1 ? "" : "s"}${extras.length ? `, plus ${extras.join(" and ")}` : ""}`;
}

function Overlay({ children, onClose, spans, index }: {
  children: React.ReactNode;
  onClose: () => void;
  /** The workout's parts; omitted on the ready screen (no bar yet). */
  spans?: SectionSpan[];
  /** Steps finished so far (the current step's index; total when done). */
  index?: number;
}) {
  return (
    <div className="no-print fixed inset-0 z-50 bg-bg text-text flex flex-col" role="dialog" aria-modal="true" aria-label="Go mode">
      <div className="flex-1 flex flex-col w-full max-w-[740px] mx-auto px-5 pt-4 pb-[max(20px,env(safe-area-inset-bottom))] min-h-0">
        <div className="flex items-center gap-4 mb-2">
          <div className="flex-1">{spans && <SplitProgress spans={spans} index={index ?? 0} />}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Exit go mode"
            className="inline-flex items-center justify-center bg-surface2 border border-border text-muted rounded-lg w-11 h-11 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * One bar per part (warm-up, main workout, cool-down), sized by its estimated
 * time, each filling as its steps are done. The header line names the part.
 */
function SplitProgress({ spans, index }: { spans: SectionSpan[]; index: number }) {
  const total = spans.reduce((s, x) => s + x.seconds, 0) || 1;
  return (
    <div className="flex gap-1.5" aria-hidden>
      {spans.map((sp) => {
        const fill = index >= sp.end ? 1 : index <= sp.start ? 0 : (index - sp.start) / (sp.end - sp.start);
        return (
          <div
            key={sp.section}
            title={SECTION_LABEL[sp.section]}
            style={{ flexGrow: sp.seconds / total, flexBasis: 0 }}
            className="min-w-[28px] h-2 bg-surface2 rounded-full overflow-hidden"
          >
            <div
              className={cn("h-full rounded-full transition-[width] duration-300", sp.section === "main" ? "bg-accent" : "bg-accent2")}
              style={{ width: `${fill * 100}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}
