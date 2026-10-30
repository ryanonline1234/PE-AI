"use client";

// The student side of a class: the "how do you feel today" form, the AI's
// quick questions, then the streaming workout. Rendered by /c/[code] after the
// server has checked the signed-in account may use the class, and by
// /teacher/workout with `ownSettings`: a teacher's own workout, where the class
// settings are filled in on the same form and sent with each generation.
// "Same as last time" (docs/04 S3) remembers the fitness level and preferences
// on this device only; injuries are never remembered anywhere.
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { History, Target, Zap } from "lucide-react";
import { apiGenerateWorkoutStream, apiSoloClass } from "@/lib/api";
import { applyEvent } from "@/lib/workout-stream";
import { EMPTY_WORKOUT, type AskQuestion, type ClassConfig, type FitnessLevel, type QA, type Workout } from "@/lib/types";
import { QuestionList, collectAnswers, NO_ANSWERS, type Answers } from "@/components/QuestionList";
import { Alert, BtnPrimary, BtnSecondary, Card, CardTitle, Chip, Field, Layout, Textarea } from "@/components/ui";
import { SettingsFields } from "@/components/SettingsFields";
import { WorkoutScreen } from "@/components/WorkoutScreen";

type View = "form" | "questions" | "workout";

const FITNESS: readonly (readonly [string, FitnessLevel])[] = [["Just starting out", "beginner"], ["Feeling good", "moderate"], ["Let's go hard", "advanced"]];

/** Last time's answers, kept in this browser only (per account, for shared iPads). */
interface LastAnswers { fitnessLevel: FitnessLevel; preferences: string }
const lastKey = (accountId: string) => `peai:last-answers:${accountId}`;

const LAST_CHANGED = "peai:last-answers";

function subscribeLast(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(LAST_CHANGED, onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener(LAST_CHANGED, onChange); };
}

function rawLast(accountId: string): string | null {
  try {
    return localStorage.getItem(lastKey(accountId));
  } catch {
    return null; // Private mode or blocked storage: no "same as last time", nothing breaks.
  }
}

function parseLast(raw: string | null): LastAnswers | null {
  try {
    const v = JSON.parse(raw ?? "null");
    if (v && FITNESS.some(([, f]) => f === v.fitnessLevel) && typeof v.preferences === "string") {
      return { fitnessLevel: v.fitnessLevel, preferences: v.preferences.slice(0, 300) };
    }
  } catch {
    // A damaged entry is ignored and overwritten by the next workout.
  }
  return null;
}

function saveLast(accountId: string, v: LastAnswers) {
  try {
    localStorage.setItem(lastKey(accountId), JSON.stringify(v));
    window.dispatchEvent(new Event(LAST_CHANGED));
  } catch { /* see rawLast */ }
}

export function StudentFlow({ code, label, sessionName, config, firstName, accountId, backHref, hasSportBrief = false, ownSettings = false }: {
  /** null for a teacher's first own workout: the space is created on Generate. */
  code: string | null;
  label: string;
  /** Today's session, when the teacher named it. */
  sessionName?: string | null;
  /** Today's settings: the session's, or the class defaults. Display only; the server re-resolves. */
  config: ClassConfig;
  firstName: string;
  /** Keys "same as last time" to the signed-in account on this device. */
  accountId: string;
  backHref: string;
  /** The student saved a sport brief (docs/03); the server adds it to the prompt. */
  hasSportBrief?: boolean;
  /** A teacher's own workout: the settings are on this form, starting from `config`. */
  ownSettings?: boolean;
}) {
  const router = useRouter();
  const [classCode, setClassCode] = useState(code);
  const [settings, setSettings] = useState<ClassConfig>(config);
  const formPath = ownSettings ? "/teacher/workout" : `/c/${code}`;
  const [view, setView] = useState<View>("form");
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>("moderate");
  const [limitations, setLimitations] = useState("");
  const [preferences, setPreferences] = useState("");
  const [regenerateHistory, setRegenerateHistory] = useState<string[]>([]);
  // This browser's storage; the server render (and hydration) see nothing.
  const lastRaw = useSyncExternalStore(subscribeLast, () => rawLast(accountId), () => null);
  const last = useMemo(() => parseLast(lastRaw), [lastRaw]);

  // Streaming generation: the workout fills in event by event; `shareId`
  // arrives last, once the server has saved it. `generation` remounts the
  // workout screen (and its review form) per generation.
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Questions the AI asked before building, and the answers, which carry over
  // to regenerations of the same workout.
  const [questions, setQuestions] = useState<AskQuestion[]>([]);
  const [questionAnswers, setQuestionAnswers] = useState<Answers>(NO_ANSWERS);
  const [studentAnswers, setStudentAnswers] = useState<QA[]>([]);
  const [error, setError] = useState("");

  function leave() {
    abortRef.current?.abort();
    router.push(backHref);
  }

  async function generateWorkout(feedback = "", opts: { answers?: QA[]; skipQuestions?: boolean; form?: LastAnswers } = {}) {
    // A fresh workout remembers the answers it used, on this device only.
    const form = opts.form ?? { fitnessLevel, preferences };
    if (!feedback) saveLast(accountId, form);
    // Accumulate regenerate feedback so context from earlier regenerations isn't
    // lost; a fresh generation (feedback === "") starts a new history.
    const history = feedback ? [...regenerateHistory, feedback] : [];
    setRegenerateHistory(history);
    // On a regenerate the server loads this workout so the AI edits it and can
    // say what it changed.
    const previousId = feedback ? shareId : null;
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
      // A teacher's first own workout creates their space (one per teacher).
      let useCode = classCode;
      if (!useCode) {
        useCode = (await apiSoloClass()).code;
        setClassCode(useCode);
      }
      await apiGenerateWorkoutStream(
        {
          code: useCode,
          config: ownSettings ? settings : undefined,
          fitnessLevel: form.fitnessLevel, limitations, preferences: form.preferences,
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
      setWorkout(null);
      setQuestions(asked);
      setQuestionAnswers(NO_ANSWERS);
      setView("questions");
      return;
    }
    if (failed) {
      if (latest.exercises.length === 0) {
        setWorkout(null);
        setView("form");
      }
      setError(failed);
    }
  }

  if (view === "questions") return (
    <Layout onBack={() => setView("form")}>
      <h1 className="t-page mb-2">Quick question</h1>
      <div className="text-muted text-[15px] mb-8">So your workout is safe for you. Tap an answer or type your own.</div>
      <Card>
        <QuestionList questions={questions} answers={questionAnswers} onChange={setQuestionAnswers} />
      </Card>
      <div className="flex gap-2.5">
        <BtnSecondary style={{ flex: 1 }} onClick={() => generateWorkout("", { skipQuestions: true })}>Skip</BtnSecondary>
        <BtnPrimary
          style={{ flex: 2 }}
          onClick={() => generateWorkout("", { answers: collectAnswers(questions, questionAnswers) })}
          disabled={collectAnswers(questions, questionAnswers).length === 0}
        >
          <Zap className="icon" /> Build my workout
        </BtnPrimary>
      </div>
    </Layout>
  );

  if (view === "workout" && workout) return (
    <Layout onBack={() => { abortRef.current?.abort(); setView("form"); window.history.replaceState(null, "", formPath); }}>
      <WorkoutScreen
        key={generation}
        workout={workout}
        code={classCode ?? ""}
        studentName={firstName}
        shareId={shareId}
        streaming={streaming}
        onRegenerate={(fb) => generateWorkout(fb)}
      />
      {error && <Alert type="error">{error}</Alert>}
    </Layout>
  );

  return (
    <Layout onBack={leave}>
      <h1 className="t-page mb-2">
        {ownSettings ? "Your own workout" : <>Let&apos;s build your workout</>}
      </h1>
      {ownSettings ? (
        <>
          <div className="text-muted text-[15px] mb-8">Pick the settings, say how you feel, and get a workout just for you.</div>
          <Card>
            <CardTitle>Settings</CardTitle>
            <div className="text-muted text-[13px] leading-[1.5] -mt-3 mb-5">
              Students never see these. In a class you set them once in the class settings, and students only fill
              in the part below.
            </div>
            <SettingsFields config={settings} onChange={(key, value) => setSettings((c) => ({ ...c, [key]: value }))} />
          </Card>
        </>
      ) : (
        <div className={`text-muted text-[15px] ${hasSportBrief ? "mb-2" : "mb-8"}`}>
          <strong className="text-accent">{label}</strong>{sessionName ? ` · ${sessionName}` : ""} · {config.duration} min · {config.intensity} intensity
        </div>
      )}
      {hasSportBrief && (
        <div className="text-muted text-[13px] mb-8 flex items-center gap-1.5">
          <Target className="icon text-accent" /> Your sport goals are included. <Link href="/me" className="text-accent">Edit them</Link>
        </div>
      )}

      {last && (
        <div className="bg-surface border border-[rgba(200,255,0,0.35)] rounded-xl p-4 mb-4">
          <div className="flex items-start gap-3">
            <History className="icon text-accent mt-0.5 !w-5 !h-5" />
            <div className="min-w-0">
              <div className="font-semibold text-[15px]">Same as last time?</div>
              <div className="text-muted text-[13px] mt-0.5 break-words">
                {FITNESS.find(([, f]) => f === last.fitnessLevel)?.[0]}{last.preferences ? ` · “${last.preferences}”` : ""}
              </div>
            </div>
          </div>
          <BtnPrimary
            style={{ marginTop: 12 }}
            onClick={() => { setFitnessLevel(last.fitnessLevel); setPreferences(last.preferences); void generateWorkout("", { form: last }); }}
          >
            <Zap className="icon" /> Build it the same way
          </BtnPrimary>
          <div className="text-[12px] text-muted leading-[1.5] mt-2">
            Injuries are never remembered. If something hurts today, add it in the box below first.
          </div>
        </div>
      )}

      <Card>
        {ownSettings && <CardTitle>About you today</CardTitle>}
        <Field label="How fit do you feel today?">
          <div className="flex flex-wrap gap-2">
            {FITNESS.map(([l,v]) =>
              <Chip key={v} label={l} value={v} current={fitnessLevel} onChange={setFitnessLevel} />
            )}
          </div>
        </Field>

        <Field label="Injuries or limitations (optional)">
          <Textarea
            value={limitations}
            onChange={setLimitations}
            placeholder="e.g. Sprained left ankle, avoid jumping. Leave blank if you're good to go!"
          />
        </Field>

        <Field label="Personal preferences (optional)">
          <Textarea
            value={preferences}
            onChange={v => setPreferences(v.slice(0, 300))}
            placeholder="e.g. I love music-based exercises, hate running, enjoy partner workouts, prefer bodyweight over weights…"
          />
        </Field>
      </Card>

      <BtnPrimary onClick={() => generateWorkout()}><Zap className="icon" /> Generate my workout</BtnPrimary>
      {error && <Alert type="error">{error}</Alert>}
    </Layout>
  );
}
