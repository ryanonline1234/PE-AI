"use client";

// Go mode: the full-screen step player for the gym floor. One step at a time,
// big type, countdowns for timed work and rest, a tap for rep-based sets,
// and a screen wake lock so the phone doesn't dim mid-set.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildSteps, formatClock, type GoStep } from "@/lib/go-mode";
import type { Workout } from "@/lib/types";
import { cn } from "@/lib/utils";

type Phase = "ready" | "running" | "done";

const KIND_LABEL: Record<GoStep["kind"], string> = {
  warmup: "Warm-up",
  exercise: "Main workout",
  rest: "Rest",
  cooldown: "Cool-down",
};

// Rough planning estimate for rep-based sets (no timer): 45 s each.
const REP_SET_ESTIMATE = 45;

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
  const btnBase = "rounded-xl font-display uppercase tracking-[0.5px] cursor-pointer select-none transition-[opacity,transform] duration-150 active:scale-[0.98] disabled:opacity-35 disabled:cursor-not-allowed";
  const btnPrimary = cn(btnBase, "bg-accent text-bg text-[24px] font-bold min-h-[68px] px-6 flex-[2]");
  const btnGhost = cn(btnBase, "bg-surface2 border border-border text-text text-[18px] font-bold min-h-[68px] px-5 flex-1");

  // ── Ready ────────────────────────────────────────────────────
  if (phase === "ready" || !step) {
    return (
      <Overlay onClose={onClose}>
        <div className="flex-1 flex flex-col justify-center text-center px-2">
          <div className="text-[12px] font-semibold tracking-[2px] uppercase text-accent mb-3">Go mode</div>
          <div className={cn(big, "text-[clamp(44px,11vw,80px)] mb-5")}>{workout.title || "Your Workout"}</div>
          <div className="text-muted text-[16px] leading-[1.6] max-w-[420px] mx-auto">
            {total} steps · about {Math.max(1, Math.round(estimateSeconds / 60))} min. Timers run themselves;
            tap <strong className="text-text">Done</strong> after rep-based sets. Your screen stays awake.
          </div>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className={btnGhost}>Not yet</button>
          <button type="button" onClick={start} className={btnPrimary} disabled={total === 0}>▶ Start</button>
        </div>
      </Overlay>
    );
  }

  // ── Done ─────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <Overlay onClose={onClose}>
        <div className="flex-1 flex flex-col justify-center text-center px-2">
          <div className="text-[12px] font-semibold tracking-[2px] uppercase text-accent mb-3">Workout complete</div>
          <div className={cn(big, "text-[clamp(56px,16vw,120px)] text-accent mb-2")}>{formatClock(elapsed)}</div>
          <div className="text-muted text-[16px]">minutes on the floor · {workout.totalCalories} kcal planned</div>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className={btnGhost}>Close</button>
          <button type="button" onClick={onFinish} className={btnPrimary}>★ Rate it</button>
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
    <Overlay onClose={onClose} progress={index / total}>
      {/* Header line */}
      <div className="flex items-baseline justify-between text-[12px] font-semibold tracking-[2px] uppercase text-muted mb-6">
        <span>Step {index + 1} / {total} · {KIND_LABEL[step.kind]}</span>
        <span className="tabular-nums">{formatClock(elapsed)}</span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center min-h-0">
        {step.setLabel && (
          <div className={cn("text-[14px] font-semibold tracking-[2px] uppercase mb-2", accent)}>{step.setLabel}</div>
        )}
        <div className={cn(big, "text-[clamp(36px,9vw,64px)] tracking-[-1px] mb-3")}>{step.title}</div>
        {step.detail && (
          <div className="text-muted text-[16px] leading-[1.5] max-w-[560px]">{step.detail}</div>
        )}

        {step.howTo && step.howTo.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowHowTo((v) => !v)}
              className="text-[13px] font-bold text-accent bg-transparent border-0 p-0 cursor-pointer"
            >
              {showHowTo ? "Hide how-to ▴" : "How to do it ▾"}
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
              {paused && <div className="text-[13px] font-semibold tracking-[2px] uppercase text-muted mt-3">Paused</div>}
            </>
          ) : (
            <div className={cn(big, accent, "text-[clamp(56px,16vw,110px)]")}>{step.repsLabel}</div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3 mt-6">
        <button type="button" onClick={back} disabled={index === 0} className={btnGhost}>‹ Back</button>
        {timed && (
          <button type="button" onClick={togglePause} className={btnGhost}>{paused ? "Resume" : "Pause"}</button>
        )}
        <button type="button" onClick={advance} className={btnPrimary}>
          {timed ? "Skip ›" : "Done ✓"}
        </button>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose, progress }: {
  children: React.ReactNode;
  onClose: () => void;
  progress?: number;
}) {
  return (
    <div className="no-print fixed inset-0 z-50 bg-bg text-text flex flex-col" role="dialog" aria-modal="true" aria-label="Go mode">
      {/* Progress through the workout */}
      <div className="h-1 w-full bg-surface2">
        <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${(progress ?? 0) * 100}%` }} />
      </div>
      <div className="flex-1 flex flex-col w-full max-w-[740px] mx-auto px-5 pt-4 pb-[max(20px,env(safe-area-inset-bottom))] min-h-0">
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Exit go mode"
            className="bg-surface2 border border-border text-muted rounded-lg w-11 h-11 text-[18px] cursor-pointer"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
