"use client";

import { useEffect, useRef, useState } from "react";
import { apiSaveClass, apiGetClass, apiGenerateWorkoutStream, apiGenerateReport, apiClarifyClass } from "@/lib/api";
import { configSignature } from "@/lib/class-config";
import { cn } from "@/lib/utils";
import { recallTeacherKey, rememberTeacherKey } from "@/lib/teacher-key-store";
import { applyEvent } from "@/lib/workout-stream";
import { EMPTY_WORKOUT, type AskQuestion, type ClassCheck, type ClassConfig, type FitnessLevel, type QA, type ReportMeta, type Workout } from "@/lib/types";
import { QuestionList, collectAnswers, NO_ANSWERS, type Answers } from "@/components/QuestionList";
import { Alert, BtnPrimary, BtnSecondary, Card, CardTitle, Chip, Field, Layout, Spinner, TextInput, Textarea } from "@/components/ui";
import { WorkoutScreen } from "@/components/WorkoutScreen";

type View = "landing" | "teacher" | "student" | "student-form" | "student-questions" | "workout";

/** The teacher's AI check in progress: what the AI said, and the answers so far. */
interface CheckState extends ClassCheck {
  round: number;
  answers: Answers;
}

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
  equipment: "",
  intensity: "moderate",
  focus: "mixed",
  customPrompt: "",
  summary: "",
  clarifications: [],
};

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
  // Teacher key: the per-class secret that gates saving + reports. Students
  // never see it. `teacherKey` is the one in use (remembered or just issued);
  // `teacherKeyInput` is what a teacher types on a new device.
  const [teacherKey,      setTeacherKey]      = useState("");
  const [teacherKeyInput, setTeacherKeyInput] = useState("");
  const [needsTeacherKey, setNeedsTeacherKey] = useState(false);
  const [issuedKey,       setIssuedKey]       = useState("");
  // AI check: runs on Save when the settings changed since the last confirmed
  // check. `checkedSig` is the signature of the settings the saved summary describes.
  const [check,          setCheck]          = useState<CheckState | null>(null);
  const [checking,       setChecking]       = useState(false);
  const [checkError,     setCheckError]     = useState("");
  const [checkedSig,     setCheckedSig]     = useState("");
  // Teacher's sample-workout preview (never saved).
  const [sample,         setSample]         = useState<Workout | null>(null);
  const [sampleStreaming, setSampleStreaming] = useState(false);
  const [sampleError,    setSampleError]    = useState("");
  const sampleAbortRef = useRef<AbortController | null>(null);
  const [copiedKey,       setCopiedKey]       = useState(false);
  const [report,         setReport]         = useState<string | null>(null);
  const [reportMeta,     setReportMeta]     = useState<ReportMeta | null>(null);
  const [reportMsg,      setReportMsg]      = useState("");
  const [reportLoading,  setReportLoading]  = useState(false);
  const [reportError,    setReportError]    = useState("");

  // Student state
  const [studentCode,    setStudentCode]    = useState("");
  const [studentName,    setStudentName]    = useState("");
  const [fitnessLevel,   setFitnessLevel]   = useState<FitnessLevel>("moderate");
  const [limitations,    setLimitations]    = useState("");
  const [preferences,    setPreferences]    = useState("");
  const [regenerateHistory,   setRegenerateHistory]   = useState<string[]>([]);
  // Streaming generation: the workout fills in event by event; `shareId`
  // arrives last, once the server has saved it. `generation` remounts the
  // workout screen (and its review form) per generation.
  const [streaming,      setStreaming]      = useState(false);
  // Questions the AI asked before building (student-questions view).
  const [questions,      setQuestions]      = useState<AskQuestion[]>([]);
  const [questionAnswers, setQuestionAnswers] = useState<Answers>(NO_ANSWERS);
  // The student's answers, kept for later regenerations of the same workout.
  const [studentAnswers, setStudentAnswers] = useState<QA[]>([]);
  const [shareId,        setShareId]        = useState<string | null>(null);
  const [generation,     setGeneration]     = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Shared
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState("");
  const [workout,        setWorkout]        = useState<Workout | null>(null);

  // /?code=ABC123 (from a shared workout's "Make my own" or a teacher's link)
  // drops the student straight into that class.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code")?.toUpperCase() ?? "";
    if (/^[A-Z0-9]{6}$/.test(code)) {
      // Mount-time URL read: the page is server-rendered as the landing view, so
      // this can't be a lazy initial state without a hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStudentCode(code);
      setView("student");
      void joinWithCode(code);
    }
  }, []);

  // ── Helpers ──────────────────────────────────────────────

  function reset() {
    abortRef.current?.abort();
    setView("landing");
    setError(""); setSaveMsg("");
    setWorkout(null); setShareId(null); setStreaming(false);
    if (window.location.pathname !== "/" || window.location.search) {
      window.history.replaceState(null, "", "/");
    }
    setStudentCode(""); setStudentName(""); setLimitations("");
    setFitnessLevel("moderate");
    setLoadCodeInput("");
    clearTeacherKeyState();
  }

  function clearTeacherKeyState() {
    setTeacherKey(""); setTeacherKeyInput(""); setNeedsTeacherKey(false); setIssuedKey("");
  }

  function cfgSet<K extends keyof ClassConfig>(key: K, value: ClassConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  // ── Teacher actions ───────────────────────────────────────

  function createNewClass() {
    setClassCode(genCode());
    setConfig(DEFAULT_CONFIG);
    setSaveMsg(""); setError("");
    setReport(null); setReportMeta(null); setReportMsg("");
    clearTeacherKeyState();
    clearCheckState("");
  }

  function clearCheckState(sig: string) {
    setCheck(null); setCheckError(""); setCheckedSig(sig);
    sampleAbortRef.current?.abort();
    setSample(null); setSampleStreaming(false); setSampleError("");
  }

  async function loadClass() {
    const code = loadCodeInput.toUpperCase().trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) { setError("Enter a valid 6-character class code."); return; }
    setLoading(true); setError("");
    try {
      const { config: cfg, hasTeacherKey } = await apiGetClass(code);
      setClassCode(code);
      setConfig({ ...DEFAULT_CONFIG, ...cfg });
      // A saved summary describes exactly the settings it was saved with.
      clearCheckState(cfg.summary ? configSignature({ ...DEFAULT_CONFIG, ...cfg }) : "");
      setSaveMsg(""); setIssuedKey("");
      setReport(null); setReportMeta(null); setReportMsg("");
      // This browser may already know the key for this class.
      const remembered = recallTeacherKey(code);
      setTeacherKey(remembered);
      setTeacherKeyInput("");
      setNeedsTeacherKey(hasTeacherKey && !remembered);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }

  /** Returns true when the class was saved. */
  async function saveClass(toSave: ClassConfig = config): Promise<boolean> {
    let ok = false;
    setLoading(true); setError(""); setSaveMsg("");
    try {
      const key = teacherKey || teacherKeyInput;
      const result = await apiSaveClass(classCode, toSave, key);
      if (result.teacherKey) {
        // First save of this class: the server issued the key. Show it once.
        setIssuedKey(result.teacherKey);
        setTeacherKey(result.teacherKey);
        rememberTeacherKey(classCode, result.teacherKey);
      } else if (key && key !== teacherKey) {
        // A typed key was accepted: remember it on this device.
        setTeacherKey(key);
        rememberTeacherKey(classCode, key);
      }
      setNeedsTeacherKey(false);
      setConfig(toSave);
      setSaveMsg("Saved! Share the class code with your students.");
      ok = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
    return ok;
  }

  // ── Teacher AI check ──────────────────────────────────────
  // Save → if the settings changed since the last confirmed check, the AI reads
  // them back and may ask up to three questions. Answers go back for another
  // round (max 3); "Looks right" saves the summary + answers with the class.

  function onSaveClick() {
    if (configSignature(config) === checkedSig) { void saveClass(); return; }
    void runCheck(config, 1);
  }

  async function runCheck(cfg: ClassConfig, round: number) {
    setChecking(true); setCheckError(""); setSaveMsg(""); setError("");
    try {
      const result = await apiClarifyClass(cfg, round);
      setCheck({ ...result, round, answers: NO_ANSWERS });
    } catch (e) {
      setCheck(null);
      setCheckError(e instanceof Error ? e.message : String(e));
    }
    setChecking(false);
  }

  /** Fold answered questions into the class's saved clarifications. */
  function withAnswers(cfg: ClassConfig, answered: QA[]): ClassConfig {
    if (answered.length === 0) return cfg;
    return { ...cfg, clarifications: [...(cfg.clarifications ?? []), ...answered].slice(-6) };
  }

  function sendCheckAnswers() {
    if (!check) return;
    const next = withAnswers(config, collectAnswers(check.questions, check.answers));
    setConfig(next);
    void runCheck(next, check.round + 1);
  }

  async function confirmCheckAndSave() {
    if (!check) return;
    const next = { ...withAnswers(config, collectAnswers(check.questions, check.answers)), summary: check.summary };
    // Keep the confirmed summary in the form even if the save fails (wrong
    // key, network), so a retry doesn't lose it.
    setConfig(next);
    setCheck(null);
    if (await saveClass(next)) setCheckedSig(configSignature(next));
  }

  async function saveWithoutCheck() {
    // The old summary no longer describes these settings, so drop it.
    setCheck(null); setCheckError("");
    await saveClass({ ...config, summary: "" });
  }

  function removeClarification(index: number) {
    setConfig((c) => ({ ...c, clarifications: (c.clarifications ?? []).filter((_, i) => i !== index) }));
  }

  async function previewSample() {
    sampleAbortRef.current?.abort();
    const controller = new AbortController();
    sampleAbortRef.current = controller;
    setSample(EMPTY_WORKOUT); setSampleStreaming(true); setSampleError("");
    let latest: Workout = EMPTY_WORKOUT;
    let failed = "";
    try {
      await apiGenerateWorkoutStream(
        { code: classCode, studentName: "", fitnessLevel: "moderate", limitations: "", preferences: "", regenerateFeedback: "", sample: true },
        (ev) => {
          if (ev.kind === "error") failed = ev.message;
          else if (ev.kind !== "done" && ev.kind !== "question" && ev.kind !== "needs_answers") {
            latest = applyEvent(latest, ev);
            setSample(latest);
          }
        },
        controller.signal
      );
    } catch (e) {
      if (controller.signal.aborted) return;
      failed = e instanceof Error ? e.message : String(e);
    }
    if (controller.signal.aborted) return;
    setSampleStreaming(false);
    if (failed) { setSampleError(failed); if (latest.exercises.length === 0) setSample(null); }
  }

  // ── Student actions ───────────────────────────────────────

  async function joinClass() {
    const code = studentCode.toUpperCase().trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) { setError("Enter a 6-character class code."); return; }
    await joinWithCode(code);
  }

  async function joinWithCode(code: string) {
    setLoading(true); setError("");
    try {
      const { config: cfg } = await apiGetClass(code);
      setConfig(cfg);
      setView("student-form");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }

  async function generateWorkout(feedback = "", opts: { answers?: QA[]; skipQuestions?: boolean } = {}) {
    // Accumulate regenerate feedback so context from earlier regenerations isn't
    // lost; a fresh generation (feedback === "") starts a new history.
    const history = feedback ? [...regenerateHistory, feedback] : [];
    setRegenerateHistory(history);
    // On a regenerate the server loads this workout so the AI edits it and can
    // say what it changed.
    const previousId = feedback ? shareId : null;
    // Answers carry over to regenerations; a fresh generation starts clean.
    const answers = opts.answers ?? (feedback ? studentAnswers : []);
    setStudentAnswers(answers);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError("");
    setWorkout(EMPTY_WORKOUT);
    setShareId(null);
    setStreaming(true);
    setGeneration((g) => g + 1);
    setView("workout");

    let latest: Workout = EMPTY_WORKOUT;
    let failed = "";
    const asked: AskQuestion[] = [];
    let needsAnswers = false;
    try {
      await apiGenerateWorkoutStream(
        {
          code: studentCode.toUpperCase(),
          studentName, fitnessLevel, limitations, preferences,
          regenerateFeedback: history.join("\n"),
          answers,
          skipQuestions: opts.skipQuestions,
          previousId,
        },
        (ev) => {
          if (ev.kind === "done") {
            if (ev.id) {
              setShareId(ev.id);
              // Make refresh and the back button land on the saved workout.
              window.history.replaceState(null, "", `/w/${ev.id}`);
            }
          } else if (ev.kind === "question") {
            asked.push(ev.question);
          } else if (ev.kind === "needs_answers") {
            needsAnswers = true;
          } else if (ev.kind === "error") {
            failed = ev.message;
          } else {
            latest = applyEvent(latest, ev);
            setWorkout(latest);
          }
        },
        controller.signal
      );
    } catch (e) {
      if (controller.signal.aborted) return;
      failed = e instanceof Error ? e.message : String(e);
    }
    if (controller.signal.aborted) return;
    setStreaming(false);
    if (needsAnswers && asked.length > 0) {
      // The AI wants to know something before it builds.
      setWorkout(null);
      setQuestions(asked);
      setQuestionAnswers(NO_ANSWERS);
      setView("student-questions");
      return;
    }
    if (failed) {
      if (latest.exercises.length === 0) {
        // Nothing usable arrived: back to the form with the message.
        setWorkout(null);
        setView("student-form");
      }
      setError(failed);
    }
  }

  async function generateDayReport() {
    setReportLoading(true); setReportError(""); setReport(null); setReportMeta(null); setReportMsg("");
    try {
      const { report: r, meta, message } = await apiGenerateReport(classCode, teacherKey || teacherKeyInput);
      if (!r) { setReportMsg(message || "No reviews yet."); }
      else { setReport(r); setReportMeta(meta ?? null); }
    } catch (e) {
      setReportError(e instanceof Error ? e.message : String(e));
    }
    setReportLoading(false);
  }

  function copyCode() {
    navigator.clipboard.writeText(classCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function copyIssuedKey() {
    navigator.clipboard.writeText(issuedKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 1500);
  }


  // A keyed class loaded on a device that doesn't remember its key: block
  // save/report until the teacher has typed the full 8-character key.
  const keyMissing = needsTeacherKey && teacherKeyInput.replace(/-/g, "").length < 8;

  // ─────────────────────────────────────────────────────────────
  // Views
  // ─────────────────────────────────────────────────────────────

  // ── LANDING ──────────────────────────────────────────────────
  if (view === "landing") return (
    <Layout>
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

        {/* How it works */}
        <div className="flex justify-center gap-0 mb-12 relative">
          {[
            { step: "1", text: "Your teacher sets it up once", muted: true },
            { step: "2", text: "Enter your class code" },
            { step: "3", text: "AI builds a personalized workout" },
            { step: "4", text: "Take it to the floor — print or screenshot your workout" },
          ].map(({ step, text, muted }, i, arr) => (
            <div key={step} className="flex items-center">
              <div className={cn("flex flex-col items-center gap-2 w-[clamp(80px,18vw,130px)]", muted && "opacity-45")}>
                <div className={cn(
                  "w-9 h-9 rounded-full border font-bold text-[15px] flex items-center justify-center shrink-0",
                  muted
                    ? "bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.15)] text-muted"
                    : "bg-[rgba(200,255,0,0.12)] border-[rgba(200,255,0,0.35)] text-accent"
                )}>
                  {step}
                </div>
                <div className="text-[12px] text-muted leading-[1.4] text-center">{text}</div>
              </div>
              {i < arr.length - 1 && (
                <div className="w-[clamp(12px,3vw,28px)] h-px bg-border shrink-0 mb-7" />
              )}
            </div>
          ))}
        </div>

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
    <Layout onBack={reset}>
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
              className="font-display"
              style={{ fontSize: 28, fontWeight: 700, letterSpacing: 6, textAlign: "center" }}
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

          {needsTeacherKey && (
            <Card style={{ borderColor: "var(--accent2)" }}>
              <CardTitle>Teacher Key Required</CardTitle>
              <div className="text-muted text-[14px] leading-[1.5] mb-4">
                This class already has a teacher key. Enter it to change the settings or see reports.
                Students never need this key — only the class code.
              </div>
              <Field label="Teacher Key">
                <TextInput
                  value={teacherKeyInput}
                  onChange={v => setTeacherKeyInput(v.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 9))}
                  placeholder="ABCD-1234"
                  maxLength={9}
                  className="font-display"
                  style={{ fontSize: 24, fontWeight: 700, letterSpacing: 4, textAlign: "center" }}
                />
              </Field>
            </Card>
          )}

          {issuedKey && (
            <div className="bg-surface2 border-[1.5px] border-accent2 rounded-xl p-6 text-center mb-4">
              <div className="text-[11px] font-semibold tracking-[2px] uppercase text-accent2 mb-2">
                Your Teacher Key — write this down
              </div>
              <div className="font-display text-[40px] font-black text-accent2 tracking-[6px] leading-none mb-3">
                {issuedKey}
              </div>
              <div className="text-muted text-[13px] leading-[1.5] max-w-[420px] mx-auto mb-3.5">
                You need it to edit this class or see reports from another device. This browser will
                remember it. Students only need the class code above — never share this key with them.
              </div>
              <button
                onClick={copyIssuedKey}
                className="bg-[rgba(0,229,255,0.1)] border border-[rgba(0,229,255,0.3)] text-accent2 px-5 py-2 rounded-md cursor-pointer text-[13px] font-semibold font-body"
              >
                {copiedKey ? "✓ Copied!" : "Copy Key"}
              </button>
            </div>
          )}

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
              <div className="text-[12px] text-muted mt-1 text-right">
                {config.customPrompt.length}/500
              </div>
            </Field>

            {(config.summary || (config.clarifications?.length ?? 0) > 0) && (
              <Field label="What the AI knows about this class">
                <div className="bg-surface2 border border-border rounded-lg px-4 py-3.5">
                  {config.summary && (
                    <div className="text-[14px] leading-[1.55] mb-1">{config.summary}</div>
                  )}
                  {(config.clarifications ?? []).map((qa, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 border-t border-border pt-2.5 mt-2.5">
                      <div className="text-[13px] leading-[1.45]">
                        <div className="text-muted">{qa.question}</div>
                        <div>{qa.answer}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeClarification(i)}
                        aria-label="Remove this answer"
                        className="text-muted bg-transparent border-0 cursor-pointer text-[16px] leading-none px-1"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </Field>
            )}
          </Card>

          {check ? (
            <Card style={{ borderColor: "var(--accent2)" }}>
              <div className="text-[11px] font-semibold tracking-[2px] uppercase text-accent2 mb-2">
                AI check{check.round > 1 ? ` · round ${check.round}` : ""}
              </div>
              <div className="text-[15px] leading-[1.6] mb-5">{check.summary}</div>
              {check.questions.length > 0 && (
                <div className="mb-5">
                  <div className="text-[12px] font-semibold text-muted uppercase tracking-[0.8px] mb-3">
                    A few things to pin down
                  </div>
                  <QuestionList
                    questions={check.questions}
                    answers={check.answers}
                    onChange={(answers) => setCheck({ ...check, answers })}
                    accent="accent2"
                  />
                </div>
              )}
              {check.questions.length > 0 ? (
                <div className="flex gap-2.5">
                  <BtnSecondary style={{ flex: 1 }} onClick={confirmCheckAndSave} disabled={loading || checking || keyMissing}>
                    Save as is
                  </BtnSecondary>
                  <BtnPrimary
                    style={{ flex: 2 }}
                    onClick={sendCheckAnswers}
                    disabled={checking || collectAnswers(check.questions, check.answers).length === 0}
                  >
                    {checking ? "Checking…" : "Send answers"}
                  </BtnPrimary>
                </div>
              ) : (
                <div className="flex gap-2.5">
                  <BtnSecondary style={{ flex: 1 }} onClick={() => setCheck(null)}>Edit settings</BtnSecondary>
                  <BtnPrimary style={{ flex: 2 }} onClick={confirmCheckAndSave} disabled={loading || keyMissing}>
                    {loading ? "Saving…" : "Looks right — save"}
                  </BtnPrimary>
                </div>
              )}
            </Card>
          ) : (
            <BtnPrimary onClick={onSaveClick} disabled={loading || checking || keyMissing}>
              {checking ? "AI is reading your setup…" : loading ? "Saving…" : "Save Class Settings"}
            </BtnPrimary>
          )}
          {checkError && (
            <>
              <Alert type="error">{checkError}</Alert>
              <BtnSecondary style={{ marginTop: 10 }} onClick={saveWithoutCheck} disabled={loading || keyMissing}>
                Save without the AI check
              </BtnSecondary>
            </>
          )}
          {saveMsg && <Alert type="success">{saveMsg}</Alert>}

          {saveMsg && !sample && (
            <BtnSecondary style={{ marginTop: 12 }} onClick={previewSample}>
              👀 Preview a sample workout
            </BtnSecondary>
          )}
          {sample && (
            <div className="mt-5">
              <div className="flex items-center justify-between mb-3">
                <div className="font-display text-[22px] font-bold uppercase tracking-[1px]">Sample workout</div>
                <button
                  type="button"
                  onClick={() => { sampleAbortRef.current?.abort(); setSample(null); setSampleStreaming(false); }}
                  className="bg-surface2 border border-border text-muted px-3 py-1.5 rounded-lg cursor-pointer text-[13px] font-body"
                >
                  Close
                </button>
              </div>
              <div className="text-muted text-[13px] mb-3">
                What a typical student in this class gets: moderate fitness, no injuries. Not saved.
              </div>
              <WorkoutScreen
                workout={sample}
                code={classCode}
                studentName=""
                shareId={null}
                streaming={sampleStreaming}
                variant="preview"
              />
              {!sampleStreaming && (
                <BtnSecondary onClick={previewSample}>↻ Another sample</BtnSecondary>
              )}
            </div>
          )}
          {sampleError && <Alert type="error">{sampleError}</Alert>}

          {/* Today's report */}
          <div className="mt-8">
            <div className="font-display text-[22px] font-bold uppercase tracking-[1px] mb-3">
              Today&apos;s Workout Report
            </div>
            <BtnSecondary onClick={generateDayReport} disabled={reportLoading || keyMissing}>
              {reportLoading ? "Generating…" : "Generate Today's Report"}
            </BtnSecondary>

            {reportMsg && (
              <div className="text-muted text-[14px] mt-3">{reportMsg}</div>
            )}

            {reportMeta && (
              <div className="flex gap-6 mt-4 mb-2 flex-wrap">
                {[
                  [reportMeta.total, "Responses"],
                  [`${reportMeta.avgRating} / 5`, "Avg Rating"],
                ].map(([val, lbl]) => (
                  <div key={lbl}>
                    <div className="font-display text-[28px] font-bold text-accent2 leading-none">{val}</div>
                    <div className="text-[11px] text-muted uppercase tracking-[0.8px] mt-0.5">{lbl}</div>
                  </div>
                ))}
              </div>
            )}

            {report && (
              <div className="bg-surface2 border border-border rounded-xl p-[18px] mt-2 text-[14px] leading-[1.7] whitespace-pre-wrap">
                {report}
              </div>
            )}

            {reportError && <Alert type="error">{reportError}</Alert>}
          </div>
        </>
      )}

      {error && <Alert type="error">{error}</Alert>}
    </Layout>
  );

  // ── STUDENT: enter code ───────────────────────────────────────
  if (view === "student") return (
    <Layout onBack={reset}>
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
            className="font-display"
            style={{ fontSize: 36, fontWeight: 700, letterSpacing: 8, textAlign: "center" }}
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
    <Layout onBack={reset}>
      {loading ? <Spinner /> : (
        <>
          <div className="font-display text-[42px] font-black uppercase tracking-[-1px] mb-1">
            Let&apos;s Build Your Workout
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

            <Field label="Personal Preferences (optional)">
              <Textarea
                value={preferences}
                onChange={v => setPreferences(v.slice(0, 300))}
                placeholder="e.g. I love music-based exercises, hate running, enjoy partner workouts, prefer bodyweight over weights…"
              />
            </Field>
          </Card>

          <BtnPrimary onClick={() => generateWorkout()} disabled={loading}>
            ⚡ Generate My Workout
          </BtnPrimary>
          {error && <Alert type="error">{error}</Alert>}
        </>
      )}
    </Layout>
  );

  // ── STUDENT: the AI asked before building ─────────────────────
  if (view === "student-questions") return (
    <Layout onBack={() => setView("student-form")}>
      <div className="font-display text-[42px] font-black uppercase tracking-[-1px] mb-1">
        Quick Question
      </div>
      <div className="text-muted text-[15px] mb-8">
        So your workout is safe for you. Tap an answer or type your own.
      </div>
      <Card>
        <QuestionList questions={questions} answers={questionAnswers} onChange={setQuestionAnswers} />
      </Card>
      <div className="flex gap-2.5">
        <BtnSecondary style={{ flex: 1 }} onClick={() => generateWorkout("", { skipQuestions: true })}>
          Skip
        </BtnSecondary>
        <BtnPrimary
          style={{ flex: 2 }}
          onClick={() => generateWorkout("", { answers: collectAnswers(questions, questionAnswers) })}
          disabled={collectAnswers(questions, questionAnswers).length === 0}
        >
          ⚡ Build My Workout
        </BtnPrimary>
      </div>
    </Layout>
  );

  // ── WORKOUT ──────────────────────────────────────────────────
  if (view === "workout" && workout) return (
    <Layout onBack={reset}>
      <WorkoutScreen
        key={generation}
        workout={workout}
        code={studentCode.toUpperCase()}
        studentName={studentName}
        shareId={shareId}
        streaming={streaming}
        onRegenerate={(fb) => generateWorkout(fb)}
      />
      {error && <Alert type="error">{error}</Alert>}
    </Layout>
  );

  return null;
}
