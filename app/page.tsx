"use client";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { apiSaveClass, apiGetClass, apiGenerateWorkout } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ClassConfig, FitnessLevel, Workout } from "@/lib/types";

type View = "landing" | "teacher" | "student" | "student-form" | "workout";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const DEFAULT_CONFIG: ClassConfig = {
  duration: 30,
  minCalories: 150,
  equipment: "none",
  intensity: "moderate",
  focus: "mixed",
  customPrompt: "",
};

// ─────────────────────────────────────────────────────────────
// Small reusable components
// ─────────────────────────────────────────────────────────────

function Chip<T extends string>({ label, value, current, onChange }: {
  label: string;
  value: T;
  current: T;
  onChange: (value: T) => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={cn(
        "rounded-lg border px-4 py-2 font-body text-[14px] font-medium cursor-pointer transition-all duration-150",
        active
          ? "border-accent bg-[rgba(200,255,0,0.12)] text-accent"
          : "border-border bg-surface2 text-muted"
      )}
    >
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <label className="block text-[12px] font-semibold text-muted uppercase tracking-[0.8px] mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-6 mb-4" style={style}>
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: ReactNode }) {
  return (
    <div className="font-display text-[16px] font-bold uppercase tracking-[0.5px] text-muted mb-[18px]">
      {children}
    </div>
  );
}

function Layout({ view, reset, children }: { view: View; reset: () => void; children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center px-4 pb-[60px]">
      {/* Top bar */}
      <div className="w-full max-w-[740px] flex items-center justify-between pt-5 pb-4 border-b border-border mb-9">
        <div className="font-display text-[28px] font-black tracking-[-0.5px]">
          PE<span className="text-accent">.</span>AI
        </div>
        {view !== "landing" && (
          <button
            onClick={reset}
            className="no-print bg-surface2 border border-border text-muted px-4 py-2 rounded-lg cursor-pointer text-[14px] font-body"
          >
            ← Back
          </button>
        )}
      </div>

      <div className="w-full max-w-[740px]">
        {children}
      </div>
    </div>
  );
}

function BtnPrimary({ children, onClick, disabled, style }: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full bg-accent text-bg border-0 rounded-lg px-7 py-3.5 font-display text-[20px] font-bold uppercase tracking-[0.5px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 transition-[opacity,transform] duration-200"
      style={style}
    >
      {children}
    </button>
  );
}

function BtnSecondary({ children, onClick, disabled, style }: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full bg-surface2 text-text border border-border rounded-lg px-6 py-3 font-body text-[15px] font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 transition-all duration-200"
      style={style}
    >
      {children}
    </button>
  );
}

function TextInput({ value, onChange, placeholder, style, maxLength, className }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  style?: CSSProperties;
  maxLength?: number;
  className?: string;
  // NOTE: call sites pass `onBlur` (and `className`), but neither is wired into
  // the <input> below. Kept as-is to preserve original (no-op) behavior in the
  // Phase 0 migration — do not "fix" without explicit sign-off. See MEMORY.md.
  onBlur?: () => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className={cn(
        "w-full bg-surface2 border border-border rounded-lg text-text font-body text-[15px] px-3.5 py-3 outline-none",
        className
      )}
      style={style}
    />
  );
}

function Textarea({ value, onChange, placeholder }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-surface2 border border-border rounded-lg text-text font-body text-[15px] px-3.5 py-3 outline-none resize-y min-h-[80px]"
    />
  );
}

function Alert({ type, children }: { type: "error" | "success"; children: ReactNode }) {
  const styles: Record<"error" | "success", string> = {
    error:   "bg-[rgba(255,77,109,0.08)] border-[rgba(255,77,109,0.3)] text-danger",
    success: "bg-[rgba(200,255,0,0.08)] border-[rgba(200,255,0,0.25)] text-accent",
  };
  return (
    <div className={cn("rounded-lg border px-4 py-[13px] text-[14px] mt-3", styles[type])}>
      {children}
    </div>
  );
}

function youtubeSearchUrl(exerciseName: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(exerciseName + " exercise how to")}`;
}

function Spinner() {
  return (
    <div className="text-center px-5 py-[60px]">
      <div className="w-12 h-12 border-[3px] border-border border-t-accent rounded-full mx-auto mb-5 animate-[pe-spin_0.8s_linear_infinite]" />
      <div className="font-display text-[22px] font-bold uppercase tracking-[1px] text-muted">
        Building your workout…
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────

export default function PEApp() {
  // Routing
  const [view, setView] = useState<View>("landing");

  // Teacher state
  const [classCode,      setClassCode]      = useState("");
  const [config,         setConfig]         = useState<ClassConfig>(DEFAULT_CONFIG);
  const [loadCodeInput,  setLoadCodeInput]  = useState("");
  const [saveMsg,        setSaveMsg]        = useState("");
  const [copied,         setCopied]         = useState(false);

  // Student state
  const [studentCode,    setStudentCode]    = useState("");
  const [studentName,    setStudentName]    = useState("");
  const [fitnessLevel,   setFitnessLevel]   = useState<FitnessLevel>("moderate");
  const [limitations,    setLimitations]    = useState("");
  const [expandedExercise, setExpandedExercise] = useState<number | null>(null);

  // Shared
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState("");
  const [workout,        setWorkout]        = useState<Workout | null>(null);

  // ── Helpers ──────────────────────────────────────────────

  function reset() {
    setView("landing");
    setError(""); setSaveMsg("");
    setWorkout(null);
    setStudentCode(""); setStudentName(""); setLimitations("");
    setFitnessLevel("moderate");
    setLoadCodeInput("");
  }

  function cfgSet<K extends keyof ClassConfig>(key: K, value: ClassConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  // ── Teacher actions ───────────────────────────────────────

  function createNewClass() {
    setClassCode(genCode());
    setConfig(DEFAULT_CONFIG);
    setSaveMsg(""); setError("");
  }

  async function loadClass() {
    const code = loadCodeInput.toUpperCase().trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) { setError("Enter a valid 6-character class code."); return; }
    setLoading(true); setError("");
    try {
      const cfg = await apiGetClass(code);
      setClassCode(code);
      setConfig(cfg);
      setSaveMsg("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }

  async function saveClass() {
    setLoading(true); setError(""); setSaveMsg("");
    try {
      await apiSaveClass(classCode, config);
      setSaveMsg("Saved! Share this code with your students.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }

  // ── Student actions ───────────────────────────────────────

  async function joinClass() {
    const code = studentCode.toUpperCase().trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) { setError("Enter a 6-character class code."); return; }
    setLoading(true); setError("");
    try {
      const cfg = await apiGetClass(code);
      setConfig(cfg);
      setView("student-form");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }

  async function generateWorkout() {
    setLoading(true); setError(""); setWorkout(null);
    try {
      const w = await apiGenerateWorkout({
        code: studentCode.toUpperCase(),
        studentName, fitnessLevel, limitations,
      });
      setWorkout(w);
      setView("workout");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }

  function copyCode() {
    navigator.clipboard.writeText(classCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }


  // ─────────────────────────────────────────────────────────────
  // Views
  // ─────────────────────────────────────────────────────────────

  // ── LANDING ──────────────────────────────────────────────────
  if (view === "landing") return (
    <Layout view={view} reset={reset}>
      <div className="text-center pt-4">
        <div className="inline-block bg-[rgba(200,255,0,0.12)] text-accent text-[11px] font-semibold tracking-[2px] uppercase px-3.5 py-1.5 rounded-full border border-[rgba(200,255,0,0.25)] mb-5">
          ⚡ AI-Powered PE Workouts
        </div>

        <h1 className="font-display text-[clamp(52px,12vw,88px)] font-black leading-[0.92] uppercase tracking-[-2px] mb-5">
          Your PE Class<br /><span className="text-accent">Just Got Smarter</span>
        </h1>

        <p className="text-muted text-[17px] leading-[1.6] mb-12 max-w-[460px] mx-auto">
          Teachers set the parameters. Students get personalized AI-generated workouts. Fast, safe, and built for the gym floor.
        </p>

        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: "🏫", label: "I'm a Teacher", desc: "Create a class, set workout parameters, and share a code with your students.", action: () => { setView("teacher"); createNewClass(); } },
            { icon: "🏃", label: "I'm a Student", desc: "Enter your class code and get an AI-generated workout tailored to you.",         action: () => setView("student") },
          ].map(({ icon, label, desc, action }) => (
            <div
              key={label}
              onClick={action}
              className="bg-surface border border-border rounded-xl px-6 py-8 cursor-pointer text-left transition-[border-color,transform] duration-200 hover:border-accent hover:-translate-y-0.5"
            >
              <div className="text-[36px] mb-3">{icon}</div>
              <div className="font-display text-[26px] font-bold uppercase mb-1.5">{label}</div>
              <div className="text-muted text-[14px] leading-[1.5]">{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );

  // ── TEACHER ───────────────────────────────────────────────────
  if (view === "teacher") return (
    <Layout view={view} reset={reset}>
      <div className="font-display text-[42px] font-black uppercase tracking-[-1px] mb-1">
        Teacher Dashboard
      </div>
      <div className="text-muted text-[15px] mb-8">
        Configure your class and share the code with students.
      </div>

      {/* Load existing */}
      <Card>
        <CardTitle>Load Existing Class</CardTitle>
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          <Field label="Class Code">
            <TextInput
              value={loadCodeInput}
              onChange={v => setLoadCodeInput(v.replace(/[^A-Za-z0-9]/g, "").slice(0, 6))}
              onBlur={() => setLoadCodeInput(v => v.toUpperCase())}
              placeholder="ABCD12"
              maxLength={6}
              style={{ fontFamily: "Barlow Condensed, sans-serif", fontSize: 28, fontWeight: 700, letterSpacing: 6, textAlign: "center" }}
            />
          </Field>
          <BtnSecondary onClick={loadClass} disabled={loading} style={{ width: "auto", whiteSpace: "nowrap" }}>
            Load Class
          </BtnSecondary>
        </div>
      </Card>

      {/* Divider */}
      <div className="flex items-center gap-3 mt-2 mb-4 text-muted text-[13px]">
        <div className="flex-1 h-px bg-border" />
        or create new
        <div className="flex-1 h-px bg-border" />
      </div>

      <BtnSecondary onClick={createNewClass} style={{ marginBottom: 20 }}>
        ✦ Create New Class → Generates Fresh Code
      </BtnSecondary>

      {/* Code display */}
      {classCode && (
        <>
          <div className="bg-surface2 border-[1.5px] border-accent rounded-xl p-7 text-center mb-4">
            <div className="text-[11px] font-semibold tracking-[2px] uppercase text-muted mb-2">Your Class Code</div>
            <div className="font-display text-[56px] font-black text-accent tracking-[8px] leading-none mb-3.5">
              {classCode}
            </div>
            <button
              onClick={copyCode}
              className="bg-[rgba(200,255,0,0.1)] border border-[rgba(200,255,0,0.3)] text-accent px-5 py-2 rounded-md cursor-pointer text-[13px] font-semibold font-body"
            >
              {copied ? "✓ Copied!" : "Copy Code"}
            </button>
          </div>

          <Card>
            <CardTitle>Workout Parameters</CardTitle>

            <Field label={`Duration — ${config.duration} min`}>
              <input type="range" min="10" max="90" step="5" value={config.duration}
                onChange={e => cfgSet("duration", +e.target.value)}
                className="w-full accent-accent"
              />
            </Field>

            <Field label={`Min Calories to Burn — ${config.minCalories} kcal`}>
              <input type="range" min="50" max="600" step="25" value={config.minCalories}
                onChange={e => cfgSet("minCalories", +e.target.value)}
                className="w-full accent-accent"
              />
            </Field>

            <Field label="Intensity">
              <div className="flex flex-wrap gap-2">
                {([["Low","low"],["Moderate","moderate"],["High","high"]] as const).map(([l,v]) =>
                  <Chip key={v} label={l} value={v} current={config.intensity} onChange={val => cfgSet("intensity", val)} />
                )}
              </div>
            </Field>

            <Field label="Workout Focus">
              <div className="flex flex-wrap gap-2">
                {([["Mixed","mixed"],["Cardio","cardio"],["Strength","strength"],["Flexibility","flexibility"]] as const).map(([l,v]) =>
                  <Chip key={v} label={l} value={v} current={config.focus} onChange={val => cfgSet("focus", val)} />
                )}
              </div>
            </Field>

            <Field label="Equipment Available">
              <div className="flex flex-wrap gap-2">
                {([["No Equipment","none"],["Basic Gear","basic"],["Full Gym","gym"]] as const).map(([l,v]) =>
                  <Chip key={v} label={l} value={v} current={config.equipment} onChange={val => cfgSet("equipment", val)} />
                )}
              </div>
            </Field>

            <Field label="Custom Instructions (optional — max 500 chars)">
              <Textarea
                value={config.customPrompt}
                onChange={v => cfgSet("customPrompt", v.slice(0, 500))}
                placeholder="e.g. Focus on teamwork exercises, avoid jumping movements, theme this week around the Olympics…"
              />
              <div className="text-[12px] text-muted mt-1 text-right">
                {config.customPrompt.length}/500
              </div>
            </Field>
          </Card>

          <BtnPrimary onClick={saveClass} disabled={loading}>
            {loading ? "Saving…" : "Save Class Settings"}
          </BtnPrimary>
          {saveMsg && <Alert type="success">{saveMsg}</Alert>}
        </>
      )}

      {error && <Alert type="error">{error}</Alert>}
    </Layout>
  );

  // ── STUDENT: enter code ───────────────────────────────────────
  if (view === "student") return (
    <Layout view={view} reset={reset}>
      <div className="font-display text-[42px] font-black uppercase tracking-[-1px] mb-1">
        Join Your Class
      </div>
      <div className="text-muted text-[15px] mb-8">
        Enter the code your teacher shared with you.
      </div>

      <Card>
        <Field label="Class Code">
          <TextInput
            value={studentCode}
            onChange={v => setStudentCode(v.replace(/[^A-Za-z0-9]/g, "").slice(0, 6))}
            onBlur={() => setStudentCode(v => v.toUpperCase())}
            placeholder="ABCD12"
            maxLength={6}
            style={{ fontFamily: "Barlow Condensed, sans-serif", fontSize: 36, fontWeight: 700, letterSpacing: 8, textAlign: "center" }}
          />
        </Field>
        <BtnPrimary onClick={joinClass} disabled={loading || studentCode.length < 6}>
          {loading ? "Looking up class…" : "Join Class →"}
        </BtnPrimary>
        {error && <Alert type="error">{error}</Alert>}
      </Card>
    </Layout>
  );

  // ── STUDENT: form ─────────────────────────────────────────────
  if (view === "student-form") return (
    <Layout view={view} reset={reset}>
      {loading ? <Spinner /> : (
        <>
          <div className="font-display text-[42px] font-black uppercase tracking-[-1px] mb-1">
            Let's Build Your Workout
          </div>
          <div className="text-muted text-[15px] mb-8">
            Class <strong className="text-accent">{studentCode.toUpperCase()}</strong> · {config.duration} min · {config.minCalories}+ kcal · {config.intensity} intensity
          </div>

          <Card>
            <Field label="Your Name (optional)">
              <TextInput value={studentName} onChange={setStudentName} placeholder="First name is fine" maxLength={50} />
            </Field>

            <Field label="How fit do you feel today?">
              <div className="flex flex-wrap gap-2">
                {([["Just Starting Out","beginner"],["Feeling Good","moderate"],["Let's Go Hard","advanced"]] as const).map(([l,v]) =>
                  <Chip key={v} label={l} value={v} current={fitnessLevel} onChange={setFitnessLevel} />
                )}
              </div>
            </Field>

            <Field label="Injuries or Limitations? (optional)">
              <Textarea
                value={limitations}
                onChange={setLimitations}
                placeholder="e.g. Sprained left ankle, avoid jumping. Leave blank if you're good to go!"
              />
            </Field>
          </Card>

          <BtnPrimary onClick={generateWorkout} disabled={loading}>
            ⚡ Generate My Workout
          </BtnPrimary>
          {error && <Alert type="error">{error}</Alert>}
        </>
      )}
    </Layout>
  );

  // ── WORKOUT DISPLAY ───────────────────────────────────────────
  if (view === "workout" && workout) return (
    <Layout view={view} reset={reset}>
      {/* Hero */}
      <div className="print-card bg-[linear-gradient(135deg,#13131c_0%,#1a1a2e_100%)] border border-border border-t-[3px] border-t-accent rounded-xl p-7 mb-4">
        <div className="text-[11px] font-semibold tracking-[2px] uppercase text-accent mb-1.5">
          {studentName ? `${studentName}'s Workout` : "Your Workout"}
        </div>
        <div className="font-display text-[40px] font-black uppercase leading-none mb-[18px]">
          {workout.title}
        </div>
        <div className="flex gap-7 flex-wrap">
          {[
            [workout.totalCalories, "Calories"],
            [`${workout.totalDuration}m`, "Duration"],
            [workout.exercises?.length ?? 0, "Exercises"],
          ].map(([num, lbl]) => (
            <div key={lbl}>
              <div className="font-display text-[34px] font-bold text-accent2 leading-none">{num}</div>
              <div className="text-[11px] text-muted uppercase tracking-[0.8px] mt-0.5">{lbl}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Warm-up */}
      {workout.warmup?.length > 0 && (
        <Card>
          <div className="font-display text-[13px] font-bold uppercase tracking-[2px] text-muted pb-2.5 border-b border-border mb-3">
            🔥 Warm-Up
          </div>
          {workout.warmup.map((w, i) => (
            <div key={i} className={cn("flex justify-between py-[11px]", i < workout.warmup.length - 1 ? "border-b border-border" : "")}>
              <div>
                <div className="font-medium text-[15px]">{w.name}</div>
                <div className="text-[13px] text-muted mt-0.5">{w.description}</div>
              </div>
              <div className="text-[14px] text-muted shrink-0 ml-3">{w.duration}</div>
            </div>
          ))}
        </Card>
      )}

      {/* Main exercises */}
      <Card>
        <div className="font-display text-[13px] font-bold uppercase tracking-[2px] text-muted pb-2.5 border-b border-border mb-3">
          💪 Main Workout
        </div>
        {workout.exercises?.map((ex, i) => {
          const isExpanded = expandedExercise === i;
          return (
            <div
              key={i}
              onClick={() => setExpandedExercise(prev => (prev === i ? null : i))}
              className={cn(
                "bg-surface2 border border-border rounded-[10px] p-4 mb-2.5 cursor-pointer flex flex-col gap-3 transition-shadow duration-200",
                isExpanded ? "shadow-[0_9px_18px_rgba(0,0,0,0.08)]" : "shadow-none"
              )}
            >
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-[16px] mb-1">{ex.name}</div>
                  <div className="text-muted text-[13px] leading-[1.4]">{ex.tip}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display text-[16px] font-bold text-accent whitespace-nowrap">
                    {ex.sets} × {ex.reps}
                  </div>
                  <div className="text-[12px] text-muted mt-0.5">Rest {ex.rest}</div>
                  <div className="text-[12px] text-accent2 mt-0.5">{ex.calories} kcal</div>
                </div>
                <div className={cn("text-muted transition-transform duration-[250ms]", isExpanded ? "rotate-180" : "rotate-0")}>
                  ▾
                </div>
              </div>

              <div className={cn("overflow-hidden transition-[max-height] duration-[250ms] border-t border-border", isExpanded ? "max-h-[240px] pt-3" : "max-h-0 pt-0")}>
                {isExpanded && ex.howTo && ex.howTo.length > 0 && (
                  <>
                    <div className="text-[12px] font-bold tracking-[1px] text-muted mb-2">
                      HOW TO DO IT
                    </div>
                    <ol className="pl-5 mb-2 list-decimal">
                      {ex.howTo.map((step, idx) => (
                        <li key={idx} className="text-[13px] mb-1">{step}</li>
                      ))}
                    </ol>
                  </>
                )}

                {isExpanded && (
                  <a
                    href={youtubeSearchUrl(ex.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] text-accent font-bold no-underline"
                    onClick={e => e.stopPropagation()}
                  >
                    Watch on YouTube ↗
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </Card>

      {/* Cool-down */}
      {workout.cooldown?.length > 0 && (
        <Card>
          <div className="font-display text-[13px] font-bold uppercase tracking-[2px] text-muted pb-2.5 border-b border-border mb-3">
            🧘 Cool-Down
          </div>
          {workout.cooldown.map((w, i) => (
            <div key={i} className={cn("flex justify-between py-[11px]", i < workout.cooldown.length - 1 ? "border-b border-border" : "")}>
              <div>
                <div className="font-medium text-[15px]">{w.name}</div>
                <div className="text-[13px] text-muted mt-0.5">{w.description}</div>
              </div>
              <div className="text-[14px] text-muted shrink-0 ml-3">{w.duration}</div>
            </div>
          ))}
        </Card>
      )}

      {/* Coach note */}
      {workout.coachNote && (
        <div className="bg-[rgba(200,255,0,0.06)] border border-[rgba(200,255,0,0.2)] rounded-[10px] p-[18px] mb-4">
          <div className="text-[11px] font-semibold tracking-[1.5px] uppercase text-accent mb-1.5">
            Coach Says
          </div>
          <div className="text-[15px] italic leading-[1.6]">"{workout.coachNote}"</div>
        </div>
      )}

      <div className="no-print flex gap-2.5 mt-2">
        <BtnSecondary style={{ flex: 1 }} onClick={() => { setWorkout(null); setView("student-form"); }}>
          ↩ Regenerate
        </BtnSecondary>
        <BtnPrimary style={{ flex: 2 }} onClick={() => window.print()}>
          🖨 Print Workout
        </BtnPrimary>
      </div>
    </Layout>
  );

  return null;
}
