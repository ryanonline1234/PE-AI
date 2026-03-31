"use client";

import { useState } from "react";
import { apiSaveClass, apiGetClass, apiGenerateWorkout } from "@/lib/api";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const DEFAULT_CONFIG = {
  duration: 30,
  minCalories: 150,
  equipment: "",
  intensity: "moderate",
  focus: "mixed",
  customPrompt: "",
};

// ─────────────────────────────────────────────────────────────
// Small reusable components
// ─────────────────────────────────────────────────────────────

function Chip({ label, value, current, onChange }) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      style={{
        padding: "8px 16px",
        borderRadius: 8,
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        background: active ? "rgba(200,255,0,0.12)" : "var(--surface2)",
        color: active ? "var(--accent)" : "var(--muted)",
        fontSize: 14,
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.15s",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      {label}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{
        display: "block",
        fontSize: 12,
        fontWeight: 600,
        color: "var(--muted)",
        textTransform: "uppercase",
        letterSpacing: "0.8px",
        marginBottom: 8,
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      padding: 24,
      marginBottom: 16,
      ...style,
    }}>
      {children}
    </div>
  );
}

function CardTitle({ children }) {
  return (
    <div style={{
      fontFamily: "Barlow Condensed, sans-serif",
      fontSize: 16,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      color: "var(--muted)",
      marginBottom: 18,
    }}>
      {children}
    </div>
  );
}

const MAX_W = 740;

function Layout({ view, reset, children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 16px 60px" }}>
      {/* Top bar */}
      <div style={{
        width: "100%", maxWidth: MAX_W,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "20px 0 16px",
        borderBottom: "1px solid var(--border)",
        marginBottom: 36,
      }}>
        <div style={{ fontFamily: "Barlow Condensed, sans-serif", fontSize: 28, fontWeight: 900, letterSpacing: -0.5 }}>
          PE<span style={{ color: "var(--accent)" }}>.</span>AI
        </div>
        {view !== "landing" && (
          <button
            onClick={reset}
            className="no-print"
            style={{
              background: "var(--surface2)", border: "1px solid var(--border)",
              color: "var(--muted)", padding: "8px 16px", borderRadius: 8,
              cursor: "pointer", fontSize: 14, fontFamily: "DM Sans, sans-serif",
            }}
          >
            ← Back
          </button>
        )}
      </div>

      <div style={{ width: "100%", maxWidth: MAX_W }}>
        {children}
      </div>
    </div>
  );
}

function BtnPrimary({ children, onClick, disabled, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "var(--accent)",
        color: "#0a0a0f",
        border: "none",
        borderRadius: 8,
        padding: "14px 28px",
        fontFamily: "Barlow Condensed, sans-serif",
        fontSize: 20,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        width: "100%",
        transition: "opacity 0.2s, transform 0.2s",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function BtnSecondary({ children, onClick, disabled, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "var(--surface2)",
        color: "var(--text)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "12px 24px",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 15,
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        width: "100%",
        transition: "all 0.2s",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function TextInput({ value, onChange, placeholder, style, maxLength, className }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      style={{
        width: "100%",
        background: "var(--surface2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        color: "var(--text)",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 15,
        padding: "12px 14px",
        outline: "none",
        ...style,
      }}
    />
  );
}

function Textarea({ value, onChange, placeholder }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        background: "var(--surface2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        color: "var(--text)",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 15,
        padding: "12px 14px",
        outline: "none",
        resize: "vertical",
        minHeight: 80,
      }}
    />
  );
}

function Alert({ type, children }) {
  const colors = {
    error:   { bg: "rgba(255,77,109,0.08)", border: "rgba(255,77,109,0.3)", color: "var(--danger)" },
    success: { bg: "rgba(200,255,0,0.08)",  border: "rgba(200,255,0,0.25)", color: "var(--accent)" },
  };
  const c = colors[type];
  return (
    <div style={{
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 8,
      padding: "13px 16px",
      color: c.color,
      fontSize: 14,
      marginTop: 12,
    }}>
      {children}
    </div>
  );
}

function youtubeSearchUrl(exerciseName) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(exerciseName + " exercise how to")}`;
}

function Spinner() {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px" }}>
      <div style={{
        width: 48, height: 48,
        border: "3px solid var(--border)",
        borderTopColor: "var(--accent)",
        borderRadius: "50%",
        animation: "pe-spin 0.8s linear infinite",
        margin: "0 auto 20px",
      }} />
      <style>{`@keyframes pe-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{
        fontFamily: "Barlow Condensed, sans-serif",
        fontSize: 22,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 1,
        color: "var(--muted)",
      }}>
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
  const [view, setView] = useState("landing");

  // Teacher state
  const [classCode,      setClassCode]      = useState("");
  const [config,         setConfig]         = useState(DEFAULT_CONFIG);
  const [loadCodeInput,  setLoadCodeInput]  = useState("");
  const [saveMsg,        setSaveMsg]        = useState("");
  const [copied,         setCopied]         = useState(false);

  // Student state
  const [studentCode,    setStudentCode]    = useState("");
  const [studentName,    setStudentName]    = useState("");
  const [fitnessLevel,   setFitnessLevel]   = useState("moderate");
  const [limitations,    setLimitations]    = useState("");
  const [preferences,    setPreferences]    = useState("");
  const [expandedExercise, setExpandedExercise] = useState(null);
  const [showRegeneratePanel, setShowRegeneratePanel] = useState(false);
  const [regenerateFeedback,  setRegenerateFeedback]  = useState("");

  // Shared
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState("");
  const [workout,        setWorkout]        = useState(null);

  // ── Helpers ──────────────────────────────────────────────

  function reset() {
    setView("landing");
    setError(""); setSaveMsg("");
    setWorkout(null);
    setStudentCode(""); setStudentName(""); setLimitations("");
    setFitnessLevel("moderate");
    setLoadCodeInput("");
  }

  function cfgSet(key, value) {
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
      setError(e.message);
    }
    setLoading(false);
  }

  async function saveClass() {
    setLoading(true); setError(""); setSaveMsg("");
    try {
      await apiSaveClass(classCode, config);
      setSaveMsg("Saved! Share this code with your students.");
    } catch (e) {
      setError(e.message);
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
      setError(e.message);
    }
    setLoading(false);
  }

  async function generateWorkout(feedback = "") {
    setLoading(true); setError(""); setWorkout(null);
    setShowRegeneratePanel(false); setRegenerateFeedback("");
    try {
      const w = await apiGenerateWorkout({
        code: studentCode.toUpperCase(),
        studentName, fitnessLevel, limitations, preferences,
        regenerateFeedback: feedback,
      });
      setWorkout(w);
      setView("workout");
    } catch (e) {
      setError(e.message);
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
      <div style={{ textAlign: "center", paddingTop: 16 }}>
        <div style={{
          display: "inline-block",
          background: "rgba(200,255,0,0.12)",
          color: "var(--accent)",
          fontSize: 11, fontWeight: 600, letterSpacing: 2,
          textTransform: "uppercase",
          padding: "6px 14px", borderRadius: 100,
          border: "1px solid rgba(200,255,0,0.25)",
          marginBottom: 20,
        }}>
          ⚡ AI-Powered PE Workouts
        </div>

        <h1 style={{
          fontFamily: "Barlow Condensed, sans-serif",
          fontSize: "clamp(52px, 12vw, 88px)",
          fontWeight: 900, lineHeight: 0.92,
          textTransform: "uppercase", letterSpacing: -2,
          marginBottom: 20,
        }}>
          Your PE Class<br /><span style={{ color: "var(--accent)" }}>Just Got Smarter</span>
        </h1>

        <p style={{ color: "var(--muted)", fontSize: 17, lineHeight: 1.6, marginBottom: 48, maxWidth: 460, margin: "0 auto 48px" }}>
          Teachers set the parameters. Students get personalized AI-generated workouts. Fast, safe, and built for the gym floor.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            { icon: "🏫", label: "I'm a Teacher", desc: "Create a class, set workout parameters, and share a code with your students.", action: () => { setView("teacher"); createNewClass(); } },
            { icon: "🏃", label: "I'm a Student", desc: "Enter your class code and get an AI-generated workout tailored to you.",         action: () => setView("student") },
          ].map(({ icon, label, desc, action }) => (
            <div
              key={label}
              onClick={action}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "32px 24px",
                cursor: "pointer",
                textAlign: "left",
                transition: "border-color 0.2s, transform 0.2s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "none"; }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
              <div style={{ fontFamily: "Barlow Condensed, sans-serif", fontSize: 26, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
              <div style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );

  // ── TEACHER ───────────────────────────────────────────────────
  if (view === "teacher") return (
    <Layout view={view} reset={reset}>
      <div style={{ fontFamily: "Barlow Condensed, sans-serif", fontSize: 42, fontWeight: 900, textTransform: "uppercase", letterSpacing: -1, marginBottom: 4 }}>
        Teacher Dashboard
      </div>
      <div style={{ color: "var(--muted)", fontSize: 15, marginBottom: 32 }}>
        Configure your class and share the code with students.
      </div>

      {/* Load existing */}
      <Card>
        <CardTitle>Load Existing Class</CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "flex-end" }}>
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
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0 16px", color: "var(--muted)", fontSize: 13 }}>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        or create new
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>

      <BtnSecondary onClick={createNewClass} style={{ marginBottom: 20 }}>
        ✦ Create New Class → Generates Fresh Code
      </BtnSecondary>

      {/* Code display */}
      {classCode && (
        <>
          <div style={{
            background: "var(--surface2)",
            border: "1.5px solid var(--accent)",
            borderRadius: "var(--radius)",
            padding: 28, textAlign: "center", marginBottom: 16,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>Your Class Code</div>
            <div style={{ fontFamily: "Barlow Condensed, sans-serif", fontSize: 56, fontWeight: 900, color: "var(--accent)", letterSpacing: 8, lineHeight: 1, marginBottom: 14 }}>
              {classCode}
            </div>
            <button
              onClick={copyCode}
              style={{
                background: "rgba(200,255,0,0.1)", border: "1px solid rgba(200,255,0,0.3)",
                color: "var(--accent)", padding: "8px 20px", borderRadius: 6,
                cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "DM Sans, sans-serif",
              }}
            >
              {copied ? "✓ Copied!" : "Copy Code"}
            </button>
          </div>

          <Card>
            <CardTitle>Workout Parameters</CardTitle>

            <Field label={`Duration — ${config.duration} min`}>
              <input type="range" min="10" max="90" step="5" value={config.duration}
                onChange={e => cfgSet("duration", +e.target.value)}
                style={{ width: "100%", accentColor: "var(--accent)" }}
              />
            </Field>

            <Field label={`Min Calories to Burn — ${config.minCalories} kcal`}>
              <input type="range" min="50" max="600" step="25" value={config.minCalories}
                onChange={e => cfgSet("minCalories", +e.target.value)}
                style={{ width: "100%", accentColor: "var(--accent)" }}
              />
            </Field>

            <Field label="Intensity">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[["Low","low"],["Moderate","moderate"],["High","high"]].map(([l,v]) =>
                  <Chip key={v} label={l} value={v} current={config.intensity} onChange={val => cfgSet("intensity", val)} />
                )}
              </div>
            </Field>

            <Field label="Workout Focus">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[["Mixed","mixed"],["Cardio","cardio"],["Strength","strength"],["Flexibility","flexibility"]].map(([l,v]) =>
                  <Chip key={v} label={l} value={v} current={config.focus} onChange={val => cfgSet("focus", val)} />
                )}
              </div>
            </Field>

            <Field label="Equipment Available">
              <Textarea
                value={config.equipment}
                onChange={v => cfgSet("equipment", v.slice(0, 500))}
                placeholder="e.g. No equipment — bodyweight only, resistance bands, mats, jump ropes, full gym with free weights…"
              />
            </Field>

            <Field label="Custom Instructions (optional — max 500 chars)">
              <Textarea
                value={config.customPrompt}
                onChange={v => cfgSet("customPrompt", v.slice(0, 500))}
                placeholder="e.g. Focus on teamwork exercises, avoid jumping movements, theme this week around the Olympics…"
              />
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, textAlign: "right" }}>
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
      <div style={{ fontFamily: "Barlow Condensed, sans-serif", fontSize: 42, fontWeight: 900, textTransform: "uppercase", letterSpacing: -1, marginBottom: 4 }}>
        Join Your Class
      </div>
      <div style={{ color: "var(--muted)", fontSize: 15, marginBottom: 32 }}>
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
          <div style={{ fontFamily: "Barlow Condensed, sans-serif", fontSize: 42, fontWeight: 900, textTransform: "uppercase", letterSpacing: -1, marginBottom: 4 }}>
            Let's Build Your Workout
          </div>
          <div style={{ color: "var(--muted)", fontSize: 15, marginBottom: 32 }}>
            Class <strong style={{ color: "var(--accent)" }}>{studentCode.toUpperCase()}</strong> · {config.duration} min · {config.minCalories}+ kcal · {config.intensity} intensity
          </div>

          <Card>
            <Field label="Your Name (optional)">
              <TextInput value={studentName} onChange={setStudentName} placeholder="First name is fine" maxLength={50} />
            </Field>

            <Field label="How fit do you feel today?">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[["Just Starting Out","beginner"],["Feeling Good","moderate"],["Let's Go Hard","advanced"]].map(([l,v]) =>
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

            <Field label="Personal Preferences (optional)">
              <Textarea
                value={preferences}
                onChange={v => setPreferences(v.slice(0, 300))}
                placeholder="e.g. I love music-based exercises, hate running, enjoy partner workouts, prefer bodyweight over weights…"
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
      <div className="print-card" style={{
        background: "linear-gradient(135deg, var(--surface) 0%, #1a1a2e 100%)",
        border: "1px solid var(--border)",
        borderTop: "3px solid var(--accent)",
        borderRadius: "var(--radius)",
        padding: 28, marginBottom: 16,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: "var(--accent)", marginBottom: 6 }}>
          {studentName ? `${studentName}'s Workout` : "Your Workout"}
        </div>
        <div style={{ fontFamily: "Barlow Condensed, sans-serif", fontSize: 40, fontWeight: 900, textTransform: "uppercase", lineHeight: 1, marginBottom: 18 }}>
          {workout.title}
        </div>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          {[
            [workout.totalCalories, "Calories"],
            [`${workout.totalDuration}m`, "Duration"],
            [workout.exercises?.length ?? 0, "Exercises"],
          ].map(([num, lbl]) => (
            <div key={lbl}>
              <div style={{ fontFamily: "Barlow Condensed, sans-serif", fontSize: 34, fontWeight: 700, color: "var(--accent2)", lineHeight: 1 }}>{num}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginTop: 2 }}>{lbl}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Warm-up */}
      {workout.warmup?.length > 0 && (
        <Card>
          <div style={{ fontFamily: "Barlow Condensed, sans-serif", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)", paddingBottom: 10, borderBottom: "1px solid var(--border)", marginBottom: 12 }}>
            🔥 Warm-Up
          </div>
          {workout.warmup.map((w, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: i < workout.warmup.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 15 }}>{w.name}</div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{w.description}</div>
              </div>
              <div style={{ fontSize: 14, color: "var(--muted)", flexShrink: 0, marginLeft: 12 }}>{w.duration}</div>
            </div>
          ))}
        </Card>
      )}

      {/* Main exercises */}
      <Card>
        <div style={{ fontFamily: "Barlow Condensed, sans-serif", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)", paddingBottom: 10, borderBottom: "1px solid var(--border)", marginBottom: 12 }}>
          💪 Main Workout
        </div>
        {workout.exercises?.map((ex, i) => {
          const isExpanded = expandedExercise === i;
          return (
            <div
              key={i}
              onClick={() => setExpandedExercise(prev => (prev === i ? null : i))}
              style={{
                background: "var(--surface2)", border: "1px solid var(--border)",
                borderRadius: 10, padding: 16, marginBottom: 10,
                cursor: "pointer",
                display: "flex", flexDirection: "column", gap: 12,
                transition: "box-shadow 0.2s",
                boxShadow: isExpanded ? "0 9px 18px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{ex.name}</div>
                  <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.4 }}>{ex.tip}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: "Barlow Condensed, sans-serif", fontSize: 16, fontWeight: 700, color: "var(--accent)", whiteSpace: "nowrap" }}>
                    {ex.sets} × {ex.reps}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Rest {ex.rest}</div>
                  <div style={{ fontSize: 12, color: "var(--accent2)", marginTop: 2 }}>{ex.calories} kcal</div>
                </div>
                <div style={{ color: "var(--muted)", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.25s" }}>
                  ▾
                </div>
              </div>

              <div style={{
                maxHeight: isExpanded ? 240 : 0,
                overflow: "hidden",
                transition: "max-height 0.25s ease",
                borderTop: `1px solid var(--border)`,
                paddingTop: isExpanded ? 12 : 0,
              }}>
                {isExpanded && ex.howTo && ex.howTo.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: "var(--muted)", marginBottom: 8 }}>
                      HOW TO DO IT
                    </div>
                    <ol style={{ margin: 0, paddingLeft: 20, marginBottom: 8 }}>
                      {ex.howTo.map((step, idx) => (
                        <li key={idx} style={{ fontSize: 13, marginBottom: 4 }}>{step}</li>
                      ))}
                    </ol>
                  </>
                )}

                {isExpanded && (
                  <a
                    href={youtubeSearchUrl(ex.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700, textDecoration: "none" }}
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
          <div style={{ fontFamily: "Barlow Condensed, sans-serif", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)", paddingBottom: 10, borderBottom: "1px solid var(--border)", marginBottom: 12 }}>
            🧘 Cool-Down
          </div>
          {workout.cooldown.map((w, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: i < workout.cooldown.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 15 }}>{w.name}</div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{w.description}</div>
              </div>
              <div style={{ fontSize: 14, color: "var(--muted)", flexShrink: 0, marginLeft: 12 }}>{w.duration}</div>
            </div>
          ))}
        </Card>
      )}



      {showRegeneratePanel && (
        <div className="no-print" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 18, marginTop: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>What would you like to improve or add?</div>
          <Textarea
            value={regenerateFeedback}
            onChange={v => setRegenerateFeedback(v.slice(0, 300))}
            placeholder="e.g. More core exercises, less running, add stretching at the end…"
          />
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <BtnSecondary style={{ flex: 1 }} onClick={() => setShowRegeneratePanel(false)}>Cancel</BtnSecondary>
            <BtnPrimary style={{ flex: 2 }} onClick={() => generateWorkout(regenerateFeedback)} disabled={loading}>
              ⚡ Regenerate
            </BtnPrimary>
          </div>
        </div>
      )}

      <div className="no-print" style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <BtnSecondary style={{ flex: 1 }} onClick={() => { setShowRegeneratePanel(v => !v); }}>
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
